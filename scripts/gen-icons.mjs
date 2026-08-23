// Generates PWA PNG icons without any dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Draw the ♫ glyph with supersampled anti-aliasing. Returns alpha coverage 0..1.
function coverage(px, py, size) {
  // coordinates normalized to 64-unit design space
  const x = (px / size) * 64;
  const y = (py / size) * 64;
  const inCircle = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const inRect = (rx, ry, rw, rh) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;

  // two note heads (rotated ellipses approximated by circles)
  const head1 = inCircle(21.5, 44.5, 5.2);
  const head2 = inCircle(41.5, 39.5, 5.2);
  // stems
  const stemL = x >= 24.6 && x <= 27.6 && y >= 19 && y <= 44.5;
  const stemR = x >= 44.6 && x <= 47.6 && y >= 14.5 && y <= 40;
  // beam connecting stems at top
  const beam =
    x >= 24.6 && x <= 47.6 &&
    y >= 14.5 + ((27.6 - x) / (27.6 - 24.6)) * 0 && // flat-ish
    (() => {
      // slanted beam: top edge slants from (24.6,17) to (47.6,12.5)
      const t = (x - 24.6) / (47.6 - 24.6);
      const topY = 17 - t * 4.5;
      return y >= topY && y <= topY + 4.6;
    })();
  return head1 || head2 || stemL || stemR || beam ? 1 : 0;
}

function render(size, paddingRatio) {
  const SS = 3; // supersample factor
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          acc += coverage(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, size);
        }
      }
      const noteAlpha = acc / (SS * SS);

      // background gradient #fb5c74 -> #fa233b (vertical), rounded corners
      const t = py / size;
      let r = Math.round(0xfb + (0xfa - 0xfb) * t);
      let g = Math.round(0x5c + (0x23 - 0x5c) * t);
      const b = 0x3b + (0x3b - 0x3b);

      // rounded-rect mask (radius 22%)
      const radius = size * 0.22;
      const cx = Math.min(Math.max(px, radius), size - radius);
      const cy = Math.min(Math.max(py, radius), size - radius);
      const dist = Math.hypot(px - cx, py - cy);
      const maskAlpha = dist <= radius ? 1 : Math.max(0, Math.min(1, radius - dist + 1));

      // white note over gradient
      const nr = 255, ng = 255, nb = 255;
      const a = noteAlpha;
      r = Math.round(r * (1 - a) + nr * a);
      g = Math.round(g * (1 - a) + ng * a);
      const bb = Math.round(b * (1 - a) + nb * a);

      const idx = (py * size + px) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = bb;
      rgba[idx + 3] = Math.round(maskAlpha * 255);
    }
  }
  void paddingRatio;
  return encodePNG(size, size, rgba);
}

// For maskable icons, keep content within safe zone (80%)
function renderMaskable(size) {
  // scale down the whole drawing by drawing into padded canvas via coordinate transform
  const scale = 0.78;
  const offset = size * (1 - scale) / 2;
  const SS = 3;
  const rgba = Buffer.alloc(size * size * 4);
  const sample = (px, py) => coverage((px - offset) / scale, (py - offset) / scale, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) acc += sample(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS);
      const a = acc / (SS * SS);
      const idx = (py * size + px) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = Math.round(a * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
writeFileSync('public/icons/icon-maskable-512.png', renderMaskable(512));
console.log('icons generated');
