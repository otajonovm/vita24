const { ZodError } = require("zod");
const { sendError } = require("../lib/response");

function formatZodIssues(error) {
  return error.issues.map((issue) => issue.message);
}

/**
 * Universal Zod validatsiya middleware.
 * @param {import("zod").ZodTypeAny} schema
 * @param {"body"|"query"|"params"} source
 */
function validateRequest(schema, source = "body") {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source] ?? {});
      req[source] = parsed;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodIssues(error);
        return sendError(
          res,
          400,
          "VALIDATION_ERROR",
          details.join("; ") || "Kiruvchi ma'lumotlar noto'g'ri"
        );
      }
      return next(error);
    }
  };
}

module.exports = {
  validateRequest,
};
