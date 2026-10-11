// Only this handler displays task OS notifications. IndexedDB survives SW restarts.
const PUSH_RECEIPT_DB = "statedock-push-receipts";
function openPushDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_RECEIPT_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("receipts", { keyPath: "id" });
      request.result.createObjectStore("settings");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function pushAccount(userId) {
  const db = await openPushDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put(userId, "account");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function claimPushNotice(notice) {
  const db = await openPushDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["receipts", "settings"], "readwrite");
      const receipts = tx.objectStore("receipts");
      const settings = tx.objectStore("settings");
      let claimed = false;
      const account = settings.get("account");
      account.onsuccess = () => {
        // A signed-out or switched browser must not reveal the old user's task.
        if (account.result !== undefined && account.result !== notice.userId) return;
        const id = `${notice.userId}:${notice.eventId}`;
        const request = receipts.get(id);
        request.onsuccess = () => {
          if (request.result) return;
          receipts.put({ id, at: Date.now() });
          claimed = true;
          const cleanup = receipts.openCursor();
          cleanup.onsuccess = () => {
            const cursor = cleanup.result;
            if (!cursor) return;
            if (cursor.value.at < Date.now() - 7 * 86400000) cursor.delete();
            cursor.continue();
          };
        };
      };
      tx.oncomplete = () => resolve(claimed);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function releasePushNotice(notice) {
  const db = await openPushDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("receipts", "readwrite");
      tx.objectStore("receipts").delete(`${notice.userId}:${notice.eventId}`);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
self.addEventListener("message", (event) => {
  if (
    event.data?.type === "PUSH_ACCOUNT" &&
    (event.data.userId === null || typeof event.data.userId === "string")
  ) {
    event.waitUntil(pushAccount(event.data.userId));
  }
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let notice;
      try {
        notice = event.data?.json();
      } catch {
        return;
      }
      if (
        !notice ||
        typeof notice.eventId !== "string" ||
        typeof notice.userId !== "string" ||
        typeof notice.title !== "string" ||
        typeof notice.body !== "string"
      )
        return;
      if (!(await claimPushNotice(notice))) return;
      try {
        await self.registration.showNotification(notice.title, {
          body: notice.body,
          icon: "/icons/statedock-192.png",
          badge: "/icons/favicon-32x32.png",
          tag: `statedock:${notice.userId}:${notice.eventId}`,
          renotify: false,
          data: { ...notice, sequence: Number(notice.eventId) },
        });
      } catch (error) {
        await releasePushNotice(notice);
        throw error;
      }
    })(),
  );
});
