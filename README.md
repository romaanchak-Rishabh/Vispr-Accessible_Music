# Vispr — Liquid Glass Music PWA

A fully offline-capable Progressive Web App (React + TypeScript + Vite) with an Apple Music–inspired Liquid Glass interface that turns your own music files into a beautiful streaming-style experience on Android phones **and** desktops.

## ⚠️ Personal & Educational Use Only

> **This project is for personal and educational use only.**
>
> - Songs and other audio content streamed or downloaded via services like YouTube are **protected by copyright** and belong to their respective owners (artists, labels, publishers).
> - This tool does **not** grant you any rights to copy, redistribute, share, sell, or publicly play copyrighted material.
> - Downloading content from YouTube may violate [YouTube's Terms of Service](https://www.youtube.com/static?template=terms) and local copyright laws, depending on your jurisdiction.
> - Use it only for content you own, content that is public domain / Creative-Commons licensed, or for learning how the app is built.
> - The authors of this repository assume **no liability** for misuse. You are solely responsible for how you use this software.
>
> **No commercial use. No redistribution of downloaded media. Support artists by streaming or purchasing through official channels.**

## Features

- **Liquid Glass UI** — Apple Music–style Listen Now / Browse / Library / Search with translucent blurred surfaces over an ambient color field, springy press feedback everywhere, animated tab highlighting, glass sheets & cards; switches to a macOS-style sidebar + player bar on desktop.
- **Your files, your library** — connect your phone's `Music` folder once via the native folder picker (File System Access API). The connection persists across sessions. Individual file picking is also supported as a fallback.
- **YouTube imports** — paste any video/playlist link; audio is downloaded server-side, tagged (title/artist/album + embedded cover art) via mutagen, deduplicated against your library, and stored offline in the app. Radio-mix links (`list=RD…`) import as a single song.
- **Crossfade** — optional toggle in Now Playing; the next track fades in as the current one fades out (no silence gap).
- **Lock-screen media controls** — MediaSession integration with artwork, play/pause/next/previous/seek and position scrubber on the Android notification & lock screen.
- **Queue management** — Play Next / Play Later from any track's ⋯ menu, drag-to-reorder Up Next, remove items.
- **Library insights** — the Library tab shows total songs/artists/albums/playlists and how much storage the offline library occupies; delete any track from its ⋯ menu to free space instantly.
- **Recently Played, Top Plays, Jump Back In, Recently Added** suggestions that update as you listen.
- **Playlists** — create playlists and add songs to them from anywhere.
- **Album / Artist detail pages** with Play & Shuffle.
- **Persistence** — library index, playlists, queue, playback history, play counts, shuffle/repeat/crossfade/volume all survive app restarts. Resumes where you left off.
- **Installable PWA** — service worker precache, offline shell, install banner (native prompt on Android, "Add to Home Screen" instructions on iOS).

## Supported audio formats

`.mp3` `.m4a` `.mp4` `.aac` `.flac` `.wav` `.ogg` `.opus` `.webm`

Metadata (title / artist / album / artwork) is read from embedded ID3v2, MP4/iTunes and FLAC Vorbis tags; falls back to parsing `Song - Artist.mp3`-style filenames. Artwork is downscaled for performance.

## Run locally

```bash
npm install
npm run dev        # dev server
npm run build      # production build -> dist/
npm run preview    # serve the production build
```

> Note: folder access requires a secure context — use `localhost` or HTTPS (the PWA plugin handles this in production automatically on Vercel).

## Deploy: GitHub → Vercel

1. Create a new GitHub repo and push:
   ```bash
   git init
   git add .
   git commit -m "Music PWA"
   git branch -M main
   git remote add origin https://github.com/<you>/music-pwa.git
   git push -u origin main
   ```
2. On [vercel.com](https://vercel.com): **Add New → Project → Import** the repo.
3. Framework preset **Vite** is auto-detected. Build command `npm run build`, output dir `dist`. Click **Deploy**.
4. Open the deployed URL on your phone in Chrome → you'll get the **Install / Add to Home Screen** prompt (or the in-app banner). Install it — it launches full-screen like a native app.

## Adding music

**Three ways:**

1. **Connect Music Folder** — pick your `Music` folder once; the app indexes everything inside (rescans are incremental — only new/changed files get re-tagged).
2. **Choose Files** — manually pick songs from anywhere on the device.
3. **Import from Link** — paste a direct URL to an audio file (`.mp3`, `.m4a`, …). It downloads into your library with tags + artwork. Works great with freely licensed audio hosts.

- **Rescan Folder** picks up anything newly added to your connected folder.
- **Change Folder** switches to a different source folder anytime.
- Re-importing an already-present YouTube video is detected and skipped — no duplicate downloads.

> **YouTube imports — built into this deployment:** paste a YouTube video or playlist URL into **Library → Songs → Add**. The repo ships Python serverless functions (`/api/resolve`, `/api/download`) that run yt-dlp **on Vercel itself**, so one deployment contains the whole app — frontend + extraction API. No separate server needed.
>
> **Deploy (single project):** push to GitHub → import to Vercel → Deploy. That's it.
>
> Optional environment variables (Vercel → Project → Settings → Environment Variables):
>
> | Variable | Purpose |
> |---|---|
> | `YTDLP_SECRET` | Require clients to send a matching `x-auth-token` (enter it in the app's YT settings panel) |
> | `YTDLP_COOKIES` | Netscape-format cookies.txt content — helps when YouTube shows "confirm you're not a bot" for datacenter IPs |
>
> **Caveats:**
> - Vercel serverless functions buffer responses and cap them around **4.5 MB** — the bundled API therefore prefers ≤130 kbps streams (`YTDLP_AUDIO_FORMAT` overrides this). YouTube also actively blocks many datacenter IPs, so Vercel-hosted extraction can fail with bot-check errors even with cookies. The most reliable option is still running the bridge on your own PC (`pip install yt-dlp mutagen && python server/app.py`, then enter `http://<your-pc-ip>:8080` in the app's YT settings) or any home/VPS box via the included Dockerfile — full-quality audio, no size cap.
> - Serverless functions have execution limits (~60s on Hobby). Long videos or huge playlists may need the self-hosted route.
> - Single videos land as one song; playlists import as an album named after the playlist; radio mixes import as a single song.

### Recommended folder structure for best album grouping:

```
Music/
  Lata Mangeshkar/
    Golden Era Hits/
      01 - Aayega Aanewala.mp3
      02 - ...
  Kishore Kumar/
    Superhits/
      ...
```

Files named `Song - Artist.mp3` or plain titles also work — tags always win when present.

### Building a Bollywood library (legal free sources)

| Source | What you get |
|---|---|
| [archive.org](https://archive.org/search?query=hindi+film+songs) | Huge collections of pre-1970s Hindi film songs (many public domain). Download MP3s directly — direct file URLs can be pasted straight into **Import from Link**. |
| [Jamendo](https://www.jamendo.com) | Free Creative-Commons music, including Bollywood-inspired artists. |
| [Free Music Archive](https://freemusicarchive.org) | CC-licensed tracks searchable by genre (`soundtrack`, `world`). |
| Your own CDs/cassettes → MP3 | Ripping music you own for personal use is the cleanest way to get modern soundtracks. |

## Using it on your phone

1. Open the installed app → tap **Connect Music Folder**.
2. Grant Chrome access to your `Download/Music` (or wherever you keep songs).
3. Every audio file inside is scanned, tagged and grouped into Albums/Artists automatically. Tap **Reconnect Folder** if your browser ever drops permission (one tap, no rescan needed).

## Tech notes

- State: Zustand (+persist), storage: IndexedDB via `idb-keyval` (file handles and picked file blobs live there, so they survive restarts).
- Metadata parsing is hand-rolled and dependency-free (ID3v2.2/2.3/2.4, MP4 `ilst` atoms incl. `covr`, FLAC Vorbis comments + pictures).
- PWA: `vite-plugin-pwa` (Workbox generateSW, auto-update, precached app shell).
