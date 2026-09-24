import io
import hashlib
import logging
from pdfminer.high_level import extract_text

logger = logging.getLogger("placementos.resume.extractor")

def file_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()

def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        return (extract_text(io.BytesIO(file_bytes)) or "").strip()
    except Exception as e:
        logger.warning("pdfminer failed: %s", e)
        return ""
