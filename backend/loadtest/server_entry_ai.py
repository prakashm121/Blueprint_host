"""
server_entry_ai.py — Same as server_entry.py, but boots with bootstrap_ai.py
(real Gemini key, lite models only, AI quotas raised). Makes real, billed
Gemini calls — see bootstrap_ai.py's docstring.

Run from backend/:  .venv/Scripts/python.exe -m loadtest.server_entry_ai [port]
"""
import sys

from loadtest import bootstrap_ai  # noqa: E402,F401

import uvicorn  # noqa: E402


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8801
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
