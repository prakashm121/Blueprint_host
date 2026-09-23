import asyncio
import time
from typing import Optional, Type, TypeVar, Any
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
    """
    Centralized Gateway for all AI interactions.
    Handles concurrency limits, retry logic, model fallbacks, 
    JSON schema validation, and logging.
    """
    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.semaphore = asyncio.Semaphore(settings.GEMINI_CONCURRENCY)
        
    async def generate(
        self,
        task: str,
        prompt: str,
        schema: Optional[Type[T]] = None,
        timeout: Optional[float] = None,
        model_override: Optional[str] = None
    ) -> str | T:
        """
        Generates content from the AI provider.
        If schema is provided, the output is parsed and validated against the Pydantic model.
        Returns either a string or the validated Pydantic object.
        """
        timeout_s = timeout or settings.GEMINI_REQUEST_TIMEOUT
        
        # 1. Determine Model Lineup
        primary_model = model_override or settings.GEMINI_PRIMARY_MODEL
        fallback_model = settings.GEMINI_FALLBACK_MODEL
        
        models = [primary_model]
        if fallback_model and fallback_model != primary_model:
            models.append(fallback_model)
            
        # 2. Configure Generation
        config_kwargs = {
            "temperature": settings.GEMINI_TEMPERATURE,
            "top_p": settings.GEMINI_TOP_P,
            "top_k": settings.GEMINI_TOP_K,
            "max_output_tokens": settings.GEMINI_MAX_TOKENS,
        }
        
        if schema:
            config_kwargs["response_mime_type"] = "application/json"
            
        config = genai.types.GenerateContentConfig(**config_kwargs)

        async with self.semaphore:
            start_time = time.time()
            for current_model in models:
                # We attempt exactly 2 times per model for transient errors
                for attempt in range(2):
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
                        
                        # 3. Schema Validation
                        if schema:
                            try:
                                validated_obj = schema.model_validate_json(text_output)
                                print(f"[AI Gateway] SUCCESS task={task} model={current_model} latency={latency:.2f}s validated=true")
                                return validated_obj
                            except Exception as ve:
                                # Validation errors are NOT retried against the same model blindly,
                                # because the prompt might just be bad. We break and maybe try fallback.
                                print(f"[AI Gateway] VALIDATION ERROR on {current_model}: {ve}")
                                raise AIValidationError(f"Failed to validate JSON against {schema.__name__}: {ve}")
                                
                        print(f"[AI Gateway] SUCCESS task={task} model={current_model} latency={latency:.2f}s validated=false")
                        return text_output

                    except errors.ServerError as e:
                        # e.g., 503 Service Unavailable
                        print(f"[AI Gateway] Server error on {current_model}, attempt={attempt+1}: {e}")
                        if attempt == 0:
                            await asyncio.sleep(1.0)
                            continue
                        else:
                            break # Move to fallback model

                    except asyncio.TimeoutError:
                        print(f"[AI Gateway] Timeout on {current_model}, attempt={attempt+1}")
                        if attempt == 0:
                            await asyncio.sleep(0.5)
                            continue
                        else:
                            break
                            
                    except Exception as e:
                        # Unhandled exception, break out of attempt loop
                        print(f"[AI Gateway] Unexpected error on {current_model}: {e}")
                        # Don't break completely, let it try the fallback model if available
                        break

        # If we exit the loops, all models failed
        latency = time.time() - start_time
        print(f"[AI Gateway] FAILED task={task} latency={latency:.2f}s")
        raise AIUnavailableError("All configured AI models are temporarily unavailable or failed.")

# Singleton instance
ai_gateway = AIGateway()
