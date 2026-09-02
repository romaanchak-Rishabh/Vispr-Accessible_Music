"""Youtube Search & Download (h0p3rwe) — search/discovery provider."""

from __future__ import annotations

from providers import (
    ProviderError,
    SearchResult,
    _rapidapi_get,
    register_search_provider,
)

HOST = "youtube-search-and-download.p.rapidapi.com"


@register_search_provider
class SearchApiProvider:
    name = "search_api"
    priority = 1  # best free tier: 500/day

    def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        try:
            data = _rapidapi_get(HOST, "/search", params={
                "query": query,
                "type": "video",
                "limit": str(limit),
            }, timeout=15)
        except Exception as exc:
            raise ProviderError(self.name, f"search failed: {exc}") from exc

        videos = data.get("videos") or data.get("items") or []
        results = []
        for v in videos[:limit]:
            vid = v.get("id") or v.get("videoId") or ""
            results.append(SearchResult(
                id=vid,
                title=v.get("title", ""),
                url=v.get("webpage_url") or v.get("url") or f"https://www.youtube.com/watch?v={vid}",
                uploader=v.get("uploader") or v.get("channel") or v.get("author", ""),
                duration=v.get("duration") or 0,
                thumbnail=v.get("thumbnail") or v.get("thumb") or "",
            ))
        return results

    def resolve(self, url: str) -> list[SearchResult]:
        """Resolve a YouTube URL to its metadata (video or playlist)."""
        import re
        # Extract video ID from various URL formats
        m = re.search(r"(?:v=|youtu\.be/|/shorts/)([\w-]{11})", url)
        if m:
            vid = m.group(1)
            try:
                data = _rapidapi_get(HOST, "/video", params={"id": vid}, timeout=15)
                return [SearchResult(
                    id=vid,
                    title=data.get("title", ""),
                    url=url,
                    uploader=data.get("uploader") or data.get("channel", ""),
                    duration=data.get("duration") or 0,
                    thumbnail=data.get("thumbnail") or "",
                )]
            except Exception:
                pass

        # Playlist
        pm = re.search(r"[?&]list=([\w-]+)", url)
        if pm:
            return self._resolve_playlist(pm.group(1), limit=300)

        # Fallback: try as video ID directly
        return []

    def _resolve_playlist(self, playlist_id: str, limit: int = 300) -> list[SearchResult]:
        try:
            data = _rapidapi_get(HOST, "/playlist", params={
                "id": playlist_id,
                "limit": str(limit),
            }, timeout=30)
        except Exception:
            return []

        videos = data.get("videos") or data.get("items") or []
        results = []
        for v in videos[:limit]:
            vid = v.get("id") or v.get("videoId") or ""
            results.append(SearchResult(
                id=vid,
                title=v.get("title", ""),
                url=v.get("webpage_url") or v.get("url") or f"https://www.youtube.com/watch?v={vid}",
                uploader=v.get("uploader") or v.get("channel", ""),
                duration=v.get("duration") or 0,
                thumbnail=v.get("thumbnail") or "",
            ))
        return results
