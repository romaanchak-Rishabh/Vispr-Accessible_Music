/* Telegram notifier for tunnel changes.
 *
 * Setup:
 *   1. In Telegram, message @BotFather -> /newbot -> pick a name -> copy the HTTP API token.
 *   2. Message your new bot anything (so it knows your chat).
 *   3. node telegram-notify.cjs test   -> auto-detects your chat and sends a test message.
 *
 * Tunnel change: node telegram-notify.cjs https://xxxx.trycloudflare.com "Optional extra title"
 */
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, 'tunnel-config.json');
const API = 'https://api.telegram.org/bot';

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch {
    return null;
  }
}

async function call(token, method, body) {
  const r = await fetch(`${API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} from Telegram`);
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram error: ${j.description || 'unknown'}`);
  return j.result;
}

async function main() {
  const cfg = loadConfig();
  const tg = cfg && cfg.telegram;
  if (!tg || !tg.enabled || !tg.botToken) {
    console.log('[tg] telegram not enabled in tunnel-config.json');
    process.exit(0);
  }

  const token = tg.botToken;
  const target = (process.argv[2] || '').trim();
  const isTest = !target;
  let chatId = (tg.chatId || '').trim();

  if (!chatId && !isTest) {
    console.log('[tg] no chatId configured - run `node telegram-notify.cjs test` first');
    process.exit(0);
  }

  if (!chatId) {
    const updates = await call(token, 'getUpdates');
    const chats = [...new Set(updates.map((u) =>
      (u.message && u.message.chat.id) || (u.channel_post && u.channel_post.chat.id)
    ).filter(Boolean))];
    if (!chats.length) {
      console.log('[tg] no chats found. Open your bot in Telegram and send it any message, then re-run.');
      process.exit(1);
    }
    chatId = chats[chats.length - 1];
  }

  let text;
  if (isTest) {
    text = 'Vispr tunnel notifier test - telegram channel connected.';
  } else {
    text = 'Vispr backend moved (tunnel restarted):\n' + target + '\n\nThe app updates automatically.';
  }

  const sent = await call(token, 'sendMessage', { chat_id: chatId, text });
  console.log(`[tg] sent to chat ${sent.chat.id} (${sent.chat.type})`);

  if (isTest) {
    const cfgObj = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    if (!cfgObj.telegram) cfgObj.telegram = {};
    cfgObj.telegram.chatId = String(chatId);
    cfgObj.telegram.enabled = true;
    fs.writeFileSync(CONFIG, JSON.stringify(cfgObj, null, 2));
    console.log(`[tg] saved chatId ${chatId} into tunnel-config.json`);
  }
}

main().catch((e) => {
  console.error('[tg] error:', e.message);
  process.exit(1);
});