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

export function sendLocalNotification(title: string, body: string, url = "/app") {
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    icon: "/r2-logo.png",
    badge: "/r2-logo.png",
    silent: false,
  });
  n.onclick = () => {
    window.focus();
    n.close();
    window.location.href = url;
  };
}
