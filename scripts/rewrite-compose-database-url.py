#!/usr/bin/env python3
"""Rewrite DATABASE_URL in .env for Docker Compose sibling MySQL.

GitHub Secrets often set DATABASE_HOST=localhost / public IP. From inside
`bisa-app`, that host is unreachable — the compose service name is `mysql`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import quote


def get(text: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}=(.*)$", text, re.M)
    if not match:
        return ""
    return match.group(1).strip().strip('"').strip("'")


def set_or_replace(text: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    if re.search(rf"^{re.escape(key)}=", text, re.M):
        return re.sub(rf"^{re.escape(key)}=.*$", line, text, count=1, flags=re.M)
    if not text.endswith("\n"):
        text += "\n"
    return text + line + "\n"


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ".env")
    if not path.exists():
        print(f"ERROR: {path} not found", file=sys.stderr)
        return 1

    text = path.read_text(encoding="utf-8")
    user = get(text, "DATABASE_USER") or "root"
    password = get(text, "DATABASE_PASSWORD")
    name = get(text, "DATABASE_NAME") or "bisa_db"

    if not password:
        print("ERROR: DATABASE_PASSWORD missing in .env", file=sys.stderr)
        return 1

    url = (
        f"mysql://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@mysql:3306/{quote(name, safe='')}"
    )
    text = set_or_replace(text, "DATABASE_URL", url)
    text = set_or_replace(text, "DATABASE_HOST", "mysql")

    redis_url = get(text, "REDIS_URL")
    if not redis_url or "localhost" in redis_url or "127.0.0.1" in redis_url:
        text = set_or_replace(text, "REDIS_URL", "redis://redis:6379")

    path.write_text(text, encoding="utf-8")
    print("DATABASE_URL rewritten for docker-compose host 'mysql'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
