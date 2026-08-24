"""Shared yt-dlp logic for Vercel Python serverless functions (/api/resolve, /api/download)."""

import json
import os
import re
import tempfile
import urllib.request

from yt_dlp import YoutubeDL

SECRET = os.environ.get("YTDLP_SECRET", "").strip()
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def clean_err(msg):
    return ANSI_RE.sub("", msg)

# Prefer smaller streams (~<=130 kbps): Vercel serverless functions buffer responses
# and cap them around 4.5 MB, so full-quality audio would fail for many tracks.
AUDIO_FORMAT = os.environ.get(
    "YTDLP_AUDIO_FORMAT",
    "bestaudio[ext=m4a][abr<=130]/bestaudio[ext=m4a]/bestaudio[acodec!=none]/best",
)
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

CORS_HEADERS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "POST, OPTIONS"),
    ("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token"),
]


def _cookie_opts():
    """Cookie sources: YTDLP_COOKIES (content), YTDLP_COOKIES_FILE (path), YTDLP_COOKIES_FROM_BROWSER (e.g. chrome)."""
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


def _log_config():
    """One-time diagnostic so deployments can be verified from function logs."""
    parts = []
    raw = os.environ.get("YTDLP_COOKIES", "").strip()
    if raw:
        expanded = raw.replace("\\n", "\n")
        n_cookies = sum(1 for ln in expanded.splitlines() if "\t" in ln)
        has_header = expanded.startswith("#")
        parts.append(f"YTDLP_COOKIES set ({len(raw)} chars, {n_cookies} cookie lines, header={'yes' if has_header else 'MISSING'})")
    if os.environ.get("YTDLP_COOKIES_FILE"):
        parts.append("YTDLP_COOKIES_FILE set")
    if os.environ.get("YTDLP_COOKIES_FROM_BROWSER"):
        parts.append("YTDLP_COOKIES_FROM_BROWSER set")
    if _po_token_opts():
        parts.append("PO token/visitor_data set")
    print("[ytbridge] config:", "; ".join(parts) if parts else "NO CREDENTIALS CONFIGURED")


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


_log_config()


def _opts_for(client, extra=None):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "ignoreconfig": True,
    }
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
    """Run fn(client) trying the default then fallback player clients."""
    errors = []
    for client in [None] + FALLBACK_CLIENTS:
        try:
            return fn(client)
        except Exception as exc:  # noqa: BLE001
            msg = clean_err(str(exc))
            errors.append(f"[{client or 'default'}] {clean_err(msg)}")
            if (
                'Sign in to confirm' in msg
                or 'not a bot' in msg
                or 'playerscripts' in msg
                or 'needs to be reloaded' in msg
                or 'Requested format' in msg
                or 'DRM protected' in msg
            ):
                continue  # worth retrying with another client
            raise
    raise RuntimeError(
        "YouTube rejected all player clients (bot-check). "
        "Fix: log into YouTube in your browser and set YTDLP_COOKIES_FROM_BROWSER=chrome "
        "(or firefox/edge), provide cookies.txt via YTDLP_COOKIES_FILE, or pass a PO token "
        "via YTDLP_PO_TOKEN + YTDLP_VISITOR_DATA. Details: "
        + " | ".join(errors[-2:])
    )


def response(status, body=b"", obj=None, extra_headers=None):
    """Build a WSGI (status, headers, body) tuple."""
    ctype = "application/json" if obj is not None else "application/octet-stream"
    if obj is not None:
        body = json.dumps(obj).encode()
    headers = list(CORS_HEADERS) + [("Content-Type", ctype), ("Content-Length", str(len(body)))]
    if extra_headers:
        headers += extra_headers
    return str(status), headers, body


def read_json(environ):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        return json.loads(environ["wsgi.input"].read(length) or b"{}")
    except Exception:  # noqa: BLE001
        return None


def authorized(environ):
    if not SECRET:
        return True
    return environ.get("HTTP_X_AUTH_TOKEN", "") == SECRET


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
        print("[ytbridge] tagging failed:", exc)


def resolve_items(url):
    url = normalize_url(url)
    def attempt(client):
        opts = _opts_for(
            client,
            {"skip_download": True, "extract_flat": "in_playlist", "noplaylist": False},
        )
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info is None:
            raise RuntimeError("yt-dlp returned nothing")
        return _info_to_items(info, url)

    return _run_with_fallback(attempt)


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


def download_audio(url):
    """Returns (data, ext, filename)."""
    url = normalize_url(url)
    tmpdir = tempfile.mkdtemp(prefix="ytdlp-")

    def attempt(client):
        extra = {
            "format": AUDIO_FORMAT,
            "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
            "noplaylist": True,
            "max_filesize": 200 * 1024 * 1024,
        }
        opts = _opts_for(client, extra)
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            data, ext, fname = _collect_downloaded(info, tmpdir)
            # keep tmpdir alive for caller cleanup; delete handled in finally below
            return data, ext, fname

    try:
        return _run_with_fallback(attempt)
    finally:
        try:
            for name in os.listdir(tmpdir):
                os.remove(os.path.join(tmpdir, name))
            os.rmdir(tmpdir)
        except OSError:
            pass


def _collect_downloaded(info, tmpdir):
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
    return data, ext, f"{base[:120]}.{ext}"
