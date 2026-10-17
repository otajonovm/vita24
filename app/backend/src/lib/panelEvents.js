const clients = new Map();

function subscribe(branchId, res) {
  const key = String(branchId);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);
  return () => {
    const set = clients.get(key);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) clients.delete(key);
  };
}

function publish(branchId, event) {
  const set = clients.get(String(branchId));
  if (!set || set.size === 0) return;
  const payload = `event: ${event.type || "update"}\ndata: ${JSON.stringify({
    ...event,
    at: new Date().toISOString(),
  })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}

module.exports = {
  subscribe,
  publish,
};
