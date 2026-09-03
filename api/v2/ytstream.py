"""YTStream (ytjar) — download provider (returns CDN URLs, not hosted files)."""

from __future__ import annotations

import re
import urllib.request
import json

from providers import (
    ProviderError,
    DownloadResult,
    _rapidapi_get,
    register_download_provider,
)

HOST = "ytstream-download-youtube-videos.p.rapidapi.com"


@register_download_provider
class YTStreamProvider:
    name = "ytstream"
    priority = 1  # primary — CDN URLs work from server

    def download(self, url: str, fmt: str = "mp3") -> DownloadResult:
        """Get stream URLs from YTStream. Returns the best matching CDN link."""
        vid = self._extract_id(url)
        if not vid:
            raise ProviderError(self.name, f"could not extract video ID from {url}")

        try:
            data = _rapidapi_get(HOST, "/dl", params={"id": vid}, timeout=30)
        except Exception as exc:
            raise ProviderError(self.name, f"dl failed: {exc}") from exc

        if data.get("error"):
            raise ProviderError(self.name, data["error"])

        title = data.get("title", "")
        # Audio streams live in adaptiveFormats, not formats
        adaptive = data.get("adaptiveFormats") or []
        combined = data.get("formats") or []
        all_streams = adaptive + combined

        # Pick the right format
        if fmt == "mp3":
            # Look for audio-only streams in adaptiveFormats
            audio_streams = [f for f in adaptive if f.get("mimeType", "").startswith("audio/")]
            if audio_streams:
                best = max(audio_streams, key=lambda f: f.get("bitrate", 0))
                stream_url = best.get("url", "")
            else:
                # Fallback: use combined stream (has audio + video)
                if combined:
                    best = combined[0]
                    stream_url = best.get("url", "")
                else:
                    raise ProviderError(self.name, "no audio streams found")
        else:
            # Video — pick highest quality mp4
            mp4_streams = [f for f in all_streams if "video/mp4" in f.get("mimeType", "")]
            if mp4_streams:
                best = max(mp4_streams, key=lambda f: f.get("height", 0))
                stream_url = best.get("url", "")
            else:
                video_streams = [f for f in all_streams if f.get("mimeType", "").startswith("video/")]
                if video_streams:
                    best = max(video_streams, key=lambda f: f.get("height", 0))
                    stream_url = best.get("url", "")
                else:
                    raise ProviderError(self.name, "no video streams found")

        if not stream_url:
            raise ProviderError(self.name, "no download URL in response")

        ext = "mp3" if fmt == "mp3" else "mp4"
        return DownloadResult(
            url=stream_url,
            ext=ext,
            filename=f"{title[:80] or 'song'}.{ext}",
            title=title,
            needs_fetch=True,
        )

    def _extract_id(self, url: str) -> str | None:
        m = re.search(r"(?:v=|youtu\.be/|/shorts/)([\w-]{11})", url)
        return m.group(1) if m else None

    def search(self, query: str, limit: int = 5):
        raise NotImplementedError("ytstream is download-only")
