import asyncio
import time
from typing import Optional, Type, TypeVar
from google import genai
from google.genai import errors
from pydantic import BaseModel

from app.core.config import settings
from app.ai.errors import (
    AIError,
    AIUnavailableError,
    AIRateLimitError,
    AITimeoutError,
    AIValidationError,
    AIProviderError
)

T = TypeVar("T", bound=BaseModel)

class AIGateway:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.semaphore = asyncio.Semaphore(settings.GEMINI_CONCURRENCY)
        
    def _get_model_chain(self, task: str) -> list[str]:
        if task in ("mentor_response", "teacher_response"):
            return getattr(settings, "GEMINI_MENTOR_MODELS", ["gemini-3.5-flash"])
        elif task == "resume_analysis":
            return getattr(settings, "GEMINI_RESUME_MODELS", ["gemini-3.5-flash"])
        elif task in ("roadmap_generation", "weekly_planner", "daily_breakdown"):
            return getattr(settings, "GEMINI_ROADMAP_MODELS", ["gemini-3.5-flash"])
        return getattr(settings, "GEMINI_LIGHT_MODELS", ["gemini-3.5-flash-lite"])

    def _resolve_models(self, task: str, model_override: Optional[str] = None) -> list[str]:
        """The task's fallback chain; a requested model is tried first but never replaces the chain."""
        chain = list(self._get_model_chain(task))
        if model_override:
            return [model_override] + [m for m in chain if m != model_override]
        return chain

    async def generate(
        self,
        task: str,
        prompt: str,
        schema: Optional[Type[T]] = None,
        timeout: Optional[float] = None,
        model_override: Optional[str] = None,
        return_model: bool = False
    ) -> str | T | tuple[str | T, str]:
        if task in ("mentor_response", "teacher_response"):
            default_timeout = 60.0
            max_tokens = 6000
            max_attempts = 2
        elif task in ("resume_analysis", "roadmap_generation", "weekly_planner", "daily_breakdown"):
            default_timeout = 120.0
            max_tokens = 8192
            max_attempts = 2
        elif task == "teaching_intent":
            default_timeout = 5.0
            max_tokens = 64
            max_attempts = 1
        else:
            default_timeout = settings.GEMINI_REQUEST_TIMEOUT
            max_tokens = settings.GEMINI_MAX_TOKENS
            max_attempts = 2
            
        timeout_s = timeout or default_timeout
        
        models = self._resolve_models(task, model_override)
            
        config_kwargs = {
            "temperature": settings.GEMINI_TEMPERATURE,
            "top_p": settings.GEMINI_TOP_P,
            "top_k": settings.GEMINI_TOP_K,
            "max_output_tokens": max_tokens,
        }
        if schema:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_schema"] = schema

        config = genai.types.GenerateContentConfig(**config_kwargs)

        last_error: Optional[Exception] = None

        async with self.semaphore:
            start_time = time.time()
            for current_model in models:
                for attempt in range(max_attempts):
                    try:
                        print(f"[AI Gateway] task={task} model={current_model} attempt={attempt+1}")
                        
                        response = await asyncio.wait_for(
                            asyncio.to_thread(
                                self.client.models.generate_content,
                                model=current_model,
                                contents=prompt,
                                config=config,
                            ),
                            timeout=timeout_s,
                        )

                        if not response.text:
                            raise AIProviderError(f"Model {current_model} returned an empty response.")
                            
                        text_output = response.text.strip()
                        latency = time.time() - start_time
                        
                        if schema:
                            try:
                                validated_obj = schema.model_validate_json(text_output)
                                print(f"[AI Gateway] SUCCESS task={task} model={current_model} latency={latency:.2f}s validated=true")
                                return (validated_obj, current_model) if return_model else validated_obj
                            except Exception as ve:
                                print(f"[AI Gateway] VALIDATION ERROR on {current_model}: {ve}")
                                last_error = AIValidationError(
                                    f"Model {current_model} returned JSON that failed validation against "
                                    f"{schema.__name__}: {ve}"
                                )
                                if attempt < max_attempts - 1:
                                    await asyncio.sleep(1.0)
                                    continue
                                break

                        print(f"[AI Gateway] SUCCESS task={task} model={current_model} latency={latency:.2f}s validated=false")
                        return (text_output, current_model) if return_model else text_output

                    except errors.APIError as e:
                        error_msg = str(e).lower()
                        print(f"[AI Gateway] API error on {current_model}, attempt={attempt+1}: {e}")
                        last_error = AIProviderError(f"{current_model} returned an API error: {e}")

                        if "404" in error_msg or "not_found" in error_msg:
                            print(f"[AI Gateway] MODEL NOT FOUND (404) on {current_model}. Skipping completely.")
                            break
                        if "429" in error_msg or "quota" in error_msg or "exhausted" in error_msg:
                            print(f"[AI Gateway] QUOTA EXHAUSTED (429) on {current_model}. Failing over immediately.")
                            last_error = AIRateLimitError(f"{current_model} rate-limited: {e}")
                            break
                        if "503" in error_msg or "unavailable" in error_msg:
                            print(f"[AI Gateway] MODEL UNAVAILABLE (503) on {current_model}. Failing over immediately.")
                            break

                        if attempt < max_attempts - 1:
                            await asyncio.sleep(1.0)
                            continue
                        else:
                            break

                    except asyncio.TimeoutError:
                        print(f"[AI Gateway] Timeout on {current_model}, attempt={attempt+1}")
                        last_error = AITimeoutError(f"{current_model} timed out after {timeout_s}s")
                        break

                    except Exception as e:
                        print(f"[AI Gateway] Unexpected error on {current_model}: {e}")
                        last_error = e
                        break

        latency = time.time() - start_time
        print(f"[AI Gateway] FAILED task={task} latency={latency:.2f}s last_error={last_error!r}")
        if isinstance(last_error, AIError):
            raise last_error
        raise AIUnavailableError(
            f"All configured AI models are temporarily unavailable or failed. Last error: {last_error}"
        )

    async def generate_stream(
        self,
        task: str,
        prompt: str,
        timeout: float = 60.0,
        model_override: str = None,
    ):
        """
        Async generator that yields text chunks from the model as they arrive.
        Falls through the same model chain as generate().
        Use this for SSE / streaming endpoints.
        """
        if task in ("mentor_response", "teacher_response"):
            max_tokens = 6000
        else:
            max_tokens = settings.GEMINI_MAX_TOKENS

        models = self._resolve_models(task, model_override)

        config = genai.types.GenerateContentConfig(
            temperature=settings.GEMINI_TEMPERATURE,
            top_p=settings.GEMINI_TOP_P,
            top_k=settings.GEMINI_TOP_K,
            max_output_tokens=max_tokens,
        )

        async with self.semaphore:
            for current_model in models:
                try:
                    print(f"[AI Gateway] STREAM task={task} model={current_model}")

                    response = await asyncio.wait_for(
                        self.client.aio.models.generate_content_stream(
                            model=current_model,
                            contents=prompt,
                            config=config,
                        ),
                        timeout=timeout
                    )
                    async for chunk in response:
                        if chunk.text:
                            yield chunk.text
                    return

                except errors.APIError as e:
                    err = str(e).lower()
                    print(f"[AI Gateway] STREAM error on {current_model}: {e}")
                    if any(k in err for k in ("404", "not_found", "429", "quota", "503", "unavailable")):
                        continue
                    raise

                except asyncio.TimeoutError:
                    print(f"[AI Gateway] STREAM timeout on {current_model}")
                    continue

                except Exception as e:
                    print(f"[AI Gateway] STREAM unexpected error: {e}")
                    continue

        raise AIUnavailableError("All models failed during streaming.")


ai_gateway = AIGateway()
