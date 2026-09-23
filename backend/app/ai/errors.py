class AIError(Exception):
    """Base class for all AI exceptions."""
    pass

class AIUnavailableError(AIError):
    """Raised when all configured AI models are unavailable or return 503."""
    pass

class AIRateLimitError(AIError):
    """Raised when the AI provider returns a 429 Rate Limit error."""
    pass

class AITimeoutError(AIError):
    """Raised when the AI provider takes too long to respond."""
    pass

class AIValidationError(AIError):
    """Raised when the AI returns output that fails schema validation."""
    pass

class AIProviderError(AIError):
    """Raised for unexpected provider errors (e.g. 500 internal server error)."""
    pass
