/**
 * PostgreSQL interactive transaction defaults.
 * Prisma's built-in 5s timeout is too short for stock snapshots.
 */
const dbTransactionOptions = {
  maxWait: 10_000,
  timeout: 20_000,
};

function runDbTransaction(client, work, options = {}) {
  return client.$transaction(work, {
    ...dbTransactionOptions,
    ...options,
  });
}

module.exports = {
  dbTransactionOptions,
  runDbTransaction,
};
