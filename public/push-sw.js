self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let message;
  try {
    message = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(message.title || "Nueva solicitud", {
      body: message.body || "Hay una nueva solicitud pendiente.",
      icon: "/panelplus-icon.svg",
      badge: "/panelplus-icon.svg",
      tag: message.tag || "nueva-solicitud",
      renotify: false,
      silent: false,
      vibrate: [200, 100, 200],
      data: { url: message.url || "/solicitudes" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/solicitudes", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
