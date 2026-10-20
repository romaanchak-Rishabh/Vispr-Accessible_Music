/**
 * Generate docs/screenshots/*.png from the live app (mobile viewport, dark theme).
 *
 * Usage:
 *   npm run dev                 # in one terminal (or vite on :5173)
 *   node scripts/gen-docs-shots.mjs
 *
 * Seeds a small demo library (generated sine-wave WAVs + gradient artwork) into
 * IndexedDB so every screen has content. Best-effort: each screenshot is
 * captured independently; failures are logged and skipped.
 */
import { chromium } from 'playwright';
import LZString from 'lz-string';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const BASE = process.env.APP_URL || 'http://localhost:5173';

fs.mkdirSync(OUT, { recursive: true });

// ── tiny sine-wave WAV (8s) ─────────────────────────────────────────────
function makeWav(freq, seconds = 8, rate = 16000) {
  const n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 800, (n - i) / 1600);
    const v = Math.sin((2 * Math.PI * freq * i) / rate) * 0.28 * env;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// Real famous songs (official YouTube uploads) across languages — artwork is the
// same i.ytimg.com thumbnail a real import would store.
const DEMO = [
  { id: 'demo-1', title: 'Kesariya', artist: 'Arijit Singh', album: 'Brahmastra', genre1: 'Bollywood', year: 2022, trackNo: 1, freq: 440, yt: 'BddP6PYo2gs', duration: 173, language: 'Hindi', mood: 'romantic' },
  { id: 'demo-2', title: 'Apna Bana Le', artist: 'Arijit Singh', album: 'Bhediya', genre1: 'Bollywood', year: 2022, trackNo: 2, freq: 392, yt: 'ElZfdU54Cp8', duration: 205, language: 'Hindi', mood: 'romantic' },
  { id: 'demo-3', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', genre1: 'Pop', year: 2020, trackNo: 1, freq: 349.23, yt: '4NRXx6U8ABQ', duration: 263, language: 'English', mood: 'energetic' },
  { id: 'demo-4', title: 'Shape of You', artist: 'Ed Sheeran', album: 'Divide', genre1: 'Pop', year: 2017, trackNo: 2, freq: 329.63, yt: 'JGwWNGJdvx8', art: 'hqdefault', duration: 264, language: 'English', mood: 'upbeat' },
  { id: 'demo-5', title: 'Dynamite', artist: 'BTS', album: 'BE', genre1: 'K-Pop', year: 2020, trackNo: 1, freq: 293.66, yt: 'gdZLi9oWNZg', duration: 224, language: 'Korean', mood: 'upbeat' },
  { id: 'demo-6', title: 'How You Like That', artist: 'BLACKPINK', album: 'THE ALBUM', genre1: 'K-Pop', year: 2020, trackNo: 2, freq: 261.63, yt: 'ioNng23DkIM', duration: 184, language: 'Korean', mood: 'energetic' },
  { id: 'demo-7', title: 'cold/mess', artist: 'Prateek Kuhad', album: 'when the home is at its own', genre1: 'Indie', year: 2018, trackNo: 1, freq: 277.18, yt: 'Il7Nv270zNk', duration: 368, language: 'English', mood: 'melancholic' },
  { id: 'demo-8', title: 'Heat Waves', artist: 'Glass Animals', album: 'Dreamland', genre1: 'Indie', year: 2020, trackNo: 2, freq: 311.13, yt: 'mRD0-GxqHVo', duration: 236, language: 'English', mood: 'nostalgic' }
];

// Share payload for the Paste Share walkthrough (LZ-compressed, like the app
// produces) — two more famous songs with real YouTube artwork
function makeShareText() {
  const wav = makeWav(330, 4);
  const b64 = wav.toString('base64');
  const payload = {
    v: 1,
    type: 'playlist',
    playlistName: 'Fresh Finds',
    tracks: [
      {
        id: 'share-1', title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia',
        genre1: 'Pop', year: 2020, trackNo: 1, duration: 231, fileName: 'Levitating.wav',
        audioData: `data:audio/wav;base64,${b64}`, artwork: 'https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg'
      },
      {
        id: 'share-2', title: 'Seven', artist: 'Jung Kook', album: 'GOLDEN',
        genre1: 'K-Pop', year: 2023, trackNo: 2, duration: 227, fileName: 'Seven.wav',
        audioData: `data:audio/wav;base64,${b64}`, artwork: 'https://i.ytimg.com/vi/QU9c0053UAU/maxresdefault.jpg'
      }
    ],
    playlistName_: undefined
  };
  delete payload.playlistName_;
  return LZString.compressToBase64(JSON.stringify(payload));
}

async function shot(page, name) {
  // Let any in-viewport artwork (remote YouTube thumbnails) finish loading
  await page
    .evaluate(
      () =>
        new Promise((resolve) => {
          const imgs = [...document.images].filter((i) => {
            const r = i.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.width > 0;
          });
          const pending = imgs.filter((i) => !i.complete);
          if (pending.length === 0) resolve();
          let left = pending.length;
          const done = () => {
            if (--left <= 0) resolve();
          };
          for (const i of pending) {
            i.addEventListener('load', done, { once: true });
            i.addEventListener('error', done, { once: true });
          }
          setTimeout(resolve, 5000);
        })
    )
    .catch(() => {});
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  console.log(`  captured ${name}`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  // Seed persisted settings (dark/red) + play counts before the app boots
  await page.addInitScript(() => {
    localStorage.setItem(
      'app-settings',
      JSON.stringify({
        state: { ytdlpServer: '', ytdlpToken: '', serverMode: 'auto', confirmImport: true, youtubeApiKey: '', theme: 'dark', accent: 'red' },
        version: 0
      })
    );
    localStorage.setItem(
      'player-state',
      JSON.stringify({
        state: { playCounts: { 'demo-5': 31, 'demo-1': 24, 'demo-3': 18, 'demo-8': 15, 'demo-6': 12, 'demo-4': 11, 'demo-7': 9, 'demo-2': 7 } },
        version: 0
      })
    );
  });

  console.log(`opening ${BASE} …`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  // ── seed demo library into IndexedDB (idb-keyval default store) ──────
  await page.evaluate(async ({ demo }) => {
    const wavCache = {};
    function makeWav(freq, seconds = 8, rate = 16000) {
      if (wavCache[freq]) return wavCache[freq];
      const n = rate * seconds;
      const data = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const env = Math.min(1, i / 800, (n - i) / 1600);
        data[i] = Math.max(-32767, Math.min(32767, Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 0.28 * env * 32767)));
      }
      const header = new ArrayBuffer(44);
      const v = new DataView(header);
      const s = (off, str) => [...str].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
      s(0, 'RIFF'); v.setUint32(4, 36 + data.byteLength, true); s(8, 'WAVE'); s(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      s(36, 'data'); v.setUint32(40, data.byteLength, true);
      const blob = new Blob([header, data.buffer], { type: 'audio/wav' });
      wavCache[freq] = blob;
      return blob;
    }

    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const store = db.transaction('keyval', 'readwrite').objectStore('keyval');
    const put = (k, v) => new Promise((res, rej) => {
      const r = store.put(v, k);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });

    const now = Date.now();
    const tracks = demo.map((d, i) => ({
      id: d.id, title: d.title, artist: d.artist, album: d.album,
      genre1: d.genre1, year: d.year, trackNo: d.trackNo,
      language: d.language, mood: d.mood,
      fileName: `${d.title}.wav`, path: `${d.title}.wav`,
      source: 'file', size: makeWav(d.freq).size, addedAt: now - (demo.length - i) * 86400000,
      duration: d.duration,
      artwork: `https://i.ytimg.com/vi/${d.yt}/${d.art ?? 'maxresdefault'}.jpg`
    }));
    await put('library:tracks', tracks);
    for (const d of demo) {
      const blob = makeWav(d.freq);
      await put(`library:file:${d.id}`, new File([blob], `${d.title}.wav`, { type: 'audio/wav' }));
    }
    await put('library:playlists', [
      { id: 'pl-1', name: 'Desi Drive', trackIds: ['demo-1', 'demo-2', 'demo-7'], createdAt: now - 3 * 86400000 },
      { id: 'pl-2', name: 'K-Pop Nights', trackIds: ['demo-5', 'demo-6'], createdAt: now - 2 * 86400000 },
      { id: 'pl-3', name: 'Global Hits', trackIds: ['demo-3', 'demo-4', 'demo-8'], createdAt: now - 86400000 }
    ]);
    db.close();
  }, { demo: DEMO });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  // dismiss install banner if present
  try {
    const dismiss = page.locator('button[aria-label="Dismiss"]');
    if (await dismiss.isVisible({ timeout: 800 })) await dismiss.click();
  } catch { /* not shown */ }

  const goTab = async (label) => {
    await closeAnySheet();
    await page.locator('nav.tabbar button', { hasText: label }).first().click();
    await page.waitForTimeout(900);
  };

  const closeAnySheet = async () => {
    for (let i = 0; i < 4; i++) {
      const overlays = page.locator('.sheet-overlay');
      if ((await overlays.count()) === 0) return;
      const cancel = page.locator('button.action-cancel, .action-sheet button:has-text("Cancel")').first();
      if (await cancel.isVisible().catch(() => false)) {
        await cancel.click().catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
        await overlays.first().click({ position: { x: 8, y: 8 } }).catch(() => {});
      }
      await page.waitForTimeout(400);
    }
  };

  // 1. Listen Now
  try {
    await goTab('Listen Now');
    await page.waitForTimeout(600);
    await shot(page, '01-listen-now.png');
  } catch (e) { console.log('  SKIP 01:', e.message); }

  // 2. Library → Songs (import bar + share buttons + track list)
  try {
    await goTab('Library');
    await shot(page, '02-library-songs.png');
  } catch (e) { console.log('  SKIP 02:', e.message); }

  // 3. Song ⋯ menu (ActionSheet: Favourites / Play Next / Share Song / Edit …)
  try {
    await page.locator('button[aria-label="More options"]').first().click();
    await page.waitForTimeout(600);
    await shot(page, '03-song-actions.png');
    await closeAnySheet();
  } catch (e) { console.log('  SKIP 03:', e.message); }

  // 4+5. Play a song → mini player → Now Playing sheet → Queue sheet
  try {
    await page.locator('button.row').first().click();
    await page.waitForTimeout(1000);
    await page.locator('.mini-player-main').click();
    await page.waitForTimeout(800);
    await shot(page, '04-now-playing.png');
    await page.locator('.nowplaying-overlay button', { hasText: 'Queue' }).first().click();
    await page.waitForTimeout(600);
    await shot(page, '05-queue.png');
    await closeAnySheet();
    await page.locator('button[aria-label="Close"]').click().catch(() => {});
    await page.waitForTimeout(400);
    await closeAnySheet();
  } catch (e) { console.log('  SKIP 04/05:', e.message); }

  // 6+7. Settings: server/notifications + backup
  try {
    await goTab('Settings');
    await page.locator('input[placeholder*="yt-dlp server"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, '06-settings-server.png');
    await page.locator('text=Export library').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, '07-settings-backup.png');
  } catch (e) { console.log('  SKIP 06/07:', e.message); }

  // 8+9. Paste Share sheet → parsed incoming share
  try {
    await goTab('Library');
    await page.locator('button', { hasText: 'Paste Share' }).first().click();
    await page.waitForTimeout(500);
    await shot(page, '08-paste-share.png');
    const shareText = makeShareText();
    await page.locator('textarea').fill(shareText);
    await page.waitForTimeout(200);
    await page.locator('.action-sheet button', { hasText: 'Import' }).first().click();
    await page.waitForTimeout(800);
    await shot(page, '09-incoming-share.png');
    await closeAnySheet();
  } catch (e) { console.log('  SKIP 08/09:', e.message); }

  // 10. Import wizard + AI metadata analysis — resolve + Gemini are mocked so
  //     this does not depend on the live tunnel or a valid Gemini key; the UI
  //     still runs its real enrichment flow against the mocked responses.
  try {
    await goTab('Library');
    const fakeItems = [
      {
        id: 'jNQXAC9IVRw',
        title: 'Aayega Aanewala (Song) Lata Mangeshkar',
        webpage_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        uploader: 'Saregama Music',
        duration: 212,
        thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
        playlist_title: null
      }
    ];
    await page.route('**/api/resolve*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: fakeItems }) })
    );
    const geminiSuggestion = {
      title: 'Aayega Aanewala',
      artists: ['Lata Mangeshkar', 'Shailendra'],
      album: 'Kismat',
      year: 1968,
      genres: ['Bollywood', 'Classical', 'Filmi'],
      language: 'Hindi',
      mood: 'romantic',
      tags: ['classic', 'golden era', 'filmi'],
      isMashup: false,
      isRemix: false,
      remixer: null
    };
    await page.route('**/generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(geminiSuggestion) }] } }]
        })
      })
    );
    await page.locator('input[placeholder*="YouTube"]').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    // The Add button is the input's sibling in ImportBar's flex row
    await page.locator('input[placeholder*="YouTube"] ~ button', { hasText: 'Add' }).first().click();
    try {
      await page.waitForSelector('.sheet-overlay', { timeout: 20000 });
    } catch {
      const err = await page.locator('text=/failed|Resolve/i').first().textContent().catch(() => null);
      console.log('  wizard did not open' + (err ? ` — page said: ${err}` : ''));
      throw new Error('wizard did not open');
    }
    // Prefer the "AI found metadata" chip; fall back to the analyzing state
    try {
      await page.locator('text=AI found metadata').first().waitFor({ timeout: 12000 });
      console.log('  AI suggestion chip visible');
    } catch {
      try {
        await page.locator('text=AI analyzing').first().waitFor({ timeout: 2000 });
        console.log('  AI analyzing state visible (suggestion pending)');
      } catch { console.log('  AI chip not observed — screenshotting wizard as-is'); }
    }
    await page.waitForTimeout(400);
    await shot(page, '10-ai-analysis.png');
    await closeAnySheet();
    await page.unroute('**/api/resolve*');
    await page.unroute('**/generativelanguage.googleapis.com/**');
  } catch (e) { console.log('  SKIP 10:', e.message); }

  await browser.close();
  console.log('done →', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
