import { query } from '../config/database.js';
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from '../services/googleCalendarService.js';

// Stable bigint key for pg_advisory_lock — picked to be unique within this app.
// Used as a singleton lock so concurrent ticks (e.g. multiple processes or a
// long tick overlapping the next interval) do not double-process rows.
const ADVISORY_LOCK_KEY = 7428309211n;

const MAX_BATCH = 20;
const BACKOFF_BASE_MINUTES = 1;   // first retry ~1 min after first failure
const BACKOFF_CAP_MINUTES = 60;   // cap exponential growth at 60 min
const STALE_PROCESSING_MINUTES = 5; // reap 'processing' rows stuck longer than this

let isProcessing = false;

function backoffMinutes(attempts) {
  // attempts is the new attempt count after failure (>=1).
  const exp = Math.min(2 ** Math.max(0, attempts - 1), Math.ceil(BACKOFF_CAP_MINUTES / BACKOFF_BASE_MINUTES));
  return Math.min(BACKOFF_BASE_MINUTES * exp, BACKOFF_CAP_MINUTES);
}

async function claimRow(id) {
  // Atomic claim: only succeeds if the row is still in pending/failed AND
  // its retry window is due. Returns the row if claimed.
  const result = await query(
    `UPDATE gcal_event_outbox
        SET status = 'processing', updated_at = NOW()
      WHERE id = $1
        AND status IN ('pending','failed')
        AND next_retry_at <= NOW()
      RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

async function markSucceeded(id) {
  await query(
    `UPDATE gcal_event_outbox
        SET status = 'succeeded', last_error = NULL, updated_at = NOW()
      WHERE id = $1`,
    [id]
  );
}

async function markFailed(id, attempts, errorMessage) {
  const minutes = backoffMinutes(attempts);
  await query(
    `UPDATE gcal_event_outbox
        SET status = 'failed',
            attempts = $2,
            last_error = $3,
            next_retry_at = NOW() + ($4 || ' minutes')::interval,
            updated_at = NOW()
      WHERE id = $1`,
    [id, attempts, String(errorMessage || '').slice(0, 2000), minutes]
  );
}

async function getActivityGoogleEventId(activityTable, activityId) {
  if (!activityId) return null;
  const safeTable = activityTable === 'activities' ? 'activities' : 'activities_pj';
  const r = await query(
    `SELECT google_event_id FROM ${safeTable} WHERE id = $1`,
    [activityId]
  );
  return r.rows[0]?.google_event_id || null;
}

async function setActivityGoogleEventId(activityTable, activityId, googleEventId) {
  if (!activityId) return;
  const safeTable = activityTable === 'activities' ? 'activities' : 'activities_pj';
  await query(
    `UPDATE ${safeTable} SET google_event_id = $1 WHERE id = $2`,
    [googleEventId, activityId]
  );
}

async function activityExists(activityTable, activityId) {
  if (!activityId) return false;
  const safeTable = activityTable === 'activities' ? 'activities' : 'activities_pj';
  const r = await query(`SELECT 1 FROM ${safeTable} WHERE id = $1`, [activityId]);
  return r.rows.length > 0;
}

async function reapStaleProcessing() {
  // Recovery path: if a previous tick crashed between claimRow() and
  // markSucceeded/markFailed, the row sits in 'processing' forever.
  // Push such rows back to 'failed' with attempts++ so they get retried
  // through the normal backoff path.
  const r = await query(
    `UPDATE gcal_event_outbox
        SET status = 'failed',
            attempts = attempts + 1,
            last_error = COALESCE(last_error, '') || ' [reaped stale processing]',
            next_retry_at = NOW(),
            updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - ($1 || ' minutes')::interval
      RETURNING id`,
    [STALE_PROCESSING_MINUTES]
  );
  if (r.rows.length > 0) {
    console.warn(`[GCal Outbox] Reaped ${r.rows.length} stale 'processing' row(s).`);
  }
}

async function processRow(row) {
  const { id, agent_id, activity_id, activity_table, op, payload, attempts } = row;
  const nextAttempts = attempts + 1;

  try {
    if (op === 'create') {
      // Race guard: if the source activity was deleted between enqueue and
      // execution (and the delete hook couldn't enqueue a counter-delete
      // because google_event_id was still null), skip the create. Otherwise
      // we would leave an orphan event in the user's Google Calendar that
      // SalesTwo no longer knows about.
      if (activity_id && !(await activityExists(activity_table, activity_id))) {
        console.log(`[GCal Outbox] ${id} create canceled — activity ${activity_id} no longer exists.`);
        await markSucceeded(id);
        return;
      }
      // Idempotency: if the activity already has a google_event_id (e.g.
      // worker crashed after Google insert but before status update), skip
      // the insert and treat as success — avoids duplicating events.
      const existing = await getActivityGoogleEventId(activity_table, activity_id);
      if (existing) {
        console.log(`[GCal Outbox] ${id} create skipped — activity already has google_event_id ${existing}`);
        await markSucceeded(id);
        return;
      }
      const result = await createGoogleEvent(agent_id, {
        id: activity_id,
        type: payload.type,
        description: payload.description,
        scheduled_at: payload.scheduled_at,
      });
      if (result?.id) {
        await setActivityGoogleEventId(activity_table, activity_id, result.id);
      }
      await markSucceeded(id);
      return;
    }

    if (op === 'update') {
      // Resolve google_event_id at execution time so a freshly-created event
      // (still in the outbox) can be picked up by a later tick.
      const googleEventId = await getActivityGoogleEventId(activity_table, activity_id);
      if (!googleEventId) {
        // Create not yet processed — defer this update.
        await markFailed(id, nextAttempts, 'Awaiting google_event_id (create still pending)');
        return;
      }
      await updateGoogleEvent(agent_id, googleEventId, {
        type: payload.type,
        description: payload.description,
        scheduled_at: payload.scheduled_at,
        completed: payload.completed,
      });
      await markSucceeded(id);
      return;
    }

    if (op === 'delete') {
      const googleEventId = payload?.google_event_id
        || (await getActivityGoogleEventId(activity_table, activity_id));
      if (!googleEventId) {
        await markSucceeded(id); // nothing to delete
        return;
      }
      await deleteGoogleEvent(agent_id, googleEventId);
      // If activity still exists, clear its google_event_id.
      if (activity_id) {
        await setActivityGoogleEventId(activity_table, activity_id, null);
      }
      await markSucceeded(id);
      return;
    }

    await markFailed(id, nextAttempts, `Unknown op: ${op}`);
  } catch (err) {
    console.error(`[GCal Outbox] ${id} (${op}) failed attempt ${nextAttempts}:`, err.message);
    await markFailed(id, nextAttempts, err.message);
  }
}

export async function processOutbox() {
  if (isProcessing) return; // in-process re-entry guard
  isProcessing = true;

  try {
    // Cluster-wide singleton via Postgres advisory lock. If another instance
    // (or another tick on this instance) already holds it, skip this tick.
    const lockRes = await query('SELECT pg_try_advisory_lock($1) AS got', [ADVISORY_LOCK_KEY.toString()]);
    if (!lockRes.rows[0]?.got) return;

    try {
      // Recover any rows orphaned in 'processing' by a previous crash.
      await reapStaleProcessing();

      // Pick up to MAX_BATCH due rows, oldest first.
      const candidates = await query(
        `SELECT id FROM gcal_event_outbox
          WHERE status IN ('pending','failed')
            AND next_retry_at <= NOW()
          ORDER BY next_retry_at ASC
          LIMIT $1`,
        [MAX_BATCH]
      );

      for (const { id } of candidates.rows) {
        const row = await claimRow(id);
        if (!row) continue; // another worker took it (defensive)
        await processRow(row);
      }
    } finally {
      await query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY.toString()]);
    }
  } catch (err) {
    console.error('[GCal Outbox] worker tick error:', err.message);
  } finally {
    isProcessing = false;
  }
}

export function startOutboxWorker(intervalMs = 30 * 1000) {
  console.log(`[GCal Outbox] Worker scheduled every ${intervalMs / 1000}s.`);
  // Initial kick after a short delay so the DB schema is fully ready.
  setTimeout(() => processOutbox().catch(e => console.error('[GCal Outbox] initial tick:', e.message)), 5000);
  return setInterval(() => {
    processOutbox().catch(e => console.error('[GCal Outbox] tick error:', e.message));
  }, intervalMs);
}
