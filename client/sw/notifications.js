// @ts-nocheck -- built for ServiceWorkerGlobalScope.
export function registerNotificationHandlers() {
  self.addEventListener('push', (event) => {
    if (!event.data) return;
    let payload;
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'Nodecal', body: event.data.text() };
    }
    event.waitUntil(
      self.registration.showNotification(payload.title || 'Nodecal', {
        body: payload.body || '',
        icon: '/icons/icon.svg',
        tag: payload.tag || undefined,
      }),
    );
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        for (const windowClient of windows) {
          if ('focus' in windowClient) return windowClient.focus();
        }
        return clients.openWindow('/');
      }),
    );
  });
}
