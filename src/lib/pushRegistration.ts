/**
 * Push notification registration — registers this device with the server
 * so it can receive background push notifications when the app is closed.
 *
 * Uses the Web Push API (VAPID) — no Firebase JS SDK needed on the client.
 * The server holds the VAPID public key at GET /api/push/vapid-public-key.
 */

import { useSettings } from '../store/settings';

const VAPID_PUBLIC_KEY_CACHE_KEY = 'vispr-vapid-pub';
const PUSH_SUB_KEY = 'vispr-push-sub';

/** Fetch the VAPID public key from the server (cached in localStorage). */
async function getVapidPublicKey(server: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${server}/api/push/vapid-public-key`, {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const data = await r.json();
    const key = (data as { key?: string }).key;
    if (key) localStorage.setItem(VAPID_PUBLIC_KEY_CACHE_KEY, key);
    return key ?? null;
  } catch {
    return localStorage.getItem(VAPID_PUBLIC_KEY_CACHE_KEY);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Register for push notifications and upload the subscription to the server.
 * Returns true if successfully registered, false otherwise.
 */
export async function registerForPush(): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') return false;

  const server = useSettings.getState().ytdlpServer;
  if (!server) return false;

  try {
    // Get VAPID key from server
    const vapidKey = await getVapidPublicKey(server);
    if (!vapidKey) {
      console.warn('[push] No VAPID key from server — Firebase may not be configured');
      return false;
    }

    // Wait for service worker to be ready
    const reg = await navigator.serviceWorker.ready;

    // Check for existing subscription
    let sub = await reg.pushManager.getSubscription();

    // If no subscription, create one
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    // Upload subscription to server
    const subJson = sub.toJSON();
    const resp = await fetch(`${server}/api/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subJson }),
    });

    if (resp.ok) {
      localStorage.setItem(PUSH_SUB_KEY, '1');
      console.log('[push] Registered with server');
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[push] Registration failed:', e);
    return false;
  }
}

/**
 * Unregister this device from push notifications.
 */
export async function unregisterPush(): Promise<void> {
  const server = useSettings.getState().ytdlpServer;
  if (!server) return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await fetch(`${server}/api/push/unregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    }
    localStorage.removeItem(PUSH_SUB_KEY);
  } catch {
    /* best-effort */
  }
}
