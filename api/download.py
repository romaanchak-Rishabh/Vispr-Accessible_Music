"""POST /api/download — download a single YouTube video's audio and stream it back."""

import _ytbridge as b


def app(environ, start_response):
    if environ["REQUEST_METHOD"] == "OPTIONS":
        status, headers, body = b.response(204)
        start_response(status, headers)
        return [body]
    if not b.authorized(environ):
        status, headers, body = b.response(401, obj={"error": "unauthorized"})
        start_response(status, headers)
        return [body]

    payload = b.read_json(environ)
    url = (payload or {}).get("url", "").strip() if payload else ""
    if not url:
        status, headers, body = b.response(400, obj={"error": "missing url"})
        start_response(status, headers)
        return [body]

    try:
        data, ext, filename = b.download_audio(url)
    except Exception as exc:  # noqa: BLE001
        status, headers, body = b.response(502, obj={"error": f"yt-dlp failed: {b.clean_err(str(exc))}"})
        start_response(status, headers)
        return [body]

    mime = (
        "audio/mp4" if ext in ("m4a", "mp4")
        else "audio/webm" if ext in ("webm", "opus")
        else "audio/mpeg"
    )
    ascii_name = filename.encode("ascii", "ignore").decode() or f"song.{ext}"
    status, headers, body = b.response(
        200,
        body=data,
        extra_headers=[
            ("Content-Disposition", f"attachment; filename*=UTF-8''{ascii_name}"),
        ],
    )
    # fix mime type for audio payloads
    headers = [(k, mime if k == "Content-Type" else v) for k, v in headers]
    start_response(status, headers)
    return [body]
