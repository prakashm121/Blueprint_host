"""
server_entry.py — Runs the real app (main:app) exactly as start.sh does
(`uvicorn main:app`, same code, same DB pool settings), just pointed at the
local SQLite file and local Supabase stub via loadtest/bootstrap.py.

Run from backend/:  .venv/Scripts/python.exe -m loadtest.server_entry [port]
"""
import sys

from loadtest import bootstrap  # noqa: E402  (sets env + patches PG-only types before `main` is imported)

import uvicorn  # noqa: E402


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    # log_level=warning: a 2000+ req/min test would otherwise drown in access logs.
    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
