"""POST /api/search_v2 — search YouTube via API providers with fallback."""

import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "v2"))

CORS_HEADERS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "POST, OPTIONS"),
    ("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token"),
]

SECRET = os.environ.get("YTDLP_SECRET", "").strip()


def _response(status, body=b"", obj=None):
    ctype = "application/json" if obj is not None else "application/octet-stream"
    if obj is not None:
        body = json.dumps(obj).encode()
    headers = list(CORS_HEADERS) + [("Content-Type", ctype), ("Content-Length", str(len(body)))]
    return str(status), headers, body


def _read_json(environ):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        return json.loads(environ["wsgi.input"].read(length) or b"{}")
    except Exception:
        return None


def _authorized(environ):
    if not SECRET:
        return True
    return environ.get("HTTP_X_AUTH_TOKEN", "") == SECRET


def app(environ, start_response):
    if environ["REQUEST_METHOD"] == "OPTIONS":
        status, headers, body = _response(204)
        start_response(status, headers)
        return [body]

    if not _authorized(environ):
        status, headers, body = _response(401, obj={"error": "unauthorized"})
        start_response(status, headers)
        return [body]

    payload = _read_json(environ)
    query = (payload or {}).get("query", "").strip() if payload else ""
    limit = (payload or {}).get("limit", 10) if payload else 10
    if not query:
        status, headers, body = _response(400, obj={"error": "missing query"})
        start_response(status, headers)
        return [body]

    try:
        from search import search_youtube
        results = search_youtube(query, limit=limit)
        items = [
            {
                "id": r.id,
                "title": r.title,
                "url": r.url,
                "uploader": r.uploader,
                "duration": r.duration,
                "thumbnail": r.thumbnail,
            }
            for r in results
        ]
        status, headers, body = _response(200, obj={"results": items})
    except Exception as exc:
        print(f"[v2/search] failed: {exc}")
        status, headers, body = _response(502, obj={"error": str(exc)})

    start_response(status, headers)
    return [body]
