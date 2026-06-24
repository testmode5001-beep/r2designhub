const VAPID_PUBLIC_KEY = "BHEBrHR9uGw70FUj5qvRhFMP50gdd2DPWMjEYha8MxjAj1UOZRsMlcoxUAcxMuiJx-1vmC7rpgodthSfHUR52Uk";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

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

export async function subscribeToPush(userId: string, supabase: any) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("[Push] ServiceWorker ou PushManager não suportado");
    return;
  }
  const permission = await requestNotificationPermission();
  if (!permission) {
    console.warn("[Push] Permissão negada");
    return;
  }

  const reg = await navigator.serviceWorker.ready;
  console.log("[Push] SW ready:", reg);

  let subscription = await reg.pushManager.getSubscription();
  console.log("[Push] Subscription existente:", subscription);

  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    console.log("[Push] Nova subscription criada:", subscription);
  }

  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    subscription: subscription.toJSON(),
  }, { onConflict: "user_id" });

  if (error) console.error("[Push] Erro ao salvar subscription:", error);
  else console.log("[Push] Subscription salva com sucesso");
}

export async function sendLocalNotification(title: string, body: string, url = "/app") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
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
  const n = new Notification(title, { body, icon: "/r2-logo.png" });
  n.onclick = () => { window.focus(); n.close(); window.location.href = url; };
}
