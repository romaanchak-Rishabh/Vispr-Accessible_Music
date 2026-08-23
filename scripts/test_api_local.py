"""Local WSGI smoke test for the Vercel serverless functions (no Vercel CLI needed)."""
import json
import sys
import threading
import urllib.request
from io import BytesIO
from wsgiref.simple_server import make_server

sys.path.insert(0, 'api')

import download as dl_mod
import resolve as res_mod


def call(app_func, path, payload):
    body = json.dumps(payload).encode()
    environ = {
        'REQUEST_METHOD': 'POST',
        'PATH_INFO': path,
        'CONTENT_LENGTH': str(len(body)),
        'CONTENT_TYPE': 'application/json',
        'wsgi.input': BytesIO(body),
    }
    captured = {}

    def start_response(status, headers):
        captured['status'] = status
        captured['headers'] = dict(headers)

    result = app_func(environ, start_response)
    data = b''.join(result)
    return captured['status'], captured['headers'], data


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081

# verify both functions import and respond to OPTIONS
for name, mod in (('resolve', res_mod), ('download', dl_mod)):
    environ = {'REQUEST_METHOD': 'OPTIONS', 'PATH_INFO': f'/api/{name}', 'wsgi.input': BytesIO(b'')}
    out = b''.join(mod.app(environ, lambda s, h: None))
    print(f'{name}: OPTIONS -> {out[:20]!r}')

status, headers, data = call(res_mod.app, '/api/resolve', {'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'})
items = json.loads(data)['items']
print(f'resolve: {status} -> {len(items)} item(s), first title: {items[0]["title"]!r}')

status, headers, data = call(dl_mod.app, '/api/download', {'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'})
print(f'download: {status} -> {round(len(data)/1024/1024, 2)} MB, type={headers.get("Content-Type")}')
print('VERCEL FUNCTION CODE OK' if len(data) > 500000 else 'SUSPICIOUSLY SMALL')
