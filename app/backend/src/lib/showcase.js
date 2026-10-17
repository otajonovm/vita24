const SHOWCASE_LIMIT = 20;

function showcaseOrderError(currentIds, ids, max = SHOWCASE_LIMIT) {
  if (!Array.isArray(ids) || ids.length > max) return "limit";
  if (new Set(ids).size !== ids.length) return "duplicate";
  if (ids.length !== currentIds.length || ids.some((id) => !currentIds.includes(id))) return "stale";
  return "";
}

module.exports = {
  SHOWCASE_LIMIT,
  showcaseOrderError,
};
