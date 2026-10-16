(function () {
  const watchers = new Set();
  let member = null;
  let lastActivity = Date.now();
  let blocked = false;
  let offline = false;
  window.addEventListener("offline", () => { offline = true; });
  window.addEventListener("online", () => { offline = false; lastActivity = Date.now(); });
  let retryAt = 0;
  let failures = 0;
  let probeBusy = false;
  const active = () => !document.hidden && Date.now() - lastActivity < 60000;
  const mayPoll = () => !blocked && !offline && active() && Date.now() >= retryAt && !probeBusy;
  for (const event of ["pointerdown", "keydown", "pointermove", "focus"]) {
    window.addEventListener(event, () => { lastActivity = Date.now(); }, { passive: true });
  }
  function syncFailure(error) {
    if ([401, 429].includes(error.status)) blocked = true;
    else retryAt = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(failures++, 5));
    window.dispatchEvent(new CustomEvent("voyage-sync-error", { detail: error.message }));
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
    });
    if ([401, 429].includes(response.status)) {
      const error = new Error(response.status === 429
        ? "Cloudflare request limit reached. Automatic sync is paused; try again after the daily allowance resets."
        : "Your session cannot access live data. Sign in again to reconnect.");
      error.status = response.status;
      syncFailure(error);
      throw error;
    }
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

  function notifyWatchers(collection) {
    for (const watcher of watchers) {
      if (!collection || watcher.collection === collection) void watcher.poll();
    }
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

  function watch(path, convert, callback, onError, interval = 60000) {
    let previous = "";
    let busy = false;
    const watcher = {
      collection: decodeURIComponent(path.split("/")[3].split("?")[0]),
      async poll() {
        if (busy || !mayPoll()) return;
        busy = true;
        const probing = failures > 0;
        if (probing) probeBusy = true;
        try {
          const raw = await request(path);
          failures = 0;
          retryAt = 0;
          const signature = JSON.stringify(raw);
          if (signature !== previous) {
            previous = signature;
            callback(convert(raw));
          }
        } catch (error) { if (!error.status) syncFailure(error); if (onError) onError(error); }
        finally { busy = false; if (probing) probeBusy = false; }
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
      async set(data) { checkGuestWrite(collection, "PUT"); await request(url, { method: "PUT", body: JSON.stringify(data) }); notifyWatchers(collection); },
      async update(data) { checkGuestWrite(collection, "PATCH"); await request(url, { method: "PATCH", body: JSON.stringify(data) }); notifyWatchers(collection); },
      async delete() { checkGuestWrite(collection, "DELETE"); await request(url, { method: "DELETE" }); notifyWatchers(collection); },
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
        notifyWatchers(collection);
        return documentRef(collection, id);
      },
      orderBy() { return this; },
      limit(count) { return collectionRef(collection, { limit: count }); },
      onSnapshot(callback, onError) { return watch(url, listSnapshot, callback, onError, 60000); },
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
    if (!member || !mayPoll()) return;
    await request("/api/presence", { method: "POST", body: JSON.stringify({ ...state, typing: null }) });
  }
  async function pollPeers() {
    if (!member || !peerCallback || !mayPoll()) return;
    const { peers } = await request("/api/presence");
    peerCallback({ peers: peers.map(peer => ({ isMe: peer.isMe, presence: { who: peer.who, view: peer.view, typing: peer.typing } })) });
  }
  window.voyageRoom = {
    async presence(patch) {
      state = { ...state, ...patch };
      // Coalesce navigation and typing changes into the next bounded heartbeat.
    },
    onPeers(callback, onError) {
      peerCallback = callback;
      if (peerTimer) clearInterval(peerTimer);
      peerTimer = setInterval(() => {
        void sendPresence().then(pollPeers).catch(error => { if (!error.status) syncFailure(error); if (onError) onError(error); });
      }, 60000);
      void sendPresence().then(pollPeers).catch(error => { if (!error.status) syncFailure(error); if (onError) onError(error); });
      return () => { clearInterval(peerTimer); peerTimer = null; peerCallback = null; };
    },
  };

  // Usage events are queued and sent in small batches. Failures are dropped: usage must never get in the way.
  const usageQueue = [];
  function flushUsage(leaving) {
    if (!member || blocked || !usageQueue.length) return;
    const body = JSON.stringify({ events: usageQueue.splice(0, 50) });
    fetch("/api/usage", { method: "POST", credentials: "same-origin", keepalive: !!leaving, headers: { "content-type": "application/json" }, body }).catch(() => {});
  }
  setInterval(() => flushUsage(false), 15000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushUsage(true); });
  window.addEventListener("pagehide", () => flushUsage(true));
  window.voyageUsage = {
    track(kind, view, action) {
      if (blocked) return;
      usageQueue.push({ kind, view, ...(action ? { action } : {}), ts: Date.now() });
      if (usageQueue.length >= 20) flushUsage(false);
    },
  };
})();
