"""
Minimal yt-dlp HTTP bridge for the Music PWA.

Endpoints (POST, JSON):
  /api/resolve   { "url": "<youtube video or playlist url>" }
                 -> { "items": [ { "id", "title", "webpage_url", "uploader", "duration", "thumbnail", "playlist_title" } ] }

  /api/resolve_v2 { "url": "<youtube video or playlist url>" }
                 -> same as /api/resolve, but tries API providers first

  /api/info      { "url": "<single youtube video url>" }
                 -> { "description", "tags", "year", "artist", "title" }

  /api/download  { "url": "<single youtube video url>" }
                 -> audio file bytes (m4a/webm)

  /api/download_v2 { "url": "<single youtube video url>", "format": "mp3" }
                 -> audio file bytes, tries API providers first

Auth: set YTDLP_SECRET env var to require header "x-auth-token: <secret>".

V2 API providers (set env vars):
  RAPIDAPI_KEY   RapidAPI key for KvnqPoza, YTStream, Search API

Run locally:
  pip install yt-dlp
  python server/app.py            # listens on :8080

Docker:
  docker build -t music-ytdlp ./server
  docker run -p 8080:8080 -e YTDLP_SECRET=mysecret music-ytdlp
"""

import io
import json
import os
import re
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from yt_dlp import YoutubeDL
except ImportError:
    raise SystemExit("yt-dlp is required: pip install yt-dlp")

SECRET = os.environ.get("YTDLP_SECRET", "").strip()
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def clean_err(msg):
    return ANSI_RE.sub("", msg)
PORT = int(os.environ.get("PORT", "8080"))
AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio[acodec!=none]/best"
MAX_PLAYLIST = 300
# Player clients tried in order (after the default) when YouTube bot-checks us.
# tv / web_safari are currently the least-challenged clients on datacenter IPs;
# visionos (JS-less, no PO token needed) is already tried by yt-dlp's default.
FALLBACK_CLIENTS = [
    c.strip()
    for c in os.environ.get("YTDLP_PLAYER_CLIENT", "tv,web_safari,mweb,android_vr").split(",")
    if c.strip()
]
# Optional anti-bot-check credentials:
#   YTDLP_PO_TOKEN      comma-separated "CLIENT.CONTEXT+TOKEN" entries (e.g. "mweb.gvs+abc123")
#   YTDLP_VISITOR_DATA  visitor_data value captured from a logged-in browser session


def check_auth(headers):
    if not SECRET:
        return True
    return headers.get("X-Auth-Token", "") == SECRET


def _cookie_opts():
    opts = {}
    raw = os.environ.get("YTDLP_COOKIES", "").strip()
    path = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
    from_browser = os.environ.get("YTDLP_COOKIES_FROM_BROWSER", "").strip()
    if raw:
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        f.write(raw.replace("\\n", "\n"))
        f.close()
        opts["cookiefile"] = f.name
    elif path:
        opts["cookiefile"] = path
    elif from_browser:
        parts = from_browser.split(":")
        opts["cookiesfrombrowser"] = tuple(parts)
    return opts


def _po_token_opts():
    """PO token / visitor data extractor args from env (yt-dlp matches them per client itself)."""
    ea = {}
    po = os.environ.get("YTDLP_PO_TOKEN", "").strip()
    if po:
        tokens = [t.strip() for t in po.split(",") if "+" in t]
        if tokens:
            ea["po_token"] = tokens
    vd = os.environ.get("YTDLP_VISITOR_DATA", "").strip()
    if vd:
        ea["visitor_data"] = [vd]
    return ea


def _opts_for(client, extra=None):
    opts = {"quiet": True, "no_warnings": True, "ignoreconfig": True}
    opts.update(_cookie_opts())
    extra = dict(extra or {})
    client_list = [client] if client else None
    ea = extra.pop("extractor_args", {})
    youtube_ea = _po_token_opts()
    if client_list:
        youtube_ea["player_client"] = client_list
    if youtube_ea:
        ea["youtube"] = {**ea.get("youtube", {}), **youtube_ea}
    if ea:
        opts["extractor_args"] = ea
    opts.update(extra)
    return opts


def _run_with_fallback(fn):
    errors = []
    for client in [None] + FALLBACK_CLIENTS:
        try:
            return fn(client)
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            errors.append(f"[{client or 'default'}] {clean_err(msg)}")
            if (
                'Sign in to confirm' in msg
                or 'not a bot' in msg
                or 'playerscripts' in msg
                or 'needs to be reloaded' in msg
                or 'Requested format' in msg
                or 'DRM protected' in msg
            ):
                continue
            raise
    raise RuntimeError(
        "YouTube rejected all player clients (bot-check). "
        "Fix: set YTDLP_COOKIES_FROM_BROWSER=chrome (or firefox/edge), "
        "provide cookies.txt via YTDLP_COOKIES_FILE, or pass a PO token via "
        "YTDLP_PO_TOKEN + YTDLP_VISITOR_DATA. Details: " + " | ".join(errors[-2:])
    )


def normalize_url(url):
    """Radio/auto-generated mixes (list=RD...) expand endlessly; import them as a single video."""
    if "list=RD" in url:
        m = re.search(r"[?&]v=([\w-]{11})", url)
        if m:
            return f"https://www.youtube.com/watch?v={m.group(1)}"
    return url


def _fetch_thumb(video_id):
    if not video_id:
        return None
    for name in ("maxresdefault.jpg", "hqdefault.jpg"):
        try:
            req = urllib.request.Request(
                f"https://i.ytimg.com/vi/{video_id}/{name}",
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                data = r.read()
            if data:
                return data
        except Exception:  # noqa: BLE001
            continue
    return None


def _tag_m4a(path, info):
    """Embed title/artist/album/cover art into an .m4a via mutagen (no ffmpeg needed)."""
    try:
        from mutagen.mp4 import MP4, MP4Cover

        tags = MP4(path)
        if tags.tags is None:
            tags.add_tags()
        t = tags.tags
        title = info.get("title")
        artist = info.get("uploader") or info.get("channel") or info.get("uploader_id")
        album = info.get("playlist_title") or info.get("album")
        if title:
            t["\xa9nam"] = [title]
        if artist:
            t["\xa9ART"] = [artist]
            t["aART"] = [artist]
        if album:
            t["\xa9alb"] = [album]
        cover = _fetch_thumb(info.get("id"))
        if cover:
            t["covr"] = [MP4Cover(cover, imageformat=MP4Cover.FORMAT_JPEG)]
        tags.save()
    except Exception as exc:  # noqa: BLE001
        print("[ytdlp-server] tagging failed:", exc)


def handle_resolve(payload):
    url = normalize_url(payload.get("url", "").strip())
    if not url:
        return 400, {"error": "missing url"}

    def attempt(client):
        opts = _opts_for(client, {"skip_download": True, "extract_flat": "in_playlist", "noplaylist": False})
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info is None:
            raise RuntimeError("yt-dlp returned nothing")
        return _info_to_items(info, url)

    try:
        items = _run_with_fallback(attempt)
    except Exception as exc:  # noqa: BLE001
        return 502, {"error": f"yt-dlp failed: {clean_err(str(exc))}"}
    return 200, {"items": items}


def _info_to_items(info, url):
    playlist_title = info.get("title") if info.get("_type") == "playlist" else None
    entries = info.get("entries") or [info]
    items = []
    for e in entries:
        if e is None:
            continue
        thumbs = e.get("thumbnails") or []
        thumb = thumbs[-1].get("url") if thumbs else None
        items.append(
            {
                "id": e.get("id"),
                "title": e.get("title"),
                "webpage_url": e.get("webpage_url")
                or (f"https://www.youtube.com/watch?v={e['id']}" if e.get("id") else url),
                "uploader": e.get("uploader") or e.get("channel") or e.get("uploader_id"),
                "duration": e.get("duration"),
                "thumbnail": thumb,
                "playlist_title": playlist_title,
            }
        )
        if len(items) >= MAX_PLAYLIST:
            break
    return items


def handle_info(payload):
    """Full (non-flat) extraction of a single video -> { description, tags, year, artist }.

    The /api/resolve endpoint uses extract_flat (fast for playlists), which omits
    description/tags. This endpoint does a full extraction for ONE video so the
    PWA can refine metadata from the YouTube description when iTunes has nothing
    (common for Indian/regional songs).
    """
    url = normalize_url(payload.get("url", "").strip())
    if not url:
        return 400, {"error": "missing url"}

    def attempt(client):
        opts = _opts_for(client, {"skip_download": True, "noplaylist": True})
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info is None:
            raise RuntimeError("yt-dlp returned nothing")
        return info

    try:
        info = _run_with_fallback(attempt)
    except Exception as exc:  # noqa: BLE001
        return 502, {"error": f"yt-dlp failed: {clean_err(str(exc))}"}

    year = None
    for key in ("release_year", "release_date"):
        val = info.get(key)
        if val:
            m = re.search(r"(\d{4})", str(val))
            if m:
                year = int(m.group(1))
                break
    if year is None:
        ud = info.get("upload_date")
        if ud and isinstance(ud, str) and len(ud) >= 4 and ud[:4].isdigit():
            year = int(ud[:4])

    return 200, {
        "description": info.get("description") or "",
        "tags": info.get("tags") or [],
        "year": year,
        "artist": info.get("artist")
        or info.get("album_artist")
        or info.get("creator")
        or info.get("uploader")
        or info.get("channel"),
        "title": info.get("title"),
    }


def handle_download(payload):
    url = normalize_url(payload.get("url", "").strip())
    if not url:
        return None, (400, {"error": "missing url"})
    tmpdir = tempfile.mkdtemp(prefix="ytdlp-")

    def attempt(client):
        opts = _opts_for(
            client,
            {
                "format": AUDIO_FORMAT,
                "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
                "noplaylist": True,
                "max_filesize": 200 * 1024 * 1024,
            },
        )
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
        filename = None
        for f in info.get("requested_formats") or [info]:
            fn = f.get("filepath") or f.get("_filename") or f.get("filename")
            if fn and os.path.exists(fn):
                filename = fn
                break
        if not filename:
            candidates = os.listdir(tmpdir)
            if not candidates:
                raise RuntimeError("download produced no file")
            filename = os.path.join(tmpdir, candidates[0])
        ext = os.path.splitext(filename)[1].lstrip(".") or "m4a"
        if ext in ("m4a", "mp4"):
            _tag_m4a(filename, info)
        with open(filename, "rb") as fh:
            data = fh.read()
        base = "".join(c if c.isalnum() or c in " -_" else "_" for c in (info.get("title") or "song"))
        return ("binary", data, ext, f"{base[:120]}.{ext}")

    try:
        return _run_with_fallback(attempt), None
    except Exception as exc:  # noqa: BLE001
        return None, (502, {"error": f"yt-dlp failed: {clean_err(str(exc))}"})
    finally:
        try:
            for name in os.listdir(tmpdir):
                os.remove(os.path.join(tmpdir, name))
            os.rmdir(tmpdir)
        except OSError:
            pass


def cleanup_dir(path):
    try:
        for name in os.listdir(path):
            os.remove(os.path.join(path, name))
        os.rmdir(path)
    except OSError:
        pass


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token")

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):  # noqa: N802
        if self.path.split("?")[0] == "/api/ping":
            self._json(200, {"ok": True})
            return
        self._json(404, {"error": "not found"})

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        path = self.path.split("?")[0]
        valid = ("/api/resolve", "/api/resolve_v2", "/api/info", "/api/download", "/api/download_v2", "/api/search_v2")
        if path not in valid:
            self._json(404, {"error": "not found"})
            return
        if not check_auth(self.headers):
            self._json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:  # noqa: BLE001
            self._json(400, {"error": "invalid json"})
            return

        # v2 search — search YouTube via API providers
        if path == "/api/search_v2":
            self._handle_search_v2(payload)
            return

        # v2 resolve — try API providers, fallback to yt-dlp
        if path == "/api/resolve_v2":
            status, obj = self._handle_resolve_v2(payload)
            self._json(status, obj)
            return

        if path.startswith("/api/resolve"):
            status, obj = handle_resolve(payload)
            self._json(status, obj)
            return

        if path.startswith("/api/info"):
            status, obj = handle_info(payload)
            self._json(status, obj)
            return

        # v2 download — try API providers, fallback to yt-dlp
        if path == "/api/download_v2":
            self._handle_download_v2(payload)
            return

        result, err = handle_download(payload)
        if err:
            status, obj = err
            self._json(status, obj)
            return
        _, data, ext, filename = result
        mime = "audio/mp4" if ext in ("m4a", "mp4") else "audio/webm" if ext in ("webm", "opus") else "audio/mpeg"
        try:
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", f'attachment; filename*=UTF-8\'\'{filename.encode("ascii", "ignore").decode() or "song." + ext}')
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _handle_search_v2(self, payload):
        """Search YouTube via v2 API providers."""
        query = (payload.get("query") or "").strip()
        limit = payload.get("limit", 10)
        if not query:
            self._json(400, {"error": "missing query"})
            return
        try:
            import sys as _sys
            _v2_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api", "v2")
            if _v2_dir not in _sys.path:
                _sys.path.insert(0, _v2_dir)
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
            self._json(200, {"results": items})
        except Exception as exc:
            print(f"[v2] search failed: {exc}")
            self._json(502, {"error": str(exc)})

    def _handle_resolve_v2(self, payload):
        """Try v2 API providers, fall back to yt-dlp."""
        url = normalize_url(payload.get("url", "").strip())
        if not url:
            return 400, {"error": "missing url"}
        # Try v2
        try:
            import sys as _sys
            _v2_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api", "v2")
            if _v2_dir not in _sys.path:
                _sys.path.insert(0, _v2_dir)
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
                return 200, {"items": items}
        except Exception as exc:
            print(f"[v2] resolve provider failed: {exc}, falling back to yt-dlp")
        # Fallback
        return handle_resolve(payload)

    def _handle_download_v2(self, payload):
        """Try v2 API providers, fall back to yt-dlp."""
        url = normalize_url(payload.get("url", "").strip())
        fmt = payload.get("format", "mp3").strip()
        if not url:
            self._json(400, {"error": "missing url"})
            return
        # Try v2
        try:
            import sys as _sys
            _v2_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api", "v2")
            if _v2_dir not in _sys.path:
                _sys.path.insert(0, _v2_dir)
            from download import download_audio
            data, ext, filename = download_audio(url, fmt=fmt)
            mime = "audio/mp4" if ext in ("m4a", "mp4") else "audio/webm" if ext in ("webm", "opus") else "audio/mpeg"
            try:
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Content-Disposition", f'attachment; filename*=UTF-8\'\'{filename.encode("ascii", "ignore").decode() or "song." + ext}')
                self._cors()
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        except Exception as exc:
            print(f"[v2] download provider failed: {exc}, falling back to yt-dlp")
        # Fallback to v1
        result, err = handle_download(payload)
        if err:
            status, obj = err
            self._json(status, obj)
            return
        _, data, ext, filename = result
        mime = "audio/mp4" if ext in ("m4a", "mp4") else "audio/webm" if ext in ("webm", "opus") else "audio/mpeg"
        try:
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", f'attachment; filename*=UTF-8\'\'{filename.encode("ascii", "ignore").decode() or "song." + ext}')
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, fmt, *args):  # noqa: A003
        print("[ytdlp-server]", fmt % args)


if __name__ == "__main__":
    print(f"yt-dlp bridge listening on :{PORT}" + (" (auth enabled)" if SECRET else ""))
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
