"""POST /api/resolve_v2 — multi-provider URL resolve with fallback to yt-dlp."""

import os
import sys
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "v2"))

import json  # noqa: E402

CORS_HEADERS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "POST, OPTIONS"),
    ("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token"),
]

SECRET = os.environ.get("YTDLP_SECRET", "").strip()
MAX_PLAYLIST = 300


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


def _normalize_url(url):
    if "list=RD" in url:
        m = re.search(r"[?&]v=([\w-]{11})", url)
        if m:
            return f"https://www.youtube.com/watch?v={m.group(1)}"
    return url


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
    url = (payload or {}).get("url", "").strip() if payload else ""
    if not url:
        status, headers, body = _response(400, obj={"error": "missing url"})
        start_response(status, headers)
        return [body]

    url = _normalize_url(url)

    # Try v2 search/resolve provider first
    try:
        from search import resolve_url
        results = resolve_url(url)
        if results:
            items = [
                {
                    "id": r.id,
                    "title": r.title,
                    "webpage_url": r.url,
                    "uploader": r.uploader,
                    "duration": r.duration,
                    "thumbnail": r.thumbnail,
                    "playlist_title": None,
                }
                for r in results[:MAX_PLAYLIST]
            ]
            status, headers, body = _response(200, obj={"items": items})
            start_response(status, headers)
            return [body]
    except Exception as exc:
        print(f"[v2/resolve] provider failed: {exc}, falling back to yt-dlp")

    # Fallback to v1 yt-dlp
    try:
        from _ytbridge import resolve_items as ytdlp_resolve
        items = ytdlp_resolve(url)
        status, headers, body = _response(200, obj={"items": items})
        start_response(status, headers)
        return [body]
    except Exception as exc2:
        from _ytbridge import clean_err
        status, headers, body = _response(
            502, obj={"error": f"All providers failed. yt-dlp: {clean_err(str(exc2))}"}
        )
        start_response(status, headers)
        return [body]
