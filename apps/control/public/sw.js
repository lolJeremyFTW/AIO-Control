// Web Push service worker for AIO Control. Lives at /aio/sw.js because of
// the basePath. Receives push events, shows a notification, and on click
// either focuses an existing tab or opens the URL the server sent.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "AIO Control", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "AIO Control";
  const options = {
    body: data.body || "",
    tag: data.tag,
    data: { url: data.url || "/aio/" },
    icon: "/aio/icon-192.png",
    badge: "/aio/badge-72.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/aio/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url.includes(url) && "focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});
