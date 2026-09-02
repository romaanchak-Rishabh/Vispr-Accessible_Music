"""KvnqPoza — YT Video & Audio Downloader API (hosts files on their server)."""

from __future__ import annotations

import time
from providers import (
    ProviderError,
    DownloadResult,
    _rapidapi_post,
    _rapidapi_get,
    register_download_provider,
)

HOST = "yt-video-audio-downloader-api.p.rapidapi.com"


@register_download_provider
class KvnpProvider:
    name = "kvnp"
    priority = 1  # try first — hosts files

    def download(self, url: str, fmt: str = "mp3") -> DownloadResult:
        """Start a download job and poll until the file is ready.

        Returns a DownloadResult pointing to the hosted file URL.
        """
        # 1. Start download job
        body = {"url": url, "format": fmt}
        if fmt == "mp4":
            body["quality"] = 720
        try:
            start = _rapidapi_post(HOST, "/download", body, timeout=30)
        except Exception as exc:
            raise ProviderError(self.name, f"start failed: {exc}") from exc

        if start.get("error"):
            raise ProviderError(self.name, start["error"])

        # If direct download is available
        if start.get("directDownload") or start.get("downloadUrl"):
            dl_url = start.get("downloadUrl", "")
            return DownloadResult(
                url=dl_url,
                ext=fmt if fmt != "mp3" else "mp3",
                filename=f"song.{fmt if fmt != 'mp3' else 'mp3'}",
                title=start.get("title", ""),
                needs_fetch=True,
            )

        job_id = start.get("jobId") or start.get("id")
        if not job_id:
            raise ProviderError(self.name, f"no jobId in response: {start}")

        # 2. Poll for completion (max 120s)
        file_url = self._poll_job(job_id, timeout=120)
        ext = fmt if fmt != "mp3" else "mp3"
        return DownloadResult(
            url=file_url,
            ext=ext,
            filename=f"song.{ext}",
            needs_fetch=True,
        )

    def _poll_job(self, job_id: str, timeout: int = 120) -> str:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                status = _rapidapi_get(HOST, f"/status/{job_id}", timeout=15)
            except Exception:
                time.sleep(2)
                continue

            state = (status.get("status") or "").upper()
            if state in ("COMPLETED", "AVAILABLE", "SUCCESS"):
                # Try multiple response shapes
                file_url = (
                    status.get("downloadUrl")
                    or status.get("url")
                    or f"/file/{job_id}/audio.mp3"
                )
                if file_url.startswith("/"):
                    file_url = f"https://{HOST}{file_url}"
                return file_url
            if state in ("ERROR", "FAILED", "CONVERSION_ERROR"):
                raise ProviderError(self.name, f"job failed: {status}")

            time.sleep(2)
        raise ProviderError(self.name, f"job {job_id} timed out after {timeout}s")

    def search(self, query: str, limit: int = 5):
        raise NotImplementedError("kvnp is download-only")
