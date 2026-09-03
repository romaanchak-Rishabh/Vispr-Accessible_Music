"""Base provider interface and fallback orchestrator."""

from __future__ import annotations

import os
import time
import urllib.request
import json
from dataclasses import dataclass, field
from typing import Optional

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "").strip()


@dataclass
class DownloadResult:
    url: str  # direct download URL or hosted file URL
    ext: str  # m4a, mp3, mp4
    filename: str
    title: str = ""
    artist: str = ""
    thumbnail: str = ""
    duration: float = 0
    needs_fetch: bool = True  # if True, caller must fetch the URL to get bytes


@dataclass
class SearchResult:
    id: str
    title: str
    url: str
    uploader: str = ""
    duration: float = 0
    thumbnail: str = ""


class ProviderError(Exception):
    def __init__(self, provider: str, message: str):
        self.provider = provider
        self.message = message
        super().__init__(f"[{provider}] {message}")


def _rapidapi_get(host: str, path: str, params: dict | None = None, timeout: int = 30) -> dict:
    """Make a GET request to a RapidAPI endpoint."""
    if not RAPIDAPI_KEY:
        raise ProviderError("rapidapi", "RAPIDAPI_KEY not set")
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in (params or {}).items())
    url = f"https://{host}/{path.lstrip('/')}" + (f"?{qs}" if qs else "")
    req = urllib.request.Request(url, headers={
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": host,
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _rapidapi_post(host: str, path: str, body: dict, timeout: int = 30) -> dict:
    """Make a POST request to a RapidAPI endpoint."""
    if not RAPIDAPI_KEY:
        raise ProviderError("rapidapi", "RAPIDAPI_KEY not set")
    url = f"https://{host}/{path.lstrip('/')}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": host,
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def fetch_url_bytes(url: str, timeout: int = 120) -> bytes:
    """Download raw bytes from a URL. Sets proper headers for CDN compatibility."""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Referer": "https://www.youtube.com/",
        "Origin": "https://www.youtube.com",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

_download_providers: list = []
_search_providers: list = []


def register_download_provider(cls):
    _download_providers.append(cls())
    return cls


def register_search_provider(cls):
    _search_providers.append(cls())
    return cls


def get_download_providers() -> list:
    return list(_download_providers)


def get_search_providers() -> list:
    return list(_search_providers)
