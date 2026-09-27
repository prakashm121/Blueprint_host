import asyncio
import time
from enum import Enum
from typing import Any, Optional

from google import genai
from google.genai import errors, types

from app.core.config import settings
from app.services.resume.schemas import ResumeFeedback


class AIError(Exception):
    pass


class AIProviderError(AIError):
    pass


class AIRateLimitError(AIProviderError):
    pass


class AITimeoutError(AIError):
    pass


class AIValidationError(AIError):
    pass


class AIUnavailableError(AIError):
    pass


class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class ModelHealth:
    def __init__(self):
        self.state: CircuitState = CircuitState.CLOSED
        self.failure_count: int = 0
        self.opened_at: float = 0.0
        self.cooldown_until: float = 0.0
        self.last_success: float = 0.0
        self.last_failure: float = 0.0


class HealthTracker:
    def __init__(self):
        self._health: dict[str, ModelHealth] = {}
        self._lock = asyncio.Lock()

        self.COOLDOWNS = {
            "503": 60.0,
            "429": 60.0,
            "TIMEOUT": 60.0,
            "CONNECTION": 60.0,
            "404": 300.0,  # 5 min cooldown, but fully recoverable
            "DEFAULT": 60.0,
        }

    def _get_health(self, model: str) -> ModelHealth:
        if model not in self._health:
            self._health[model] = ModelHealth()

        return self._health[model]

    async def is_available(self, model: str) -> bool:
        async with self._lock:
            h = self._get_health(model)

            if h.state == CircuitState.CLOSED:
                return True

            if h.state == CircuitState.OPEN:
                if time.monotonic() >= h.cooldown_until:
                    h.state = CircuitState.HALF_OPEN

                    print(
                        f"[CircuitBreaker] {model} cooldown expired. "
                        "State -> HALF_OPEN (Probing)"
                    )

                    return True

                return False

            if h.state == CircuitState.HALF_OPEN:
                # Another request is already probing.
                return False

            return False

    async def record_success(self, model: str):
        async with self._lock:
            h = self._get_health(model)

            h.last_success = time.time()

            if h.state != CircuitState.CLOSED:
                h.state = CircuitState.CLOSED
                h.failure_count = 0

                print(
                    f"[CircuitBreaker] {model} probe SUCCEEDED. "
                    "State -> CLOSED"
                )

    async def record_failure(self, model: str, error_type: str):
        async with self._lock:
            h = self._get_health(model)

            h.last_failure = time.time()
            h.failure_count += 1

            cooldown_s = self.COOLDOWNS.get(
                error_type,
                self.COOLDOWNS["DEFAULT"],
            )

            h.state = CircuitState.OPEN
            h.opened_at = time.monotonic()
            h.cooldown_until = h.opened_at + cooldown_s

            print(
                f"[CircuitBreaker] {model} FAILED ({error_type}). "
                f"State -> OPEN for {cooldown_s}s"
            )


class AIGateway:
    def __init__(self):
        self.client = genai.Client(
            api_key=settings.GEMINI_API_KEY
        )

        self.semaphore = asyncio.Semaphore(
            settings.GEMINI_CONCURRENCY
        )

        self.health = HealthTracker()

    def _resolve_models(
        self,
        task: str,
        model_override: str = None,
    ) -> list[str]:
        if model_override:
            return [model_override]

        if task == "resume_analysis":
            return settings.GEMINI_RESUME_MODELS

        elif task == "roadmap_generation":
            return settings.GEMINI_ROADMAP_MODELS

        elif task == "quiz_generation":
            base_models = settings.GEMINI_MENTOR_MODELS
            light_models = getattr(settings, "GEMINI_LIGHT_MODELS", [])
            combined = []
            for m in (light_models + base_models):
                if m not in combined:
                    combined.append(m)
            return combined

        elif task in (
            "mentor_response",
            "teaching_intent",
            "teacher_response",
            "dsa",
            "interview_qa",
        ):
            # Combine both lists so it tries premium models first, then falls back to lite
            base_models = settings.GEMINI_MENTOR_MODELS
            light_models = getattr(settings, "GEMINI_LIGHT_MODELS", [])
            
            # Deduplicate while preserving order
            combined = []
            for m in (base_models + light_models):
                if m not in combined:
                    combined.append(m)
                    
            return combined

        return [settings.GEMINI_MODEL]

    def _classify_error(
        self,
        e: Exception,
    ) -> Optional[str]:
        # Try structured status codes first.
        status_code = getattr(
            e,
            "code",
            getattr(e, "status", None),
        )

        if status_code == 404:
            return "404"

        if status_code == 429:
            return "429"

        if status_code == 503:
            return "503"

        # Fall back to string parsing if the SDK
        # doesn't expose a clean property.
        err_str = str(e).lower()

        if "404" in err_str or "not_found" in err_str:
            return "404"

        if (
            "429" in err_str
            or "quota" in err_str
            or "exhausted" in err_str
        ):
            return "429"

        if "503" in err_str or "unavailable" in err_str:
            return "503"

        if "timeout" in err_str:
            return "TIMEOUT"

        if "connection" in err_str:
            return "CONNECTION"

        return None

    async def generate(
        self,
        task: str,
        prompt: str,
        schema: Any = None,
        timeout: float = None,
        model_override: str = None,
        return_model: bool = False,
    ) -> Any:
        if task == "resume_analysis":
            default_timeout = 180.0
            max_tokens = 8192
            max_attempts = 3

        elif task == "teaching_intent":
            default_timeout = 30.0
            max_tokens = settings.GEMINI_MAX_TOKENS
            max_attempts = 1

        else:
            default_timeout = settings.GEMINI_REQUEST_TIMEOUT
            max_tokens = settings.GEMINI_MAX_TOKENS
            max_attempts = 2

        timeout_s = timeout or default_timeout
        request_deadline = time.monotonic() + timeout_s

        models = self._resolve_models(
            task,
            model_override,
        )

        config_kwargs = {
            "temperature": settings.GEMINI_TEMPERATURE,
            "top_p": settings.GEMINI_TOP_P,
            "top_k": settings.GEMINI_TOP_K,
            "max_output_tokens": max_tokens,
        }

        if schema:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_schema"] = schema

        config = genai.types.GenerateContentConfig(
            **config_kwargs
        )

        last_error: Optional[Exception] = None
        start_time_total = time.time()

        for current_model in models:
            for attempt in range(max_attempts):
                if time.monotonic() > request_deadline:
                    raise AITimeoutError(
                        f"Request budget of {timeout_s}s exceeded."
                    )

                if not await self.health.is_available(current_model):
                    print(
                        f"[AI Gateway] {current_model} "
                        "SKIPPED (unhealthy)"
                    )
                    break

                try:
                    print(
                        f"[AI Gateway] task={task} "
                        f"model={current_model} "
                        f"attempt={attempt + 1}"
                    )

                    async with self.semaphore:
                        # TTFT (Time To First Token) Timeout strategy
                        # We use streaming internally to detect if a model is stuck in queue.
                        ttft_timeout = 30.0 if task in ("quiz_generation", "mentor_response", "teacher_response", "interview_qa") else timeout_s
                        time_left = max(1.0, request_deadline - time.monotonic())
                        ttft_timeout = min(ttft_timeout, time_left)

                        stream_response = await self.client.aio.models.generate_content_stream(
                            model=current_model,
                            contents=prompt,
                            config=config,
                        )
                        
                        full_text = []
                        first_chunk_received = False
                        
                        stream_iterator = stream_response.__aiter__()
                        
                        try:
                            # 1. Wait for the FIRST chunk with a strict TTFT timeout
                            first_chunk = await asyncio.wait_for(stream_iterator.__anext__(), timeout=ttft_timeout)
                            if first_chunk.text:
                                first_chunk_received = True
                                full_text.append(first_chunk.text)
                        except StopAsyncIteration:
                            pass
                        except asyncio.TimeoutError:
                            raise asyncio.TimeoutError("TTFT Timeout: Model stuck in queue")
                            
                        # 2. If the first chunk arrived, the model is healthy and actively generating.
                        # We now give it the full remaining budget to finish the large payload.
                        if first_chunk_received:
                            time_left_for_rest = max(1.0, request_deadline - time.monotonic())
                            
                            async def consume_rest():
                                async for chunk in stream_iterator:
                                    if chunk.text:
                                        full_text.append(chunk.text)
                                        
                            await asyncio.wait_for(consume_rest(), timeout=time_left_for_rest)
                            
                        class FakeResponse:
                            text = "".join(full_text)
                            
                        response = FakeResponse()

                    if not response.text:
                        raise AIProviderError(
                            f"Model {current_model} "
                            "returned an empty response."
                        )

                    text_output = response.text.strip()
                    latency = time.time() - start_time_total

                    if schema:
                        try:
                            if text_output.startswith("```"):
                                text_output = "\n".join(text_output.split("\n")[1:-1]).strip()
                            if "{" in text_output and "}" in text_output:
                                text_output = text_output[text_output.find("{"):text_output.rfind("}")+1]
                                
                            validated_obj = schema.model_validate_json(
                                text_output
                            )

                            print(
                                f"[AI Gateway] SUCCESS "
                                f"task={task} "
                                f"model={current_model} "
                                f"latency={latency:.2f}s "
                                "validated=true"
                            )

                            await self.health.record_success(
                                current_model
                            )

                            return (
                                (validated_obj, current_model)
                                if return_model
                                else validated_obj
                            )

                        except Exception as ve:
                            print(
                                f"[AI Gateway] VALIDATION ERROR "
                                f"on {current_model}: {ve}"
                            )

                            last_error = AIValidationError(
                                f"Model {current_model} returned JSON "
                                f"that failed validation against "
                                f"{schema.__name__}: {ve}"
                            )

                            if attempt < max_attempts - 1:
                                await asyncio.sleep(1.0)
                                continue

                            break

                    print(
                        f"[AI Gateway] SUCCESS "
                        f"task={task} "
                        f"model={current_model} "
                        f"latency={latency:.2f}s "
                        "validated=false"
                    )

                    await self.health.record_success(
                        current_model
                    )

                    return (
                        (text_output, current_model)
                        if return_model
                        else text_output
                    )

                except errors.APIError as e:
                    print(
                        f"[AI Gateway] API error on "
                        f"{current_model}, "
                        f"attempt={attempt + 1}: {e}"
                    )

                    last_error = AIProviderError(
                        f"{current_model} returned an API error: {e}"
                    )

                    error_type = self._classify_error(e)

                    if error_type:
                        await self.health.record_failure(
                            current_model,
                            error_type,
                        )
                        break

                    # Non-circuit-breaking error
                    # such as 400 Bad Request.
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(1.0)
                        continue

                    break

                except asyncio.TimeoutError:
                    print(
                        f"[AI Gateway] Timeout on "
                        f"{current_model}, "
                        f"attempt={attempt + 1}"
                    )

                    last_error = AITimeoutError(
                        f"{current_model} timed out"
                    )

                    await self.health.record_failure(
                        current_model,
                        "TIMEOUT",
                    )

                    break

                except Exception as e:
                    print(
                        f"[AI Gateway] Unexpected error "
                        f"on {current_model}: {e}"
                    )

                    last_error = e
                    break

        latency = time.time() - start_time_total

        print(
            f"[AI Gateway] FAILED "
            f"task={task} "
            f"latency={latency:.2f}s "
            f"last_error={last_error!r}"
        )

        if isinstance(last_error, AIError):
            raise last_error

        raise AIUnavailableError(
            "All configured AI models are temporarily "
            "unavailable or failed. "
            f"Last error: {last_error}"
        )

    async def generate_stream(
        self,
        task: str,
        prompt: str,
        timeout: float = 60.0,
        model_override: str = None,
    ):
        if task in ("mentor_response", "teacher_response"):
            max_tokens = 6000
        else:
            max_tokens = settings.GEMINI_MAX_TOKENS

        models = self._resolve_models(
            task,
            model_override,
        )

        request_deadline = time.monotonic() + timeout

        config_kwargs = {
            "temperature": settings.GEMINI_TEMPERATURE,
            "top_p": settings.GEMINI_TOP_P,
            "top_k": settings.GEMINI_TOP_K,
            "max_output_tokens": max_tokens,
        }
        
        if task in ("mentor_response", "teacher_response"):
            # Set low thinking for latency-sensitive chat responses
            config_kwargs["thinking_config"] = {"thinking_level": "low"}
            
        config = genai.types.GenerateContentConfig(**config_kwargs)

        for current_model in models:
            if time.monotonic() > request_deadline:
                raise AITimeoutError(
                    "Request budget exceeded."
                )

            if not await self.health.is_available(current_model):
                print(
                    f"[AI Gateway] STREAM SKIPPED "
                    f"{current_model} (unhealthy)"
                )
                continue

            try:
                print(
                    f"[AI Gateway] STREAM "
                    f"task={task} "
                    f"model={current_model}"
                )

                async with self.semaphore:
                    stream_start_time = time.monotonic()
                    
                    ttft_timeout = 30.0 if task in ("quiz_generation", "mentor_response", "teacher_response", "interview_qa") else timeout
                    time_left = max(1.0, request_deadline - time.monotonic())
                    ttft_timeout = min(ttft_timeout, time_left)

                    stream_response = await self.client.aio.models.generate_content_stream(
                        model=current_model,
                        contents=prompt,
                        config=config,
                    )

                    got_first_token = False
                    stream_iterator = stream_response.__aiter__()
                    
                    try:
                        first_chunk = await asyncio.wait_for(stream_iterator.__anext__(), timeout=ttft_timeout)
                        if first_chunk.text:
                            got_first_token = True
                            ttft = time.monotonic() - stream_start_time
                            print(f"[Latency] TTFT (Time To First Token) for {current_model}: {ttft:.3f}s")
                            await self.health.record_success(current_model)
                            yield first_chunk.text
                    except StopAsyncIteration:
                        pass
                    except asyncio.TimeoutError:
                        raise asyncio.TimeoutError("TTFT Timeout: Model stuck in queue")
                        
                    if got_first_token:
                        time_left_for_rest = max(1.0, request_deadline - time.monotonic())
                        
                        async def consume_rest():
                            async for chunk in stream_iterator:
                                if chunk.text:
                                    yield chunk.text
                                    
                        async for chunk_text in consume_rest():
                            yield chunk_text

                return

            except errors.APIError as e:
                print(
                    f"[AI Gateway] STREAM error "
                    f"on {current_model}: {e}"
                )

                error_type = self._classify_error(e)

                if error_type:
                    await self.health.record_failure(
                        current_model,
                        error_type,
                    )

                continue

            except asyncio.TimeoutError:
                print(
                    f"[AI Gateway] STREAM timeout "
                    f"on {current_model}"
                )

                await self.health.record_failure(
                    current_model,
                    "TIMEOUT",
                )

                continue

            except Exception as e:
                print(
                    f"[AI Gateway] STREAM unexpected "
                    f"error: {e}"
                )

                continue

        raise AIUnavailableError(
            "All models failed during streaming."
        )


ai_gateway = AIGateway()