/**
 * Meme Cat Phone & Desktop Chrome Notification Service
 * 
 * Supports:
 * - Chrome on Android (requires ServiceWorkerRegistration.showNotification)
 * - Chrome on Desktop
 * - Vibration patterns [200, 100, 200]
 * - Direct tap-to-open token on GMGN / DexScreener
 */

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'default', 'granted', 'denied'
}

export async function initServiceWorker() {
  if (!isNotificationSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.warn('[Meme Cat SW] Registration notice:', err.message);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    alert('Browser notifications are not supported on this browser.');
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await initServiceWorker();
      await sendTestNotification();
    }
    return permission;
  } catch (err) {
    console.warn('[Meme Cat Notifications] Permission request error:', err.message);
    return 'denied';
  }
}

export async function showTokenNotification(token, title = 'MEME_CAT Match') {
  if (getNotificationPermission() !== 'granted') return false;

  const targetUrl = token?.gmgnUrl || token?.url || '/';
  const bodyText = `$${token?.symbol || 'TOKEN'} • MCap: $${Math.round(token?.marketCap || 0).toLocaleString()} • Smart: ${token?.smartMoneyCount ?? 0} • KOL: ${token?.kolCount ?? 0}`;

  try {
    // 1. Mobile Chrome (Android) REQUIRES service worker showNotification
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body: bodyText,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: `sol-radar-${token?.address || Date.now()}`,
          renotify: true,
          vibrate: [200, 100, 200],
          data: { url: targetUrl },
        });
        return true;
      }
    }

    // 2. Desktop Fallback
    if (typeof Notification !== 'undefined') {
      const notif = new Notification(title, {
        body: bodyText,
        icon: '/favicon.svg',
        data: { url: targetUrl },
      });
      notif.onclick = () => {
        window.focus();
        window.open(targetUrl, '_blank');
      };
      return true;
    }
  } catch (err) {
    console.warn('[MEME_CAT Notifications] Notification dispatch notice:', err.message);
  }
  return false;
}

export async function sendTestNotification() {
  return showTokenNotification(
    {
      symbol: 'SOL',
      marketCap: 420000,
      smartMoneyCount: 5,
      kolCount: 2,
      url: window.location.href,
    },
    'MEME_CAT: Phone Notifications Activated'
  );
}
