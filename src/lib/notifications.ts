export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    return reg;
  } catch {
    return null;
  }
}

export async function sendLocalNotification(title: string, body: string, url = "/app") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  // Mobile: usa Service Worker (obrigatório no iOS/Android)
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: "/r2-logo.png",
        badge: "/r2-logo.png",
        vibrate: [200, 100, 200],
        data: { url },
      });
      return;
    }
  }

  // Desktop fallback
  const n = new Notification(title, { body, icon: "/r2-logo.png" });
  n.onclick = () => { window.focus(); n.close(); window.location.href = url; };
}
