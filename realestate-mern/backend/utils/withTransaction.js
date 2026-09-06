const mongoose = require('mongoose');

/**
 * Runs `fn(session)` inside a single MongoDB transaction when the deployment
 * supports it (replica set / mongos), and falls back to running the writes
 * sequentially without a session on standalone single-node deployments
 * (typical local/dev setups). This guarantees the spec v2 invariant - e.g. a
 * property can never end up marked sold without a matching commission record
 * - on production replicas, while keeping dev environments usable.
 *
 * IMPORTANT rules for `fn`:
 *  - Pass `session` into every mongoose write/find call:
 *      Model.create([doc], opts(session))
 *      doc.save(opts(session))
 *      Model.findOneAndUpdate(filter, update, opts(session))
 *  - `fn` must contain ONLY database writes/reads. Side effects that cannot
 *    be rolled back or retried (emails, notifications, websocket pushes)
 *    must run AFTER runWithTransaction resolves.
 *  - Use the `opts` helper exported below to build options.
 */
const isTxnUnsupported = (err) => {
  if (!err) return false;
  const msg = String(err.message || err.errmsg || '');
  return (
    err.code === 20 || // Illegal Operation on standalone
    err.codeName === 'IllegalOperation' ||
    /Transaction numbers are only allowed/i.test(msg) ||
    /transactions are not supported/i.test(msg) ||
    /replica set members or mongos/i.test(msg)
  );
};

// Build mongoose options carrying the session when one exists.
const opts = (session, extra = {}) => (session ? { session, ...extra } : { ...extra });

const runWithTransaction = async (fn) => {
  const conn = mongoose.connection;

  // Connection not established yet or driver without session support
  if (!conn || typeof conn.startSession !== 'function') {
    return fn(null);
  }

  let session;
  try {
    session = await conn.startSession();
  } catch (err) {
    // Session could not even be started - run without a transaction
    return fn(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isTxnUnsupported(err)) {
      // Standalone deployment - apply the writes sequentially instead.
      return fn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { runWithTransaction, opts };
