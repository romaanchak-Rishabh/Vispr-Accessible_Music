"""POST /api/resolve — expand a YouTube video/playlist URL into track metadata."""

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
        items = b.resolve_items(url)
        status, headers, body = b.response(200, obj={"items": items})
    except Exception as exc:  # noqa: BLE001
        status, headers, body = b.response(502, obj={"error": f"yt-dlp failed: {b.clean_err(str(exc))}"})
    start_response(status, headers)
    return [body]
