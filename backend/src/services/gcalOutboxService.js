import { query } from '../config/database.js';

/**
 * Enqueue a Google Calendar operation for asynchronous, retryable processing.
 *
 * Hooks in routes/entities.js call this instead of invoking
 * googleCalendarService directly, so a transient Google API failure does not
 * lose the operation. The gcalOutboxWorker drains this table.
 *
 * @param {Object}  args
 * @param {string}  args.agentId        — UUID of the owner of the calendar
 * @param {string}  args.activityId     — UUID of the activity row
 * @param {string}  args.activityTable  — 'activities' | 'activities_pj'
 * @param {string}  args.op             — 'create' | 'update' | 'delete'
 * @param {Object}  args.payload        — Snapshot of fields needed to (re)build
 *                                        the Google Calendar event request.
 *                                        For create/update: { type, description,
 *                                        scheduled_at, completed }.
 *                                        For delete: { google_event_id } (best
 *                                        effort; the worker will re-read it
 *                                        from the activity row at execution
 *                                        time as a fallback).
 */
export async function enqueueGcalOp({ agentId, activityId, activityTable, op, payload }) {
  if (!agentId || !activityTable || !op) {
    console.warn('[GCal Outbox] Skipping enqueue — missing required fields',
      { agentId, activityTable, op });
    return null;
  }
  if (!['activities', 'activities_pj'].includes(activityTable)) {
    console.warn('[GCal Outbox] Invalid activity_table:', activityTable);
    return null;
  }
  if (!['create', 'update', 'delete'].includes(op)) {
    console.warn('[GCal Outbox] Invalid op:', op);
    return null;
  }

  try {
    const result = await query(
      `INSERT INTO gcal_event_outbox
        (agent_id, activity_id, activity_table, op, payload, status, next_retry_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', NOW())
       RETURNING id`,
      [agentId, activityId || null, activityTable, op, JSON.stringify(payload || {})]
    );
    return result.rows[0]?.id || null;
  } catch (err) {
    // Never let an enqueue failure break the user-facing request.
    console.error('[GCal Outbox] enqueue failed:', err.message);
    return null;
  }
}
