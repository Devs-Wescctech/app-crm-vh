import { google } from 'googleapis';
import { query } from '../config/database.js';
import crypto from 'crypto';
import { encrypt, decrypt } from '../utils/cryptoTokens.js';
import { getConfig as getGCalConfig, isConfigured as isGCalConfigured } from './googleCalendarConfigService.js';

// OAuth scope (Phase 1.2) — minimum privilege: events only.
// Tokens granted before this change carry the legacy scope
// 'https://www.googleapis.com/auth/calendar' (broader). The
// `granted_scope` column on google_calendar_tokens lets the UI
// detect outdated grants and prompt reconnection.
export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
// Phase 5.1 — minimal extra scope so we can read calendarList.list to populate
// the seller's "target calendar" picker. Strictly read-only and metadata-only.
export const GCAL_CALENDARLIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const GCAL_LEGACY_SCOPE = 'https://www.googleapis.com/auth/calendar';

async function getOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = await getGCalConfig();

  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [
      !clientId && 'GCAL_CLIENT_ID',
      !clientSecret && 'GCAL_CLIENT_SECRET',
      !redirectUri && 'GCAL_REDIRECT_URI',
    ].filter(Boolean).join(', ');
    console.error(`[GCal] ${missing} not configured. Set via Settings → Google Agenda (admin) or environment variables.`);
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getAuthenticatedClient(agentId) {
  const oauth2 = await getOAuth2Client();
  if (!oauth2) return null;

  const result = await query(
    'SELECT * FROM google_calendar_tokens WHERE agent_id = $1',
    [agentId]
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) return null;

  let accessTokenPlain;
  let refreshTokenPlain;
  try {
    accessTokenPlain = decrypt(tokenRow.access_token);
    refreshTokenPlain = decrypt(tokenRow.refresh_token);
  } catch (err) {
    console.error('[GCal] Failed to decrypt token for agent', agentId, '-', err.message);
    return null;
  }

  oauth2.setCredentials({
    access_token: accessTokenPlain,
    refresh_token: refreshTokenPlain,
    expiry_date: tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : undefined,
  });

  oauth2.on('tokens', async (tokens) => {
    try {
      const updates = [];
      const values = [];
      let idx = 1;
      if (tokens.access_token) {
        updates.push(`access_token = $${idx++}`);
        values.push(encrypt(tokens.access_token));
      }
      if (tokens.expiry_date) {
        updates.push(`token_expiry = $${idx++}`);
        values.push(new Date(tokens.expiry_date).toISOString());
      }
      updates.push(`updated_at = NOW()`);
      values.push(agentId);
      await query(
        `UPDATE google_calendar_tokens SET ${updates.join(', ')} WHERE agent_id = $${idx}`,
        values
      );
    } catch (err) {
      console.error('[GCal] Error refreshing token:', err.message);
    }
  });

  return oauth2;
}

export async function getAuthUrl(agentId) {
  const oauth2 = await getOAuth2Client();
  if (!oauth2) throw new Error('Google Calendar não configurado. Peça ao administrador para preencher Client ID, Client Secret e Redirect URI em Configurações → Google Agenda.');

  const state = crypto.randomBytes(20).toString('hex') + ':' + agentId;

  await query(
    `INSERT INTO system_settings (id, setting_key, setting_value)
     VALUES (uuid_generate_v4(), 'gcal_oauth_state_' || $1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2`,
    [agentId, state]
  );

  // 'openid' + 'email' are the minimum complementary scopes needed to
  // obtain the user's email via OAuth2 userinfo (used to display which
  // Google account is connected). They do NOT grant access to mail or
  // any additional calendar data. The reduced 'calendar.events' scope
  // remains the only data-access scope.
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GCAL_SCOPE, GCAL_CALENDARLIST_SCOPE, 'openid', 'email'],
    state: state,
  });
}

export async function validateOAuthState(state) {
  const agentId = state.split(':').pop();
  const result = await query(
    'SELECT setting_value FROM system_settings WHERE setting_key = $1',
    ['gcal_oauth_state_' + agentId]
  );
  const stored = result.rows[0]?.setting_value;
  if (stored === state) {
    await query('DELETE FROM system_settings WHERE setting_key = $1', ['gcal_oauth_state_' + agentId]);
    return agentId;
  }
  return null;
}

export async function handleCallback(code, agentId) {
  const oauth2 = await getOAuth2Client();
  if (!oauth2) throw new Error('Google Calendar não configurado no servidor');

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Try to read the user's email via OAuth2 userinfo. The reduced scope
  // (calendar.events) does NOT include calendarList.get, so we fall back
  // to OAuth2 v2 userinfo (covered by 'openid'/'email') and finally to
  // the JWT id_token if present. May be null — UI handles it gracefully.
  let calendarEmail = null;
  try {
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const userInfo = await oauth2Api.userinfo.get();
    calendarEmail = userInfo.data.email || null;
  } catch {
    // userinfo requires email/openid scope; skip silently if not granted.
  }

  const grantedScope = tokens.scope || null;
  const encAccess = encrypt(tokens.access_token);
  const encRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  if (encRefresh) {
    await query(
      `INSERT INTO google_calendar_tokens (id, agent_id, access_token, refresh_token, token_expiry, calendar_email, granted_scope)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (agent_id) DO UPDATE SET
         access_token = $2, refresh_token = $3, token_expiry = $4, calendar_email = $5, granted_scope = $6, updated_at = NOW()`,
      [
        agentId,
        encAccess,
        encRefresh,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        calendarEmail,
        grantedScope,
      ]
    );
  } else {
    await query(
      `INSERT INTO google_calendar_tokens (id, agent_id, access_token, refresh_token, token_expiry, calendar_email, granted_scope)
       VALUES (uuid_generate_v4(), $1, $2, '', $3, $4, $5)
       ON CONFLICT (agent_id) DO UPDATE SET
         access_token = $2, token_expiry = $3, calendar_email = $4, granted_scope = $5, updated_at = NOW()`,
      [
        agentId,
        encAccess,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        calendarEmail,
        grantedScope,
      ]
    );
  }

  return { success: true, email: calendarEmail, grantedScope };
}

export async function disconnectAgent(agentId) {
  // Phase 3.2 — Revoke at Google before purging local state.
  // We must revoke even when the local DELETE will succeed, so a leaked
  // or cached refresh_token can no longer be used to mint access tokens.
  // Failures here (already-invalid token, network issue) must NOT block
  // the local removal; we log and continue.
  let revoked = false;
  let revokeError = null;
  try {
    const tokenResult = await query(
      'SELECT refresh_token FROM google_calendar_tokens WHERE agent_id = $1',
      [agentId]
    );
    const tokenRow = tokenResult.rows[0];
    if (tokenRow?.refresh_token) {
      let refreshTokenPlain;
      try {
        refreshTokenPlain = decrypt(tokenRow.refresh_token);
      } catch (decErr) {
        console.warn(`[GCal] Could not decrypt refresh_token for agent ${agentId} during revoke: ${decErr.message}`);
      }
      if (refreshTokenPlain) {
        const oauth2 = await getOAuth2Client();
        if (oauth2) {
          try {
            await oauth2.revokeToken(refreshTokenPlain);
            revoked = true;
            console.log(`[GCal] Revoked Google OAuth token for agent ${agentId}.`);
          } catch (revErr) {
            // Common cases: invalid_token (already revoked), network error.
            revokeError = revErr.message || String(revErr);
            console.warn(`[GCal] revokeToken for agent ${agentId} failed (proceeding with local delete): ${revokeError}`);
          }
        }
      }
    }
  } catch (err) {
    revokeError = err.message || String(err);
    console.warn(`[GCal] Unable to look up token for revoke (agent ${agentId}): ${revokeError}`);
  }

  await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
  // Drain any pending outbox entries for this agent — there is no longer
  // a valid token, so further attempts would only fail and noise up the UI.
  await query("DELETE FROM gcal_event_outbox WHERE agent_id = $1 AND status IN ('pending','failed','processing')", [agentId]);

  return { success: true, revoked, revokeError };
}

function isScopeOutdated(grantedScope) {
  if (!grantedScope) return true;
  // We require BOTH calendar.events (data CRUD) and the calendarlist.readonly
  // scope added in Phase 5.1 (so the seller can pick a target calendar).
  const scopes = grantedScope.split(/\s+/);
  if (!scopes.includes(GCAL_SCOPE)) return true;
  if (!scopes.includes(GCAL_CALENDARLIST_SCOPE)) return true;
  return false;
}

export async function getAgentConnectionStatus(agentId) {
  const configured = await isGCalConfigured();

  const result = await query(
    'SELECT calendar_email, last_sync_at, granted_scope FROM google_calendar_tokens WHERE agent_id = $1',
    [agentId]
  );
  const tokenRow = result.rows[0];

  return {
    configured,
    connected: configured && !!tokenRow,
    calendarEmail: tokenRow?.calendar_email || null,
    lastSync: tokenRow?.last_sync_at || null,
    grantedScope: tokenRow?.granted_scope || null,
    scopeOutdated: tokenRow ? isScopeOutdated(tokenRow.granted_scope) : false,
    requiredScope: GCAL_SCOPE,
  };
}

export async function getConnectionStatus() {
  return {
    configured: await isGCalConfigured(),
    connected: false,
    requiredScope: GCAL_SCOPE,
  };
}

const ACTIVITY_TYPE_LABELS = {
  visit: 'Visita', call: 'Ligação', whatsapp: 'WhatsApp',
  email: 'E-mail', task: 'Tarefa', meeting: 'Reunião',
};

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_DURATION_MINUTES = 60;

// Phase 5.2 — pull the agent's preferred timezone, defaulting to São Paulo.
async function getAgentTimezone(agentId) {
  try {
    const r = await query('SELECT timezone FROM agents WHERE id = $1', [agentId]);
    const tz = r.rows[0]?.timezone;
    return tz && tz.trim() ? tz : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

// Phase 5.1 — return the chosen target_calendar_id, falling back to 'primary'.
async function getTargetCalendarId(agentId) {
  try {
    const r = await query(
      'SELECT target_calendar_id FROM google_calendar_tokens WHERE agent_id = $1',
      [agentId]
    );
    const cid = r.rows[0]?.target_calendar_id;
    return cid && cid.trim() ? cid : 'primary';
  } catch {
    return 'primary';
  }
}

function activityToGCalEvent(activity, timezone) {
  const scheduledAt = new Date(activity.scheduled_at);
  if (isNaN(scheduledAt.getTime())) return null;

  // Phase 5.2 — duration_minutes drives endTime; falls back to legacy `duration`,
  // then to 60 minutes if neither is set.
  const rawDuration = activity.duration_minutes ?? activity.durationMinutes ?? activity.duration;
  const durationMinutes = Number.isFinite(Number(rawDuration)) && Number(rawDuration) > 0
    ? Number(rawDuration)
    : DEFAULT_DURATION_MINUTES;
  const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);
  const tz = timezone || DEFAULT_TIMEZONE;
  const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] || activity.type || 'Atividade';

  return {
    summary: `[SalesTwo] ${typeLabel}: ${activity.description || 'Atividade'}`,
    description: `Tipo: ${typeLabel}\n${activity.description || ''}\n\nCriado pelo SalesTwo`,
    start: { dateTime: scheduledAt.toISOString(), timeZone: tz },
    end: { dateTime: endTime.toISOString(), timeZone: tz },
    colorId: activity.type === 'visit' ? '2' : activity.type === 'call' ? '7' : '9',
  };
}

/**
 * Create an event in Google Calendar.
 *
 * Phase 2.1+: this function NO LONGER persists `google_event_id` on the
 * activity row. That responsibility belongs to gcalOutboxWorker, which
 * updates the activity only after this function returns successfully.
 *
 * @returns {Promise<{id:string}>} on success
 * @throws  {Error}                on Google API failure (worker handles retry)
 */
export async function createGoogleEvent(agentId, activity) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    const err = new Error('Agent not connected to Google Calendar');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const [tz, calendarId] = await Promise.all([
    getAgentTimezone(agentId),
    getTargetCalendarId(agentId),
  ]);
  const event = activityToGCalEvent(activity, tz);
  if (!event) {
    const err = new Error('Activity has invalid scheduled_at');
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const result = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });
    console.log(`[GCal] Event created: ${result.data.id} for activity ${activity.id} (calendar=${calendarId}, tz=${tz})`);
    return { id: result.data.id };
  } catch (error) {
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    throw error;
  }
}

export async function updateGoogleEvent(agentId, googleEventId, activity) {
  if (!googleEventId) {
    const err = new Error('Missing googleEventId for update');
    err.code = 'MISSING_EVENT_ID';
    throw err;
  }
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    const err = new Error('Agent not connected to Google Calendar');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const [tz, calendarId] = await Promise.all([
    getAgentTimezone(agentId),
    getTargetCalendarId(agentId),
  ]);
  const event = activityToGCalEvent(activity, tz);
  if (!event) {
    const err = new Error('Activity has invalid scheduled_at');
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }

  if (activity.completed) {
    event.summary = `✅ ${event.summary}`;
    event.colorId = '8';
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  await calendar.events.update({
    calendarId,
    eventId: googleEventId,
    requestBody: event,
  });
  console.log(`[GCal] Event updated: ${googleEventId}`);
  return true;
}

export async function deleteGoogleEvent(agentId, googleEventId) {
  if (!googleEventId) return true; // nothing to delete is success
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    const err = new Error('Agent not connected to Google Calendar');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  try {
    const calendarId = await getTargetCalendarId(agentId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
    });
    console.log(`[GCal] Event deleted: ${googleEventId}`);
    return true;
  } catch (error) {
    // 404/410 means the event is already gone — treat as success (idempotent).
    if (error.code === 404 || error.code === 410) {
      console.log(`[GCal] Event ${googleEventId} already absent (${error.code}) — treating as deleted.`);
      return true;
    }
    throw error;
  }
}

// Phase 5.1 — list calendars the agent can write to (for the Settings dropdown).
export async function listWritableCalendars(agentId) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    const err = new Error('Agent not connected to Google Calendar');
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  let result;
  try {
    result = await calendar.calendarList.list({ maxResults: 250, showHidden: false });
  } catch (e) {
    // Tokens issued before Phase 5.1 lack calendar.calendarlist.readonly →
    // Google returns 403 insufficient scope. Surface a clear reconnect prompt.
    if (e.code === 403) {
      const err = new Error('Permissão insuficiente para listar calendários. Desconecte e reconecte o Google Calendar.');
      err.code = 'SCOPE_INSUFFICIENT';
      throw err;
    }
    throw e;
  }
  const items = result.data.items || [];
  // Google's accessRole values: owner > writer > reader > freeBusyReader.
  // Anything <= writer means we can create events.
  const writable = items
    .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map(c => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      accessRole: c.accessRole,
      backgroundColor: c.backgroundColor || null,
      timeZone: c.timeZone || null,
    }));
  return writable;
}

// Phase 5.1 — persist the agent's chosen calendar after validating ownership.
export async function setTargetCalendar(agentId, calendarId) {
  if (!calendarId || typeof calendarId !== 'string') {
    const err = new Error('calendarId is required');
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }
  const writable = await listWritableCalendars(agentId);
  const match = writable.find(c => c.id === calendarId);
  if (!match) {
    const err = new Error('Calendar not found or not writable for this agent');
    err.code = 'CALENDAR_NOT_FOUND';
    throw err;
  }
  const updated = await query(
    `UPDATE google_calendar_tokens
        SET target_calendar_id = $1, updated_at = NOW()
      WHERE agent_id = $2
      RETURNING target_calendar_id`,
    [calendarId, agentId]
  );
  if (updated.rowCount === 0) {
    const err = new Error('Agent has no Google Calendar connection');
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  return { calendarId: updated.rows[0].target_calendar_id, summary: match.summary };
}

// Phase 5.1 — exposed so the status endpoint can return the saved selection.
export async function getTargetCalendarForAgent(agentId) {
  return getTargetCalendarId(agentId);
}

export async function fetchGoogleEvents(agentId, timeMin, timeMax) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) return [];

  try {
    const calendarId = await getTargetCalendarId(agentId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const result = await calendar.events.list({
      calendarId,
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || undefined,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return result.data.items || [];
  } catch (error) {
    console.error('[GCal] Error fetching events:', error.message);
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    return [];
  }
}

export async function fetchGoogleEventsMultiAgent(agentIds, timeMin, timeMax) {
  const allEvents = [];
  for (const agentId of agentIds) {
    try {
      const events = await fetchGoogleEvents(agentId, timeMin, timeMax);
      const agentResult = await query('SELECT name FROM agents WHERE id = $1', [agentId]);
      const agentName = agentResult.rows[0]?.name || 'Desconhecido';
      events.forEach(ev => {
        ev._agentId = agentId;
        ev._agentName = agentName;
      });
      allEvents.push(...events);
    } catch (err) {
      console.error(`[GCal] Error fetching events for agent ${agentId}:`, err.message);
    }
  }
  return allEvents;
}

export async function getConnectedAgentIds() {
  const result = await query('SELECT agent_id FROM google_calendar_tokens');
  return result.rows.map(r => r.agent_id);
}

function classifyActivityType(summary) {
  const s = (summary || '').toLowerCase();
  if (s.includes('ligação') || s.includes('call') || s.includes('ligar')) return 'call';
  if (s.includes('visita') || s.includes('visit')) return 'visit';
  if (s.includes('email') || s.includes('e-mail')) return 'email';
  if (s.includes('whatsapp') || s.includes('wpp')) return 'whatsapp';
  if (s.includes('tarefa') || s.includes('task')) return 'task';
  return 'meeting';
}

// Phase 4.1 — Apply a single page of Google events to activities_pj.
// Handles cancelled events (delta sync emits status='cancelled' for deletions).
async function applyEventsBatch(events, agentId) {
  let synced = 0;
  let deleted = 0;
  for (const event of events) {
    // Cancelled events are tombstones from delta sync; remove the local row.
    if (event.status === 'cancelled') {
      const r = await query(
        'DELETE FROM activities_pj WHERE google_event_id = $1 RETURNING id',
        [event.id]
      );
      if (r.rows.length > 0) deleted++;
      continue;
    }

    if (!event.summary || event.summary.startsWith('[SalesTwo]')) continue;
    const startDateTime = event.start?.dateTime || event.start?.date;
    if (!startDateTime) continue;

    const existing = await query(
      'SELECT id FROM activities_pj WHERE google_event_id = $1',
      [event.id]
    );
    if (existing.rows.length > 0) {
      // Upsert the mutable fields so delta updates from Google are reflected.
      await query(
        `UPDATE activities_pj
            SET description = $1,
                scheduled_at = $2,
                updated_at = NOW()
          WHERE google_event_id = $3`,
        [event.summary, startDateTime, event.id]
      );
      continue;
    }

    await query(
      `INSERT INTO activities_pj (id, type, description, scheduled_at, created_by, google_event_id)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)`,
      [classifyActivityType(event.summary), event.summary, startDateTime, agentId, event.id]
    );
    synced++;
  }
  return { synced, deleted };
}

// Phase 4.1 — Sync from Google → SalesTwo using nextSyncToken when available.
// Fall back to a full sync (and clear sync_token) on 410 Gone.
export async function syncGoogleToSalesTwo(agentId) {
  console.log('[GCal Sync] Starting sync from Google for agent', agentId);
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    console.log('[GCal Sync] No OAuth2 client for agent', agentId);
    return { synced: 0, error: 'Não conectado' };
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    const tokenRow = await query(
      'SELECT sync_token FROM google_calendar_tokens WHERE agent_id = $1',
      [agentId]
    );
    let storedSyncToken = tokenRow.rows[0]?.sync_token || null;
    const calendarId = await getTargetCalendarId(agentId);

    let totalSynced = 0;
    let totalDeleted = 0;
    let mode = storedSyncToken ? 'delta' : 'full';
    let usedFallback = false;
    let pageToken;
    let nextSyncToken = null;

    // Drive the paginated loop. With syncToken, Google rejects timeMin/timeMax/orderBy.
    while (true) {
      const params = {
        calendarId,
        maxResults: 200,
        singleEvents: true,
      };
      if (pageToken) {
        params.pageToken = pageToken;
        if (storedSyncToken) params.syncToken = storedSyncToken;
      } else if (storedSyncToken) {
        params.syncToken = storedSyncToken;
      } else {
        // Full sync window: now → +3 months. Once the first full sync completes,
        // subsequent ticks use nextSyncToken (delta) and ignore the window.
        const now = new Date();
        const threeMonthsAhead = new Date(now);
        threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);
        params.timeMin = now.toISOString();
        params.timeMax = threeMonthsAhead.toISOString();
        params.orderBy = 'startTime';
      }

      let pageResult;
      try {
        pageResult = await calendar.events.list(params);
      } catch (err) {
        // 410 Gone → syncToken expired/invalid. Clear it and restart as full sync once.
        if (err.code === 410 && storedSyncToken && !usedFallback) {
          console.warn(`[GCal Sync] syncToken expired for agent ${agentId}, falling back to full sync.`);
          await query(
            'UPDATE google_calendar_tokens SET sync_token = NULL WHERE agent_id = $1',
            [agentId]
          );
          storedSyncToken = null;
          pageToken = undefined;
          usedFallback = true;
          mode = 'full-after-410';
          continue;
        }
        throw err;
      }

      const events = pageResult.data.items || [];
      const { synced, deleted } = await applyEventsBatch(events, agentId);
      totalSynced += synced;
      totalDeleted += deleted;

      pageToken = pageResult.data.nextPageToken;
      // nextSyncToken only appears on the LAST page of the sequence.
      if (pageResult.data.nextSyncToken) nextSyncToken = pageResult.data.nextSyncToken;
      if (!pageToken) break;
    }

    await query(
      `UPDATE google_calendar_tokens
          SET last_sync_at = NOW(),
              sync_token = COALESCE($1, sync_token)
        WHERE agent_id = $2`,
      [nextSyncToken, agentId]
    );

    console.log(`[GCal] Sync ${mode} for agent ${agentId}: +${totalSynced} added, ${totalDeleted} removed${nextSyncToken ? ' (new syncToken)' : ''}`);
    return { synced: totalSynced, deleted: totalDeleted, mode };
  } catch (error) {
    console.error('[GCal] Sync from Google error:', error.message);
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    return { synced: 0, error: error.message };
  }
}

// Phase 4.2 — Cluster-wide singleton lock for the periodic sweep.
// Distinct from the outbox worker key (7428309211) so the two workers
// can run concurrently but neither overlaps itself.
const SYNC_ALL_LOCK_KEY = 7428309212n;
let syncAllInProgress = false;

export async function syncAllAgents() {
  // In-process guard: if a previous tick is still running on THIS instance,
  // skip immediately without touching the DB lock.
  if (syncAllInProgress) {
    console.log('[GCal Sync] syncAllAgents skipped — previous tick still running on this instance.');
    return 0;
  }
  syncAllInProgress = true;

  let lockAcquired = false;
  try {
    const lockRes = await query(
      'SELECT pg_try_advisory_lock($1) AS got',
      [SYNC_ALL_LOCK_KEY.toString()]
    );
    lockAcquired = lockRes.rows[0]?.got === true;
    if (!lockAcquired) {
      console.log('[GCal Sync] syncAllAgents skipped — another instance holds the lock.');
      return 0;
    }

    console.log('[GCal Sync] Running periodic sync for all agents');
    const result = await query('SELECT agent_id FROM google_calendar_tokens');
    console.log('[GCal Sync] Found', result.rows.length, 'agents with tokens');

    let totalSynced = 0;
    for (const row of result.rows) {
      const { synced, error } = await syncGoogleToSalesTwo(row.agent_id);
      if (error) {
        console.log('[GCal Sync] Agent', row.agent_id, '- error:', error);
      } else {
        console.log('[GCal Sync] Agent', row.agent_id, '- synced', synced, 'events');
        totalSynced += synced;
      }
    }
    if (totalSynced > 0) {
      console.log(`[GCal] Periodic sync complete: ${totalSynced} new events imported`);
    }
    return totalSynced;
  } catch (error) {
    console.error('[GCal] syncAllAgents error:', error.message);
    return 0;
  } finally {
    if (lockAcquired) {
      try {
        await query('SELECT pg_advisory_unlock($1)', [SYNC_ALL_LOCK_KEY.toString()]);
      } catch (e) {
        console.warn('[GCal Sync] failed to release advisory lock:', e.message);
      }
    }
    syncAllInProgress = false;
  }
}
