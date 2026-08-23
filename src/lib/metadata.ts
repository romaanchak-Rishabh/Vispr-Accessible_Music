interface RawTags {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  year?: number;
  trackNo?: number;
  pictureBlob?: Blob;
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  try {
    switch (encoding) {
      case 0:
        return new TextDecoder('iso-8859-1').decode(bytes);
      case 1: {
        const hasBom = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
        return new TextDecoder(hasBom ? 'utf-16' : 'utf-16le').decode(bytes);
      }
      case 2:
        return new TextDecoder('utf-16be').decode(bytes);
      default:
        return new TextDecoder('utf-8').decode(bytes);
    }
  } catch {
    return '';
  }
}

function cleanTag(s: string): string {
  return s.replace(/\0+$/g, '').trim();
}

async function readID3(file: File): Promise<RawTags> {
  const tags: RawTags = {};
  const header = new Uint8Array(10);
  const head = await file.slice(0, 10).arrayBuffer();
  header.set(new Uint8Array(head));
  if (!(header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33)) return tags;
  const major = header[3];
  if (major < 2 || major > 4) return tags;
  const size = ((header[6] & 0x7f) << 21) | ((header[7] & 0x7f) << 14) | ((header[8] & 0x7f) << 7) | (header[9] & 0x7f);
  const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 3 * 1024 * 1024)).arrayBuffer());
  let pos = 0;
  const frameHeaderSize = major === 2 ? 6 : 10;
  while (pos + frameHeaderSize <= buf.length) {
    if (buf[pos] === 0) break;
    let frameId: string;
    let frameSize: number;
    if (major === 2) {
      frameId = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2]);
      frameSize = (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5];
      pos += 6;
    } else {
      frameId = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
      if (major === 4) {
        frameSize =
          ((buf[pos + 4] & 0x7f) << 21) | ((buf[pos + 5] & 0x7f) << 14) | ((buf[pos + 6] & 0x7f) << 7) | (buf[pos + 7] & 0x7f);
      } else {
        frameSize = (buf[pos + 4] << 24) | (buf[pos + 5] << 16) | (buf[pos + 6] << 8) | buf[pos + 7];
      }
      pos += 10;
    }
    if (frameSize <= 0 || pos + frameSize > buf.length) break;
    const body = buf.subarray(pos, pos + frameSize);
    pos += frameSize;
    if (frameId === 'TIT2' || frameId === 'TT2') tags.title = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === 'TPE1' || frameId === 'TP1') tags.artist = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === 'TALB' || frameId === 'TAL') tags.album = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === 'TPE2' || frameId === 'TP2') tags.albumArtist = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === 'TCON' || frameId === 'TCO') tags.genre = cleanTag(decodeText(body.subarray(1), body[0]));
    else if (frameId === 'TRCK' || frameId === 'TRK') {
      const t = cleanTag(decodeText(body.subarray(1), body[0]));
      const n = parseInt(t.split('/')[0], 10);
      if (!isNaN(n)) tags.trackNo = n;
    } else if (frameId === 'TYER' || frameId === 'TDRC' || frameId === 'TYE') {
      const y = parseInt(cleanTag(decodeText(body.subarray(1), body[0])).slice(0, 4), 10);
      if (!isNaN(y)) tags.year = y;
    } else if ((frameId === 'APIC' && major >= 3) || (frameId === 'PIC' && major === 2)) {
      try {
        if (major === 2) {
          const imgType = String.fromCharCode(body[1], body[2], body[3]);
          let i = 4;
          while (i < body.length && body[i] !== 0) i++;
          i++;
          const encByte = body[0];
          i++; // picture type byte already consumed? PIC layout: enc(1) format(3) type(1) desc
          i++;
          const mime = imgType === 'PNG' ? 'image/png' : 'image/jpeg';
          tags.pictureBlob = new Blob([body.slice(i)], { type: mime });
          void encByte;
        } else {
          const enc = body[0];
          let i = 1;
          let mimeStr = 'image/jpeg';
          if (body[i] === 0x69 && body[i + 1] === 0x6d && body[i + 2] === 0x61 && body[i + 3] === 0x67) {
            let j = i;
            while (j < body.length && body[j] !== 0) j++;
            mimeStr = new TextDecoder('iso-8859-1').decode(body.subarray(i, j));
            i = j + 1;
          } else {
            i += 3;
          }
          i += 1; // picture type
          // skip description per encoding
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
        /* ignore artwork errors */
      }
    }
  }
  return tags;
}

const MP4_TAGS: Record<string, keyof RawTags> = {
  '\u00a9nam': 'title',
  '\u00a9ART': 'artist',
  '\u00a9alb': 'album',
  aART: 'albumArtist',
  '\u00a9gen': 'genre',
  '\u00a9day': 'year',
  trkn: 'trackNo'
};

async function readMP4(file: File): Promise<RawTags> {
  const tags: RawTags = {};
  const maxRead = Math.min(file.size, 12 * 1024 * 1024);
  const buf = new Uint8Array(await file.slice(0, maxRead).arrayBuffer());
  const view = new DataView(buf.buffer);
  const fourccAt = (i: number) => String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);

  for (let i = 0; i < buf.length - 16; i++) {
    const cc = fourccAt(i);
    if (!(cc in MP4_TAGS)) continue;
    try {
      // data atom follows: size(4) 'data'(4) versionFlags(4) locale(4) payload...
      const dataSize = view.getUint32(i + 4);
      const payloadStart = i + 16;
      const payloadEnd = Math.min(payloadStart + Math.max(0, dataSize - 16), buf.length);
      const key = MP4_TAGS[cc];
      if (key === 'trackNo') {
        if (payloadEnd - payloadStart >= 4) {
          const n = view.getUint16(payloadStart + 2);
          if (n > 0) tags.trackNo = n;
        }
      } else if (key === 'year') {
        const s = cleanTag(new TextDecoder('utf-8').decode(buf.subarray(payloadStart, payloadEnd)));
        const y = parseInt(s.slice(0, 4), 10);
        if (!isNaN(y)) tags.year = y;
      } else if (key === 'title' || key === 'artist' || key === 'album' || key === 'albumArtist' || key === 'genre') {
        const s = cleanTag(new TextDecoder('utf-8').decode(buf.subarray(payloadStart, payloadEnd)));
        if (s) (tags as Record<string, unknown>)[key] = s;
      } else if (cc === 'covr') {
        const slice = buf.slice(payloadStart, payloadEnd);
        const isPng = slice[0] === 0x89 && slice[1] === 0x50;
        tags.pictureBlob = new Blob([slice], { type: isPng ? 'image/png' : 'image/jpeg' });
      }
      if (cc === 'covr') {
        /* handled above */
      }
    } catch {
      /* ignore */
    }
  }
  return tags;
}

async function readFlac(file: File): Promise<RawTags> {
  const tags: RawTags = {};
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!(head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43)) return tags;
  let offset = 4;
  for (let block = 0; block < 16; block++) {
    if (offset + 4 > file.size) break;
    const bh = new Uint8Array(await file.slice(offset, offset + 4).arrayBuffer());
    const isLast = (bh[0] & 0x80) !== 0;
    const blockType = bh[0] & 0x7f;
    const blockLen = (bh[1] << 16) | (bh[2] << 8) | bh[3];
    const dataOffset = offset + 4;
    if (blockType === 4) {
      // VORBIS_COMMENT
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
        const entry = new TextDecoder('utf-8').decode(data.subarray(p, p + len));
        p += len;
        const eq = entry.indexOf('=');
        if (eq < 0) continue;
        const k = entry.slice(0, eq).toUpperCase();
        const v = cleanTag(entry.slice(eq + 1));
        if (k === 'TITLE') tags.title = v;
        else if (k === 'ARTIST') tags.artist = v;
        else if (k === 'ALBUM') tags.album = v;
        else if (k === 'ALBUMARTIST') tags.albumArtist = v;
        else if (k === 'GENRE') tags.genre = v;
        else if (k === 'DATE' || k === 'YEAR') {
          const y = parseInt(v.slice(0, 4), 10);
          if (!isNaN(y)) tags.year = y;
        } else if (k === 'TRACKNUMBER') {
          const n = parseInt(v, 10);
          if (!isNaN(n)) tags.trackNo = n;
        }
      }
    } else if (blockType === 6) {
      // PICTURE
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
        /* ignore */
      }
    }
    offset = dataOffset + blockLen;
    if (isLast) break;
  }
  return tags;
}

export function parseFilename(fileName: string): { title: string; artist?: string; trackNo?: number } {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  let trackNo: number | undefined;
  const noMatch = base.match(/^(\d{1,3})[\s.\-]+(.+)$/);
  let rest = base;
  if (noMatch && noMatch[2].length > 2) {
    trackNo = parseInt(noMatch[1], 10);
    rest = noMatch[2].trim();
  }
  const parts = rest.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    if (title.length > 0) return { title, artist, trackNo };
  }
  return { title: rest, trackNo };
}

export async function extractMetadata(file: File, fallbackPath: string): Promise<RawTags> {
  const lower = file.name.toLowerCase();
  let tags: RawTags = {};
  try {
    if (lower.endsWith('.mp3')) tags = await readID3(file);
    else if (lower.endsWith('.m4a') || lower.endsWith('.mp4') || lower.endsWith('.aac')) tags = await readMP4(file);
    else if (lower.endsWith('.flac')) tags = await readFlac(file);
    else if (lower.endsWith('.ogg') || lower.endsWith('.oga') || lower.endsWith('.opus')) {
      // Try ID3-style first (some ogg files carry ID3), then vorbis comments are complex — fall back to filename
      tags = await readID3(file);
    }
  } catch {
    tags = {};
  }

  if (!tags.title || !tags.artist) {
    const fn = parseFilename(fallbackPath.split('/').pop() ?? file.name);
    if (!tags.title) tags.title = fn.title;
    if (!tags.artist && fn.artist) tags.artist = fn.artist;
    if (fn.trackNo !== undefined && tags.trackNo === undefined) tags.trackNo = fn.trackNo;
  }
  if (!tags.artist) tags.artist = 'Unknown Artist';
  if (!tags.album) tags.album = 'Unknown Album';
  return tags;
}

export async function blobToDataUrl(blob: Blob, maxSize = 512): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }
}
