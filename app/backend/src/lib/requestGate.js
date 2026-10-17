function createRequestGate() {
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

module.exports = { createRequestGate };
