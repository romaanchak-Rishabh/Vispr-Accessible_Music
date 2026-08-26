var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/metadata.ts
var metadata_exports = {};
__export(metadata_exports, {
  blobToDataUrl: () => blobToDataUrl,
  extractMetadata: () => extractMetadata,
  parseFilename: () => parseFilename
});
function decodeText(bytes, encoding) {
  try {
    switch (encoding) {
      case 0:
        return new TextDecoder("iso-8859-1").decode(bytes);
      case 1: {
        const hasBom = bytes.length >= 2 && (bytes[0] === 255 && bytes[1] === 254 || bytes[0] === 254 && bytes[1] === 255);
        return new TextDecoder(hasBom ? "utf-16" : "utf-16le").decode(bytes);
      }
      case 2:
        return new TextDecoder("utf-16be").decode(bytes);
      default:
        return new TextDecoder("utf-8").decode(bytes);
    }
  } catch {
    return "";
  }
}
function cleanTag(s) {
  return s.replace(/\0+$/g, "").trim();
}
async function readID3(file) {
  const tags = {};
  const header = new Uint8Array(10);
  const head = await file.slice(0, 10).arrayBuffer();
  header.set(new Uint8Array(head));
  if (!(header[0] === 73 && header[1] === 68 && header[2] === 51)) return tags;
  const major = header[3];
  if (major < 2 || major > 4) return tags;
  const size = (header[6] & 127) << 21 | (header[7] & 127) << 14 | (header[8] & 127) << 7 | header[9] & 127;
  const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 3 * 1024 * 1024)).arrayBuffer());
  let pos = 0;
  const frameHeaderSize = major === 2 ? 6 : 10;
  while (pos + frameHeaderSize <= buf.length) {
    if (buf[pos] === 0) break;
    let frameId;
    let frameSize;
    if (major === 2) {
      frameId = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2]);
      frameSize = buf[pos + 3] << 16 | buf[pos + 4] << 8 | buf[pos + 5];
      pos += 6;
    } else {
      frameId = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
      if (major === 4) {
        frameSize = (buf[pos + 4] & 127) << 21 | (buf[pos + 5] & 127) << 14 | (buf[pos + 6] & 127) << 7 | buf[pos + 7] & 127;
      } else {
        frameSize = buf[pos + 4] << 24 | buf[pos + 5] << 16 | buf[pos + 6] << 8 | buf[pos + 7];
      }
      pos += 10;
    }
    if (frameSize <= 0 || pos + frameSize > buf.length) break;
    const body = buf.subarray(pos, pos + frameSize);
    pos += frameSize;
    if (frameId === "TIT2" || frameId === "TT2") tags.title = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === "TPE1" || frameId === "TP1") tags.artist = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === "TALB" || frameId === "TAL") tags.album = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === "TPE2" || frameId === "TP2") tags.albumArtist = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === "TCON" || frameId === "TCO") tags.genre = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === "TRCK" || frameId === "TRK") {
      const t = cleanTag(decodeText(body.subarray(1), body[0]));
      const n = parseInt(t.split("/")[0], 10);
      if (!isNaN(n)) tags.trackNo = n;
    } else if (frameId === "TYER" || frameId === "TDRC" || frameId === "TYE") {
      const y = parseInt(cleanTag(decodeText(body.subarray(1), body[0])).slice(0, 4), 10);
      if (!isNaN(y)) tags.year = y;
    } else if (frameId === "APIC" && major >= 3 || frameId === "PIC" && major === 2) {
      try {
        if (major === 2) {
          const imgType = String.fromCharCode(body[1], body[2], body[3]);
          let i = 4;
          while (i < body.length && body[i] !== 0) i++;
          i++;
          const encByte = body[0];
          i++;
          i++;
          const mime = imgType === "PNG" ? "image/png" : "image/jpeg";
          tags.pictureBlob = new Blob([body.slice(i)], { type: mime });
        } else {
          const enc = body[0];
          let i = 1;
          let mimeStr = "image/jpeg";
          if (body[i] === 105 && body[i + 1] === 109 && body[i + 2] === 97 && body[i + 3] === 103) {
            let j = i;
            while (j < body.length && body[j] !== 0) j++;
            mimeStr = new TextDecoder("iso-8859-1").decode(body.subarray(i, j));
            i = j + 1;
          } else {
            i += 3;
          }
          i += 1;
          if (enc === 1 || enc === 2) {
            while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2;
            i += 2;
          } else {
            while (i < body.length && body[i] !== 0) i++;
            i += 1;
          }
          if (i < body.length) tags.pictureBlob = new Blob([body.slice(i)], { type: mimeStr });
        }
      } catch {
      }
    }
  }
  return tags;
}
async function readMP4(file) {
  const tags = {};
  const maxRead = Math.min(file.size, 12 * 1024 * 1024);
  const buf = new Uint8Array(await file.slice(0, maxRead).arrayBuffer());
  const view = new DataView(buf.buffer);
  const fourccAt = (i) => String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
  for (let i = 0; i < buf.length - 16; i++) {
    const cc = fourccAt(i);
    if (!(cc in MP4_TAGS)) continue;
    try {
      const dataSize = view.getUint32(i + 4);
      const payloadStart = i + 16;
      const payloadEnd = Math.min(payloadStart + Math.max(0, dataSize - 16), buf.length);
      const key = MP4_TAGS[cc];
      if (key === "trackNo") {
        if (payloadEnd - payloadStart >= 4) {
          const n = view.getUint16(payloadStart + 2);
          if (n > 0) tags.trackNo = n;
        }
      } else if (key === "year") {
        const s = cleanTag(new TextDecoder("utf-8").decode(buf.subarray(payloadStart, payloadEnd)));
        const y = parseInt(s.slice(0, 4), 10);
        if (!isNaN(y)) tags.year = y;
      } else if (key === "title" || key === "artist" || key === "album" || key === "albumArtist" || key === "genre") {
        const s = cleanTag(new TextDecoder("utf-8").decode(buf.subarray(payloadStart, payloadEnd)));
        if (s) tags[key] = s;
      } else if (cc === "covr") {
        const slice = buf.slice(payloadStart, payloadEnd);
        const isPng = slice[0] === 137 && slice[1] === 80;
        tags.pictureBlob = new Blob([slice], { type: isPng ? "image/png" : "image/jpeg" });
      }
      if (cc === "covr") {
      }
    } catch {
    }
  }
  return tags;
}
async function readFlac(file) {
  const tags = {};
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!(head[0] === 102 && head[1] === 76 && head[2] === 97 && head[3] === 67)) return tags;
  let offset = 4;
  for (let block = 0; block < 16; block++) {
    if (offset + 4 > file.size) break;
    const bh = new Uint8Array(await file.slice(offset, offset + 4).arrayBuffer());
    const isLast = (bh[0] & 128) !== 0;
    const blockType = bh[0] & 127;
    const blockLen = bh[1] << 16 | bh[2] << 8 | bh[3];
    const dataOffset = offset + 4;
    if (blockType === 4) {
      const data = new Uint8Array(await file.slice(dataOffset, dataOffset + Math.min(blockLen, 2 * 1024 * 1024)).arrayBuffer());
      const view = new DataView(data.buffer);
      let p = 0;
      const vendorLen = view.getUint32(p, true);
      p += 4 + vendorLen;
      const count = view.getUint32(p, true);
      p += 4;
      for (let i = 0; i < count && p + 4 <= data.length; i++) {
        const len = view.getUint32(p, true);
        p += 4;
        const entry = new TextDecoder("utf-8").decode(data.subarray(p, p + len));
        p += len;
        const eq = entry.indexOf("=");
        if (eq < 0) continue;
        const k = entry.slice(0, eq).toUpperCase();
        const v = cleanTag(entry.slice(eq + 1));
        if (k === "TITLE") tags.title = v;
        else if (k === "ARTIST") tags.artist = v;
        else if (k === "ALBUM") tags.album = v;
        else if (k === "ALBUMARTIST") tags.albumArtist = v;
        else if (k === "GENRE") tags.genre = v;
        else if (k === "DATE" || k === "YEAR") {
          const y = parseInt(v.slice(0, 4), 10);
          if (!isNaN(y)) tags.year = y;
        } else if (k === "TRACKNUMBER") {
          const n = parseInt(v, 10);
          if (!isNaN(n)) tags.trackNo = n;
        }
      }
    } else if (blockType === 6) {
      const data = new Uint8Array(await file.slice(dataOffset, dataOffset + Math.min(blockLen, 4 * 1024 * 1024)).arrayBuffer());
      try {
        const view = new DataView(data.buffer);
        let p = 4;
        const mimeLen = view.getUint32(p);
        p += 4;
        const mime = new TextDecoder().decode(data.subarray(p, p + mimeLen));
        p += mimeLen;
        const descLen = view.getUint32(p);
        p += 4 + descLen;
        p += 16;
        const picLen = view.getUint32(p);
        p += 4;
        if (picLen > 0 && p + picLen <= data.length) tags.pictureBlob = new Blob([data.slice(p, p + picLen)], { type: mime });
      } catch {
      }
    }
    offset = dataOffset + blockLen;
    if (isLast) break;
  }
  return tags;
}
function parseFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  let trackNo;
  const noMatch = base.match(/^(\d{1,3})[\s.\-]+(.+)$/);
  let rest = base;
  if (noMatch && noMatch[2].length > 2) {
    trackNo = parseInt(noMatch[1], 10);
    rest = noMatch[2].trim();
  }
  const parts = rest.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(" - ").trim();
    if (title.length > 0) return { title, artist, trackNo };
  }
  return { title: rest, trackNo };
}
async function extractMetadata(file, fallbackPath) {
  const lower = file.name.toLowerCase();
  let tags = {};
  try {
    if (lower.endsWith(".mp3")) tags = await readID3(file);
    else if (lower.endsWith(".m4a") || lower.endsWith(".mp4") || lower.endsWith(".aac")) tags = await readMP4(file);
    else if (lower.endsWith(".flac")) tags = await readFlac(file);
    else if (lower.endsWith(".ogg") || lower.endsWith(".oga") || lower.endsWith(".opus")) {
      tags = await readID3(file);
    }
  } catch {
    tags = {};
  }
  if (!tags.title || !tags.artist) {
    const fn = parseFilename(fallbackPath.split("/").pop() ?? file.name);
    if (!tags.title) tags.title = fn.title;
    if (!tags.artist && fn.artist) tags.artist = fn.artist;
    if (fn.trackNo !== void 0 && tags.trackNo === void 0) tags.trackNo = fn.trackNo;
  }
  if (!tags.artist) tags.artist = "Unknown Artist";
  if (!tags.album) tags.album = "Unknown Album";
  return tags;
}
async function blobToDataUrl(blob, maxSize = 512) {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    try {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return void 0;
    }
  }
}
var MP4_TAGS;
var init_metadata = __esm({
  "src/lib/metadata.ts"() {
    "use strict";
    MP4_TAGS = {
      "\xA9nam": "title",
      "\xA9ART": "artist",
      "\xA9alb": "album",
      aART: "albumArtist",
      "\xA9gen": "genre",
      "\xA9day": "year",
      trkn: "trackNo"
    };
  }
});

// src/lib/ytdlp.ts
var ytdlp_exports = {};
__export(ytdlp_exports, {
  downloadAudioViaYtDlp: () => downloadAudioViaYtDlp,
  effectiveServerBase: () => effectiveServerBase,
  isYouTubeUrl: () => isYouTubeUrl,
  resolveViaYtDlp: () => resolveViaYtDlp
});
function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}
function authHeaders(token) {
  return token ? { "X-Auth-Token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
function effectiveServerBase(server) {
  return server.trim().replace(/\/+$/, "");
}
async function resolveViaYtDlp(server, token, url) {
  const base = effectiveServerBase(server);
  const resp = await fetch(`${base}/api/resolve`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ url })
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      msg = (await resp.json()).error ?? msg;
    } catch {
    }
    throw new Error(`Resolve failed: ${msg}`);
  }
  const data = await resp.json();
  return data.items ?? [];
}
async function downloadAudioViaYtDlp(server, token, videoUrl) {
  const base = effectiveServerBase(server);
  const resp = await fetch(`${base}/api/download`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ url: videoUrl })
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      msg = (await resp.json()).error ?? msg;
    } catch {
    }
    throw new Error(msg);
  }
  const blob = await resp.blob();
  const disposition = resp.headers.get("Content-Disposition") ?? "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  let filename = utf8Match ? decodeURIComponent(utf8Match[1]) : disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "song.m4a";
  const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "m4a";
  if (!/^[a-z0-9._ -]+$/i.test(filename)) filename = "song." + ext;
  return { blob, ext, filename };
}
var init_ytdlp = __esm({
  "src/lib/ytdlp.ts"() {
    "use strict";
  }
});

// src/store/library.ts
import { create as create2 } from "zustand";

// src/lib/db.ts
import { get, set, del, keys } from "idb-keyval";
var LIB_KEY = "library:tracks";
var HANDLES_KEY_PREFIX = "library:handle:";
var FILES_STORE_PREFIX = "library:file:";
var PLAYLISTS_KEY = "library:playlists";
async function loadTracks() {
  return await get(LIB_KEY) ?? [];
}
async function saveTracks(tracks) {
  await set(LIB_KEY, tracks);
}
async function saveHandle(id, handle) {
  await set(HANDLES_KEY_PREFIX + id, handle);
}
async function loadHandle(id) {
  return get(HANDLES_KEY_PREFIX + id);
}
async function deleteHandle(id) {
  await del(HANDLES_KEY_PREFIX + id);
}
async function saveFileBlob(id, file) {
  await set(FILES_STORE_PREFIX + id, file);
}
async function loadFileBlob(id) {
  return get(FILES_STORE_PREFIX + id);
}
async function deleteFileBlob(id) {
  await del(FILES_STORE_PREFIX + id);
}
async function removeTrackStorage(id) {
  await deleteHandle(id);
  await deleteFileBlob(id);
}
async function loadPlaylists() {
  return await get(PLAYLISTS_KEY) ?? [];
}
async function savePlaylists(playlists) {
  await set(PLAYLISTS_KEY, playlists);
}
var DLDIR_KEY = "settings:download-dir";
var TOP_EXCLUDED_KEY = "library:top-excluded";
async function saveDownloadDir(handle) {
  await set(DLDIR_KEY, handle);
}
async function loadDownloadDir() {
  return get(DLDIR_KEY);
}
async function clearDownloadDir() {
  await del(DLDIR_KEY);
}
async function loadTopExcluded() {
  return await get(TOP_EXCLUDED_KEY) ?? {};
}
async function saveTopExcluded(map) {
  await set(TOP_EXCLUDED_KEY, map);
}

// src/types.ts
var AUDIO_EXTENSIONS = [".mp3", ".m4a", ".mp4", ".aac", ".flac", ".wav", ".ogg", ".oga", ".opus", ".webm"];
function isAudioFile(name) {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// src/lib/fsAccess.ts
init_metadata();
function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}
async function pickDirectory(mode = "read") {
  const picker = window.showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker({ id: "music-library", mode });
    return handle;
  } catch {
    return null;
  }
}
async function ensurePermission(handle, interactive, mode = "read") {
  try {
    if (handle.queryPermission) {
      const state = await handle.queryPermission({ mode });
      if (state === "granted") return true;
      if (!interactive || !handle.requestPermission) return false;
      const req = await handle.requestPermission({ mode });
      return req === "granted";
    }
    return true;
  } catch {
    return false;
  }
}
async function* walk(dir, prefix) {
  for await (const entry of dir.values()) {
    if (entry.kind === "file") {
      yield { path: prefix ? `${prefix}/${entry.name}` : entry.name, handle: entry };
    } else if (entry.kind === "directory" && !entry.name.startsWith(".")) {
      yield* walk(entry, prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}
var idCounter = 0;
async function scanMusicDirectory(dirHandle, onProgress, existingIds = /* @__PURE__ */ new Set()) {
  const audioFiles = [];
  for await (const entry of walk(dirHandle, "")) {
    if (isAudioFile(entry.path)) audioFiles.push(entry);
  }
  const tracks = [];
  let scanned = 0;
  await mapLimit(audioFiles, 6, async (entry) => {
    scanned++;
    try {
      const file = await entry.handle.getFile();
      if (existingIds.has(`d-${entry.path}-${file.size}`)) {
        onProgress(scanned, tracks.length, entry.path);
        return;
      }
      const tags = await extractMetadata(file, entry.path);
      let artwork;
      if (tags.pictureBlob) artwork = await blobToDataUrl(tags.pictureBlob) ?? void 0;
      const track = {
        id: `d-${entry.path}-${file.size}`,
        title: tags.title ?? file.name,
        artist: tags.artist ?? "Unknown Artist",
        album: tags.album ?? "Unknown Album",
        albumArtist: tags.albumArtist,
        genre: tags.genre,
        year: tags.year,
        trackNo: tags.trackNo,
        fileName: file.name,
        path: entry.path,
        source: "dir",
        size: file.size,
        addedAt: Date.now(),
        artwork
      };
      tracks.push(track);
      await saveHandle(track.id, entry.handle);
    } catch {
    }
    onProgress(scanned, tracks.length, entry.path);
  });
  tracks.sort((a, b) => a.path.localeCompare(b.path));
  return { tracks, dirHandle, scanned };
}

// src/store/settings.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
var useSettings = create()(
  persist(
    (set2) => ({
      ytdlpServer: "",
      ytdlpToken: "",
      confirmImport: true,
      youtubeApiKey: "",
      theme: "system",
      accent: "red",
      setYtdlpServer: (ytdlpServer) => set2({ ytdlpServer: ytdlpServer.trim().replace(/\/+$/, "") }),
      setYtdlpToken: (ytdlpToken) => set2({ ytdlpToken: ytdlpToken.trim() }),
      setConfirmImport: (confirmImport) => set2({ confirmImport }),
      setYoutubeApiKey: (youtubeApiKey) => set2({ youtubeApiKey: youtubeApiKey.trim() }),
      setTheme: (theme) => set2({ theme }),
      setAccent: (accent) => set2({ accent })
    }),
    { name: "app-settings", storage: createJSONStorage(() => localStorage) }
  )
);

// src/store/library.ts
var fileCache = /* @__PURE__ */ new Map();
var handleCache = /* @__PURE__ */ new Map();
var downloadDirHandle = null;
function browserDownload(filename, blob) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6e4);
}
async function saveCopyToDownloadFolder(filename, blob) {
  if (!downloadDirHandle) return false;
  try {
    const ok = await ensurePermission(downloadDirHandle, false, "readwrite");
    if (!ok) {
      console.warn("[library] download folder write skipped: permission not granted");
      useLibrary.setState({ downloadDirNeedsAuth: true });
      browserDownload(filename, blob);
      return false;
    }
    const fh = await downloadDirHandle.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (err) {
    console.warn("[library] download folder write failed:", err);
    useLibrary.setState({ downloadDirNeedsAuth: true });
    browserDownload(filename, blob);
    return false;
  }
}
function buildAlbums(tracks) {
  const map = /* @__PURE__ */ new Map();
  for (const t of tracks) {
    const key = `${t.album}|||${t.albumArtist ?? t.artist}`.toLowerCase();
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  const albums = [];
  for (const [key, list] of map) {
    list.sort((a, b) => (a.trackNo ?? 9999) - (b.trackNo ?? 9999));
    const artwork = list.find((t) => t.artwork)?.artwork;
    albums.push({
      key,
      title: list[0].album,
      artist: list[0].albumArtist || list[0].artist,
      year: list.find((t) => t.year)?.year,
      artwork,
      trackIds: list.map((t) => t.id)
    });
  }
  albums.sort((a, b) => a.title.localeCompare(b.title));
  return albums;
}
function buildArtists(tracks, albums) {
  const map = /* @__PURE__ */ new Map();
  for (const t of tracks) {
    let artist = map.get(t.artist);
    if (!artist) {
      artist = { name: t.artist, albumKeys: [], trackIds: [] };
      map.set(t.artist, artist);
    }
    const albumKey = `${t.album}|||${t.albumArtist ?? t.artist}`.toLowerCase();
    if (!artist.albumKeys.includes(albumKey)) artist.albumKeys.push(albumKey);
    artist.trackIds.push(t.id);
    if (!artist.artwork) {
      const album = albums.find((a) => a.key === albumKey);
      if (album?.artwork) artist.artwork = album.artwork;
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
var useLibrary = create2((set2, get2) => ({
  tracks: [],
  byId: {},
  albums: [],
  artists: [],
  playlists: [],
  status: "loading",
  scanning: false,
  scanProgress: null,
  lastScanCount: null,
  hasFolderSupport: supportsDirectoryPicker(),
  downloadDirName: null,
  downloadDirNeedsAuth: false,
  topExcluded: {},
  chooseDownloadFolder: async () => {
    const dir = await pickDirectory("readwrite");
    if (!dir) return false;
    const ok = await ensurePermission(dir, true, "readwrite");
    if (!ok) return false;
    downloadDirHandle = dir;
    await saveDownloadDir(downloadDirHandle);
    set2({ downloadDirName: dir.name, downloadDirNeedsAuth: false });
    return true;
  },
  clearDownloadFolder: async () => {
    downloadDirHandle = null;
    await clearDownloadDir();
    set2({ downloadDirName: null });
  },
  init: async () => {
    try {
      const [tracks, playlists, topExcluded] = await Promise.all([
        loadTracks(),
        loadPlaylists(),
        loadTopExcluded()
      ]);
      set2({ playlists, topExcluded });
      const savedDir = await loadDownloadDir();
      if (savedDir) {
        downloadDirHandle = savedDir;
        const writable = await ensurePermission(savedDir, false, "readwrite");
        set2({ downloadDirName: savedDir.name, downloadDirNeedsAuth: !writable });
      }
      if (tracks.length === 0) {
        set2({ status: "empty", tracks: [], byId: {}, albums: [], artists: [] });
        return;
      }
      const byId = {};
      for (const t of tracks) byId[t.id] = t;
      const albums = buildAlbums(tracks);
      const artists = buildArtists(tracks, albums);
      set2({ tracks, byId, albums, artists, status: "ready" });
      const anyDirSource = tracks.some((t) => t.source === "dir");
      if (anyDirSource && !handleCache.size) {
        set2({ status: "ready" });
        const firstDirTrack = tracks.find((t) => t.source === "dir");
        if (firstDirTrack) {
          const h = await loadHandle(firstDirTrack.id);
          if (h) {
            handleCache.set(firstDirTrack.id, h);
            const dh = h;
            const ok = await ensurePermission(dh, false);
            if (!ok) set2({ status: "needs-permission" });
          } else {
            set2({ status: "needs-permission" });
          }
        }
      }
    } catch {
      set2({ status: "empty" });
    }
  },
  connectFolder: async () => {
    const dir = await pickDirectory();
    if (!dir) return false;
    const ok = await ensurePermission(dir, true);
    if (!ok) return false;
    await runScan(set2, get2, dir);
    return true;
  },
  reconnectFolder: async () => {
    const tracks = get2().tracks;
    const firstDirTrack = tracks.find((t) => t.source === "dir");
    if (!firstDirTrack) return false;
    let h = handleCache.get(firstDirTrack.id);
    if (!h) {
      const loaded = await loadHandle(firstDirTrack.id);
      if (!loaded) return false;
      h = loaded;
      handleCache.set(firstDirTrack.id, loaded);
    }
    const ok = await ensurePermission(h, true);
    if (!ok) return false;
    set2({ status: "ready" });
    return true;
  },
  rescanFolder: async () => {
    const firstDirTrack = get2().tracks.find((t) => t.source === "dir");
    if (!firstDirTrack) return false;
    let h = handleCache.get(firstDirTrack.id);
    if (!h) {
      const loaded = await loadHandle(firstDirTrack.id);
      if (!loaded) return false;
      h = loaded;
      handleCache.set(firstDirTrack.id, loaded);
    }
    const ok = await ensurePermission(h, true);
    if (!ok) return false;
    await runScan(set2, get2, h);
    return true;
  },
  importFromUrl: async (url) => {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) throw new Error(`Download failed (HTTP ${resp.status})`);
    const blob = await resp.blob();
    let name = decodeURIComponent((url.split("?")[0].split("#")[0].split("/").pop() ?? "").trim()) || "download";
    if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
      const ct = blob.type.split("/")[1]?.split(";")[0];
      name += ct && /^(mpeg|mp3)$/.test(ct) ? ".mp3" : ct ? `.${ct.replace("x-", "")}` : ".mp3";
    }
    const file = new File([blob], name, { type: blob.type || "audio/mpeg", lastModified: Date.now() });
    await saveCopyToDownloadFolder(name, blob);
    await get2().addFiles([file]);
  },
  addFiles: async (files) => {
    const audioFiles = files.filter(
      (f) => /\.(mp3|m4a|mp4|aac|flac|wav|ogg|oga|opus|webm)$/i.test(f.name) || f.type.startsWith("audio/")
    );
    if (audioFiles.length === 0) return;
    set2({ scanning: true, scanProgress: { scanned: 0, found: audioFiles.length } });
    const newTracks = [];
    let done = 0;
    let next = 0;
    const { extractMetadata: extractMetadata2, blobToDataUrl: blobToDataUrl2 } = await Promise.resolve().then(() => (init_metadata(), metadata_exports));
    const worker = async () => {
      while (next < audioFiles.length) {
        const file = audioFiles[next++];
        try {
          const tags = await extractMetadata2(file, file.name);
          let artwork;
          if (tags.pictureBlob) artwork = await blobToDataUrl2(tags.pictureBlob) ?? void 0;
          const track = {
            id: `f-${file.name}-${file.size}-${file.lastModified}`,
            title: tags.title ?? file.name,
            artist: tags.artist ?? "Unknown Artist",
            album: tags.album ?? "Unknown Album",
            albumArtist: tags.albumArtist,
            genre: tags.genre,
            year: tags.year,
            trackNo: tags.trackNo,
            fileName: file.name,
            path: file.name,
            source: "file",
            size: file.size,
            addedAt: Date.now(),
            artwork
          };
          newTracks.push(track);
          fileCache.set(track.id, file);
          await saveFileBlob(track.id, file);
        } catch {
        }
        done++;
        set2({ scanProgress: { scanned: done, found: audioFiles.length } });
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, audioFiles.length) }, worker));
    await finalizeImport(set2, get2, newTracks);
  },
  addFileWithMeta: async (file, meta) => {
    const track = {
      id: `f-${file.name}-${file.size}-${Date.now()}`,
      title: meta.title.trim() || file.name,
      artist: meta.artist.trim() || "Unknown Artist",
      album: meta.album?.trim() || "Unknown Album",
      fileName: file.name,
      path: file.name,
      source: "file",
      size: file.size,
      addedAt: Date.now(),
      artwork: meta.artwork
    };
    fileCache.set(track.id, file);
    await saveFileBlob(track.id, file);
    await saveCopyToDownloadFolder(file.name, file);
    await finalizeImport(set2, get2, [track]);
    return track;
  },
  importYouTube: async (url, onProgress, overrides) => {
    const { ytdlpServer, ytdlpToken } = useSettings.getState();
    const { resolveViaYtDlp: resolveViaYtDlp2, downloadAudioViaYtDlp: downloadAudioViaYtDlp2 } = await Promise.resolve().then(() => (init_ytdlp(), ytdlp_exports));
    const { blobToDataUrl: blobToDataUrl2 } = await Promise.resolve().then(() => (init_metadata(), metadata_exports));
    set2({ scanning: true, scanProgress: { scanned: 0, found: 0 } });
    let items;
    try {
      items = await resolveViaYtDlp2(ytdlpServer, ytdlpToken, url);
    } catch (err) {
      set2({ scanning: false, scanProgress: null });
      throw err;
    }
    if (items.length === 0) {
      set2({ scanning: false, scanProgress: null });
      throw new Error("No videos found for that link");
    }
    set2({ scanning: true, scanProgress: { scanned: 0, found: items.length, label: items[0]?.title ?? void 0 } });
    const newTracks = [];
    let done = 0;
    let skipped = 0;
    let failed = 0;
    for (const item of items) {
      if (get2().byId[`y-${item.id}`]) {
        done++;
        skipped++;
        const label = `${item.title ?? item.id} \u2014 already in library`;
        set2({ scanProgress: { scanned: done, found: items.length, label } });
        onProgress?.(done, items.length, label);
        continue;
      }
      onProgress?.(done, items.length, item.title ?? item.id);
      const videoUrl = item.webpage_url ?? `https://www.youtube.com/watch?v=${item.id}`;
      let blob;
      let filename;
      try {
        const dl = await downloadAudioViaYtDlp2(ytdlpServer, ytdlpToken, videoUrl);
        blob = dl.blob;
        filename = dl.filename;
      } catch (err) {
        done++;
        failed++;
        set2({ scanProgress: { scanned: done, found: items.length, label: `failed: ${item.title ?? item.id}` } });
        onProgress?.(done, items.length, `failed: ${item.title ?? item.id}`);
        continue;
      }
      let artwork;
      if (item.thumbnail) {
        try {
          const thumbResp = await fetch(item.thumbnail, { mode: "cors" });
          if (thumbResp.ok) artwork = await blobToDataUrl2(await thumbResp.blob()) ?? void 0;
        } catch {
        }
        artwork = artwork ?? item.thumbnail;
      }
      const existing = get2().byId[`y-${item.id}`];
      const ov = overrides?.[item.id];
      const track = {
        id: `y-${item.id}`,
        title: ov?.title?.trim() || item.title || filename,
        artist: ov?.artist?.trim() || item.uploader || "Unknown Artist",
        album: ov?.album?.trim() || item.playlist_title || "YouTube",
        fileName: filename,
        path: filename,
        source: "file",
        size: blob.size,
        addedAt: Date.now(),
        duration: item.duration,
        artwork: ov?.artwork ?? artwork ?? (existing && !artwork ? existing.artwork : void 0)
      };
      fileCache.set(track.id, new File([blob], filename, { type: blob.type || "audio/mp4" }));
      await saveFileBlob(track.id, fileCache.get(track.id));
      await saveCopyToDownloadFolder(filename, blob);
      newTracks.push(track);
      done++;
      set2({ scanProgress: { scanned: done, found: items.length, label: item.title ?? item.id } });
      onProgress?.(done, items.length, item.title ?? item.id);
    }
    if (newTracks.length === 0 && failed > 0) {
      await finalizeImport(set2, get2, []);
      throw new Error(
        items.length === 1 ? "Download failed \u2014 the yt-dlp server could not fetch that video" : `All ${items.length} downloads failed \u2014 check the yt-dlp server`
      );
    }
    await finalizeImport(set2, get2, newTracks);
    return { imported: newTracks.length, skipped, failed };
  },
  updateTrackMeta: async (trackId, patch) => {
    const tracks = get2().tracks.map(
      (t) => t.id === trackId ? {
        ...t,
        ...patch.title?.trim() ? { title: patch.title.trim() } : {},
        ...patch.artist?.trim() ? { artist: patch.artist.trim() } : {},
        ...patch.album?.trim() ? { album: patch.album.trim() } : {},
        ...patch.artwork !== void 0 ? { artwork: patch.artwork || void 0 } : {}
      } : t
    );
    const byId = {};
    for (const t of tracks) byId[t.id] = t;
    const albums = buildAlbums(tracks);
    const artists = buildArtists(tracks, albums);
    await saveTracks(tracks);
    set2({ tracks, byId, albums, artists });
  },
  toggleFavourite: async (trackId) => {
    const tracks = get2().tracks.map(
      (t) => t.id === trackId ? { ...t, favouritedAt: t.favouritedAt ? void 0 : Date.now() } : t
    );
    const byId = {};
    for (const t of tracks) byId[t.id] = t;
    await saveTracks(tracks);
    set2({ tracks, byId });
  },
  removeFromMostListened: async (trackId) => {
    const topExcluded = { ...get2().topExcluded, [trackId]: true };
    await saveTopExcluded(topExcluded);
    set2({ topExcluded });
  },
  createPlaylist: (name) => {
    const id = `pl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const playlists = [...get2().playlists, { id, name, createdAt: Date.now(), trackIds: [] }];
    set2({ playlists });
    void savePlaylists(playlists);
    return id;
  },
  deletePlaylist: (id) => {
    const playlists = get2().playlists.filter((p) => p.id !== id);
    set2({ playlists });
    void savePlaylists(playlists);
  },
  renamePlaylist: (id, name) => {
    const playlists = get2().playlists.map((p) => p.id === id ? { ...p, name } : p);
    set2({ playlists });
    void savePlaylists(playlists);
  },
  addToPlaylist: (playlistId, trackIds) => {
    const playlists = get2().playlists.map(
      (p) => p.id === playlistId ? { ...p, trackIds: [...p.trackIds, ...trackIds.filter((id) => !p.trackIds.includes(id))] } : p
    );
    set2({ playlists });
    void savePlaylists(playlists);
  },
  removeFromPlaylist: (playlistId, trackId) => {
    const playlists = get2().playlists.map((p) => p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) } : p);
    set2({ playlists });
    void savePlaylists(playlists);
  },
  removeTrackFromLibrary: async (trackId) => {
    const merged = get2().tracks.filter((t) => t.id !== trackId);
    const byId = {};
    for (const t of merged) byId[t.id] = t;
    const albums = buildAlbums(merged);
    const artists = buildArtists(merged, albums);
    await saveTracks(merged);
    await removeTrackStorage(trackId);
    fileCache.delete(trackId);
    handleCache.delete(trackId);
    set2({ tracks: merged, byId, albums, artists });
    if (merged.length === 0) set2({ status: "empty" });
  },
  resolveFile: async (trackId) => {
    const cached = fileCache.get(trackId);
    if (cached) return cached;
    const track = get2().byId[trackId];
    if (!track) return null;
    if (track.source === "file") {
      const blob = await loadFileBlob(trackId);
      if (blob) {
        fileCache.set(trackId, blob);
        return blob;
      }
      return null;
    }
    let handle = handleCache.get(trackId);
    if (!handle) {
      handle = await loadHandle(trackId) ?? void 0;
      if (handle) handleCache.set(trackId, handle);
    }
    if (!handle) return null;
    try {
      const file = await handle.getFile();
      fileCache.set(trackId, file);
      return file;
    } catch {
      return null;
    }
  }
}));
async function finalizeImport(set2, get2, newTracks) {
  const existing = get2().tracks.filter((t) => !newTracks.some((n) => n.id === t.id));
  const merged = [...existing, ...newTracks];
  const byId = {};
  for (const t of merged) byId[t.id] = t;
  const albums = buildAlbums(merged);
  const artists = buildArtists(merged, albums);
  await saveTracks(merged);
  set2({
    tracks: merged,
    byId,
    albums,
    artists,
    status: "ready",
    scanning: false,
    scanProgress: null,
    lastScanCount: newTracks.length
  });
}
async function runScan(set2, get2, dir) {
  set2({ scanning: true, scanProgress: { scanned: 0, found: 0 } });
  const existingIds = new Set(get2().tracks.map((t) => t.id));
  let lastSet = 0;
  const result = await scanMusicDirectory(dir, (scanned, found) => {
    const now = Date.now();
    if (now - lastSet > 120) {
      lastSet = now;
      set2({ scanProgress: { scanned, found } });
    }
  }, existingIds);
  const existing = get2().tracks;
  const mergedMap = new Map(existing.map((t) => [t.id, t]));
  for (const t of result.tracks) mergedMap.set(t.id, t);
  const merged = [...mergedMap.values()];
  const byId = {};
  for (const t of merged) byId[t.id] = t;
  const albums = buildAlbums(merged);
  const artists = buildArtists(merged, albums);
  await saveTracks(merged);
  set2({
    tracks: merged,
    byId,
    albums,
    artists,
    status: "ready",
    scanning: false,
    scanProgress: null,
    lastScanCount: result.tracks.length
  });
}
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
var AUTO_FAVOURITES_ID = "auto-favourites";
var AUTO_MOST_LISTENED_ID = "auto-most-listened";
var AUTO_PLAYLISTS = [
  { id: AUTO_FAVOURITES_ID, name: "Favourites" },
  { id: AUTO_MOST_LISTENED_ID, name: "Most Listened" }
];
function isAutoPlaylist(id) {
  return id === AUTO_FAVOURITES_ID || id === AUTO_MOST_LISTENED_ID;
}
function getFavourites(tracks) {
  return tracks.filter((t) => !!t.favouritedAt).sort((a, b) => (b.favouritedAt ?? 0) - (a.favouritedAt ?? 0));
}
function getMostListened(tracks, playCounts, topExcluded) {
  return tracks.filter((t) => !topExcluded[t.id] && (playCounts[t.id] ?? 0) > 0).sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0));
}
export {
  AUTO_FAVOURITES_ID,
  AUTO_MOST_LISTENED_ID,
  AUTO_PLAYLISTS,
  formatTime,
  getFavourites,
  getMostListened,
  isAutoPlaylist,
  useLibrary
};
