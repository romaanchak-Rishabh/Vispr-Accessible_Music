"""Download orchestrator — tries providers in priority order, fetches file bytes."""

from __future__ import annotations

import os
import tempfile
import time

from providers import (
    DownloadResult,
    ProviderError,
    fetch_url_bytes,
    get_download_providers,
)

# Import providers so they register via decorators
import kvnp  # noqa: F401
import ytstream  # noqa: F401


def download_audio(url: str, fmt: str = "mp3") -> tuple[bytes, str, str]:
    """Try all download providers in priority order.

    Returns (file_bytes, ext, filename).
    """
    providers = sorted(get_download_providers(), key=lambda p: p.priority)
    if not providers:
        raise RuntimeError("no download providers registered")

    last_error = None
    for provider in providers:
        try:
            result = provider.download(url, fmt=fmt)
            print(f"[v2:{provider.name}] download success: {result.filename}")

            # Fetch the actual bytes
            data = fetch_url_bytes(result.url, timeout=120)
            if len(data) < 1000:
                raise ProviderError(provider.name, f"file too small ({len(data)} bytes)")

            return data, result.ext, result.filename
        except Exception as exc:
            print(f"[v2:{provider.name}] failed: {exc}")
            last_error = exc
            continue

    raise RuntimeError(f"all providers failed. last error: {last_error}")


def get_download_url(url: str, fmt: str = "mp3") -> DownloadResult:
    """Try all download providers, return the result with a URL (don't fetch bytes).

    Useful when the caller wants to stream the URL directly.
    """
    providers = sorted(get_download_providers(), key=lambda p: p.priority)
    last_error = None
    for provider in providers:
        try:
            result = provider.download(url, fmt=fmt)
            print(f"[v2:{provider.name}] url ready: {result.url[:80]}...")
            return result
        except Exception as exc:
            print(f"[v2:{provider.name}] failed: {exc}")
            last_error = exc
            continue

    raise RuntimeError(f"all providers failed. last error: {last_error}")
