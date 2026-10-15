(function () {
  const watchers = new Set();
  let member = null;

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error("The Voyage session has expired. Reload to sign in again."); }
    if (!response.ok) {
      const error = new Error(result.error || `Request failed (${response.status})`);
      if (result.error === "Guest action not allowed") error.code = "guest_forbidden";
      throw error;
    }
    return result;
  }

  function notifyWatchers() {
    for (const watcher of watchers) void watcher.poll();
  }

  function checkGuestWrite(collection, method) {
    if (member?.role !== "guest") return;
    const allowed = collection === "reads" || collection === "channels" || collection === "messages" ||
      (method === "PATCH" && ["opps", "activities", "activity", "notes"].includes(collection));
    if (allowed) return;
    for (const watcher of watchers) watcher.resync();
    const error = new Error("Guests cannot create or delete CRM entries");
    error.code = "guest_forbidden";
    throw error;
  }

  function watch(path, convert, callback, onError, interval = 3000) {
    let previous = "";
    let busy = false;
    const watcher = {
      async poll() {
        if (busy) return;
        busy = true;
        try {
          const raw = await request(path);
          const signature = JSON.stringify(raw);
          if (signature !== previous) {
            previous = signature;
            callback(convert(raw));
          }
        } catch (error) { if (onError) onError(error); }
        finally { busy = false; }
      },
      resync() { previous = ""; void watcher.poll(); },
    };
    watchers.add(watcher);
    void watcher.poll();
    const timer = setInterval(() => { if (!document.hidden) void watcher.poll(); }, interval);
    return () => { clearInterval(timer); watchers.delete(watcher); };
  }

  const docSnapshot = raw => ({ exists: raw.exists, data: () => raw.data });
  const listSnapshot = raw => ({ docs: raw.docs.map(item => ({ id: item.id, data: () => item.data })) });

  function documentRef(collection, id) {
    if (!id) id = crypto.randomUUID();
    const url = `/api/document/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
    return {
      id,
      async set(data) { checkGuestWrite(collection, "PUT"); await request(url, { method: "PUT", body: JSON.stringify(data) }); notifyWatchers(); },
      async update(data) { checkGuestWrite(collection, "PATCH"); await request(url, { method: "PATCH", body: JSON.stringify(data) }); notifyWatchers(); },
      async delete() { checkGuestWrite(collection, "DELETE"); await request(url, { method: "DELETE" }); notifyWatchers(); },
      onSnapshot(callback, onError) { return watch(url, docSnapshot, callback, onError); },
    };
  }

  function collectionRef(collection, query = {}) {
    const params = new URLSearchParams();
    if (query.limit) params.set("limit", String(query.limit));
    const url = `/api/collection/${encodeURIComponent(collection)}${params.size ? `?${params}` : ""}`;
    return {
      doc(id) { return documentRef(collection, id); },
      async add(data) {
        checkGuestWrite(collection, "POST");
        const { id } = await request(`/api/collection/${encodeURIComponent(collection)}`, { method: "POST", body: JSON.stringify(data) });
        notifyWatchers();
        return documentRef(collection, id);
      },
      orderBy() { return this; },
      limit(count) { return collectionRef(collection, { limit: count }); },
      onSnapshot(callback, onError) { return watch(url, listSnapshot, callback, onError, collection === "messages" ? 2000 : 3000); },
    };
  }

  window.voyageDb = {
    async init() { member = await request("/api/me"); return member; },
    doc(path) { const [collection, id] = path.split("/"); return documentRef(collection, id); },
    collection: collectionRef,
    get member() { return member; },
    // Re-read everything now, after a change made through a custom endpoint (deals, sequences, files).
    refresh() { notifyWatchers(); },
  };

  let state = { view: "dash", typing: null };
  let peerCallback = null;
  let peerTimer = null;
  async function sendPresence() {
    if (!member) return;
    await request("/api/presence", { method: "POST", body: JSON.stringify(state) });
  }
  async function pollPeers() {
    if (!member || !peerCallback) return;
    const { peers } = await request("/api/presence");
    peerCallback({ peers: peers.map(peer => ({ isMe: peer.isMe, presence: { who: peer.who, view: peer.view, typing: peer.typing } })) });
  }
  window.voyageRoom = {
    async presence(patch) {
      state = { ...state, ...patch };
      await sendPresence();
      await pollPeers();
    },
    onPeers(callback, onError) {
      peerCallback = callback;
      if (peerTimer) clearInterval(peerTimer);
      peerTimer = setInterval(() => {
        void sendPresence().then(pollPeers).catch(error => { if (onError) onError(error); });
      }, 6000);
      void sendPresence().then(pollPeers).catch(error => { if (onError) onError(error); });
      return () => { clearInterval(peerTimer); peerTimer = null; peerCallback = null; };
    },
  };

  // Usage events are queued and sent in small batches. Failures are dropped: usage must never get in the way.
  const usageQueue = [];
  function flushUsage(leaving) {
    if (!member || !usageQueue.length) return;
    const body = JSON.stringify({ events: usageQueue.splice(0, 50) });
    fetch("/api/usage", { method: "POST", credentials: "same-origin", keepalive: !!leaving, headers: { "content-type": "application/json" }, body }).catch(() => {});
  }
  setInterval(() => flushUsage(false), 15000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushUsage(true); });
  window.addEventListener("pagehide", () => flushUsage(true));
  window.voyageUsage = {
    track(kind, view, action) {
      usageQueue.push({ kind, view, ...(action ? { action } : {}), ts: Date.now() });
      if (usageQueue.length >= 20) flushUsage(false);
    },
  };
})();
