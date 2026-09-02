"""POST /api/download_v2 — multi-provider audio download with fallback to yt-dlp."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "v2"))

import json  # noqa: E402

CORS_HEADERS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "POST, OPTIONS"),
    ("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token"),
]

SECRET = os.environ.get("YTDLP_SECRET", "").strip()


def _response(status, body=b"", obj=None, extra_headers=None):
    ctype = "application/json" if obj is not None else "application/octet-stream"
    if obj is not None:
        body = json.dumps(obj).encode()
    headers = list(CORS_HEADERS) + [("Content-Type", ctype), ("Content-Length", str(len(body)))]
    if extra_headers:
        headers += extra_headers
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
    url = (payload or {}).get("url", "").strip() if payload else ""
    fmt = (payload or {}).get("format", "mp3").strip() if payload else "mp3"
    if not url:
        status, headers, body = _response(400, obj={"error": "missing url"})
        start_response(status, headers)
        return [body]

    # Try v2 providers first
    try:
        from download import download_audio
        data, ext, filename = download_audio(url, fmt=fmt)
        mime = (
            "audio/mp4" if ext in ("m4a", "mp4")
            else "audio/webm" if ext in ("webm", "opus")
            else "audio/mpeg"
        )
        ascii_name = filename.encode("ascii", "ignore").decode() or f"song.{ext}"
        status, headers, body = _response(
            200,
            body=data,
            extra_headers=[
                ("Content-Disposition", f"attachment; filename*=UTF-8''{ascii_name}"),
            ],
        )
        headers = [(k, mime if k == "Content-Type" else v) for k, v in headers]
        start_response(status, headers)
        return [body]
    except Exception as exc:
        print(f"[v2/download] providers failed: {exc}, falling back to yt-dlp")

    # Fallback to v1 yt-dlp
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from _ytbridge import download_audio as ytdlp_download, response as ytdlp_response
        data, ext, filename = ytdlp_download(url)
        mime = (
            "audio/mp4" if ext in ("m4a", "mp4")
            else "audio/webm" if ext in ("webm", "opus")
            else "audio/mpeg"
        )
        ascii_name = filename.encode("ascii", "ignore").decode() or f"song.{ext}"
        status, headers, body = ytdlp_response(
            200,
            body=data,
            extra_headers=[
                ("Content-Disposition", f"attachment; filename*=UTF-8''{ascii_name}"),
            ],
        )
        headers = [(k, mime if k == "Content-Type" else v) for k, v in headers]
        start_response(status, headers)
        return [body]
    except Exception as exc2:
        from _ytbridge import clean_err
        status, headers, body = _response(
            502, obj={"error": f"All providers failed. yt-dlp: {clean_err(str(exc2))}"}
        )
        start_response(status, headers)
        return [body]
