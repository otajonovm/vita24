export function createRequestGate() {
  let current = 0;
  return {
    next() {
      current += 1;
      return current;
    },
    isLatest(id) {
      return id === current;
    },
  };
}

export function isCanceled(error) {
  return error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError";
}
