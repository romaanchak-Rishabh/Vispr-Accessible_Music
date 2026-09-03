"""GET /api/ping — health check for Vercel serverless."""
import json

def app(environ, start_response):
    body = json.dumps({"ok": True}).encode()
    headers = [
        ("Access-Control-Allow-Origin", "*"),
        ("Content-Type", "application/json"),
        ("Content-Length", str(len(body))),
    ]
    start_response("200 OK", headers)
    return [body]
