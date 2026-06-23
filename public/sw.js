self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "R2 Design Hub", {
      body: data.body ?? "",
      icon: "/r2-logo.png",
      badge: "/r2-logo.png",
      vibrate: [200, 100, 200],
      tag: data.tag ?? "r2-notification",
      renotify: true,
      data: { url: data.url ?? "/app" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      const url = event.notification.data?.url ?? "/app";
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
