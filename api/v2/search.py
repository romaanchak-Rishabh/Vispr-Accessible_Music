"""Search orchestrator — tries providers in priority order."""

from __future__ import annotations

import re

from providers import (
    SearchResult,
    ProviderError,
    get_search_providers,
)

# Import providers so they register via decorators
import search_api  # noqa: F401


def search_youtube(query: str, limit: int = 5) -> list[SearchResult]:
    """Search YouTube using the best available provider."""
    providers = sorted(get_search_providers(), key=lambda p: p.priority)
    if not providers:
        raise RuntimeError("no search providers registered")

    for provider in providers:
        try:
            return provider.search(query, limit=limit)
        except Exception as exc:
            print(f"[v2:{provider.name}] search failed: {exc}")
            continue

    raise RuntimeError("all search providers failed")


def resolve_url(url: str) -> list[SearchResult]:
    """Resolve a YouTube URL into track metadata."""
    # Try each provider that has a resolve method
    providers = sorted(get_search_providers(), key=lambda p: p.priority)
    for provider in providers:
        if hasattr(provider, "resolve"):
            try:
                return provider.resolve(url)
            except Exception as exc:
                print(f"[v2:{provider.name}] resolve failed: {exc}")
                continue

    # Fallback: parse what we can from the URL itself
    m = re.search(r"(?:v=|youtu\.be/|/shorts/)([\w-]{11})", url)
    if m:
        vid = m.group(1)
        return [SearchResult(
            id=vid,
            title="",
            url=url,
        )]
    return []
