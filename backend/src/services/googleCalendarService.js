import { google } from 'googleapis';
import { query } from '../config/database.js';
import crypto from 'crypto';

async function getSetting(key) {
  const result = await query(
    'SELECT setting_value FROM system_settings WHERE setting_key = $1',
    [key]
  );
  return result.rows[0]?.setting_value || null;
}

async function getOAuth2Client() {
  const clientId = await getSetting('google_calendar_client_id');
  const clientSecret = await getSetting('google_calendar_client_secret');
  if (!clientId || !clientSecret) return null;

  const redirectUri = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/functions/google-calendar/callback`
    : (process.env.APP_URL || 'http://localhost:5173') + '/api/functions/google-calendar/callback';

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

  oauth2.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : undefined,
  });

  oauth2.on('tokens', async (tokens) => {
    try {
      const updates = [];
      const values = [];
      let idx = 1;
      if (tokens.access_token) {
        updates.push(`access_token = $${idx++}`);
        values.push(tokens.access_token);
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
  if (!oauth2) throw new Error('Google Calendar não configurado. Admin deve informar Client ID e Secret nas Configurações.');

  const state = crypto.randomBytes(20).toString('hex') + ':' + agentId;

  await query(
    `INSERT INTO system_settings (id, setting_key, setting_value)
     VALUES (uuid_generate_v4(), 'gcal_oauth_state_' || $1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2`,
    [agentId, state]
  );

  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
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
  if (!oauth2) throw new Error('Google Calendar não configurado');

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  let calendarEmail = null;
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const calList = await calendar.calendarList.get({ calendarId: 'primary' });
    calendarEmail = calList.data.id;
  } catch { }

  if (tokens.refresh_token) {
    await query(
      `INSERT INTO google_calendar_tokens (id, agent_id, access_token, refresh_token, token_expiry, calendar_email)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
       ON CONFLICT (agent_id) DO UPDATE SET
         access_token = $2, refresh_token = $3, token_expiry = $4, calendar_email = $5, updated_at = NOW()`,
      [
        agentId,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        calendarEmail,
      ]
    );
  } else {
    await query(
      `INSERT INTO google_calendar_tokens (id, agent_id, access_token, refresh_token, token_expiry, calendar_email)
       VALUES (uuid_generate_v4(), $1, $2, '', $3, $4)
       ON CONFLICT (agent_id) DO UPDATE SET
         access_token = $2, token_expiry = $3, calendar_email = $4, updated_at = NOW()`,
      [
        agentId,
        tokens.access_token,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        calendarEmail,
      ]
    );
  }

  return { success: true, email: calendarEmail };
}

export async function disconnectAgent(agentId) {
  await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
  return { success: true };
}

export async function getAgentConnectionStatus(agentId) {
  const clientId = await getSetting('google_calendar_client_id');
  const clientSecret = await getSetting('google_calendar_client_secret');
  const configured = !!clientId && !!clientSecret;

  const result = await query(
    'SELECT calendar_email, last_sync_at FROM google_calendar_tokens WHERE agent_id = $1',
    [agentId]
  );
  const tokenRow = result.rows[0];

  return {
    configured,
    connected: configured && !!tokenRow,
    calendarEmail: tokenRow?.calendar_email || null,
    lastSync: tokenRow?.last_sync_at || null,
  };
}

export async function getConnectionStatus() {
  const clientId = await getSetting('google_calendar_client_id');
  const clientSecret = await getSetting('google_calendar_client_secret');
  return {
    configured: !!clientId && !!clientSecret,
    connected: false,
  };
}

const ACTIVITY_TYPE_LABELS = {
  visit: 'Visita', call: 'Ligação', whatsapp: 'WhatsApp',
  email: 'E-mail', task: 'Tarefa', meeting: 'Reunião',
};

function activityToGCalEvent(activity) {
  const scheduledAt = new Date(activity.scheduled_at);
  if (isNaN(scheduledAt.getTime())) return null;

  const endTime = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
  const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] || activity.type || 'Atividade';

  return {
    summary: `[SalesTwo] ${typeLabel}: ${activity.description || 'Atividade'}`,
    description: `Tipo: ${typeLabel}\n${activity.description || ''}\n\nCriado pelo SalesTwo`,
    start: { dateTime: scheduledAt.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: endTime.toISOString(), timeZone: 'America/Sao_Paulo' },
    colorId: activity.type === 'visit' ? '2' : activity.type === 'call' ? '7' : '9',
  };
}

export async function createGoogleEvent(agentId, activity, tableName = 'activities_pj') {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) return null;

  const event = activityToGCalEvent(activity);
  if (!event) return null;

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    if (result.data.id && activity.id) {
      const safeTable = tableName === 'activities' ? 'activities' : 'activities_pj';
      await query(
        `UPDATE ${safeTable} SET google_event_id = $1 WHERE id = $2`,
        [result.data.id, activity.id]
      );
    }

    console.log(`[GCal] Event created: ${result.data.id} for activity ${activity.id}`);
    return { id: result.data.id };
  } catch (error) {
    console.error('[GCal] Error creating event:', error.message);
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    return null;
  }
}

export async function updateGoogleEvent(agentId, googleEventId, activity) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2 || !googleEventId) return null;

  const event = activityToGCalEvent(activity);
  if (!event) return null;

  if (activity.completed) {
    event.summary = `✅ ${event.summary}`;
    event.colorId = '8';
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    await calendar.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: event,
    });
    console.log(`[GCal] Event updated: ${googleEventId}`);
    return true;
  } catch (error) {
    console.error('[GCal] Error updating event:', error.message);
    return null;
  }
}

export async function deleteGoogleEvent(agentId, googleEventId) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2 || !googleEventId) return null;

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    });
    console.log(`[GCal] Event deleted: ${googleEventId}`);
    return true;
  } catch (error) {
    console.error('[GCal] Error deleting event:', error.message);
    return null;
  }
}

export async function fetchGoogleEvents(agentId, timeMin, timeMax) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) return [];

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const result = await calendar.events.list({
      calendarId: 'primary',
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

export async function syncGoogleToSalesTwo(agentId) {
  console.log('[GCal Sync] Starting sync from Google for agent', agentId);
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    console.log('[GCal Sync] No OAuth2 client for agent', agentId);
    return { synced: 0, error: 'Não conectado' };
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    const now = new Date();
    const threeMonthsAhead = new Date(now);
    threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: threeMonthsAhead.toISOString(),
      maxResults: 200,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = result.data.items || [];
    let synced = 0;

    for (const event of events) {
      if (!event.summary || event.summary.startsWith('[SalesTwo]')) continue;

      const existing = await query(
        'SELECT id FROM activities_pj WHERE google_event_id = $1',
        [event.id]
      );
      if (existing.rows.length > 0) continue;

      const startDateTime = event.start?.dateTime || event.start?.date;
      if (!startDateTime) continue;

      let actType = 'meeting';
      const lowerSummary = (event.summary || '').toLowerCase();
      if (lowerSummary.includes('ligação') || lowerSummary.includes('call') || lowerSummary.includes('ligar')) actType = 'call';
      else if (lowerSummary.includes('visita') || lowerSummary.includes('visit')) actType = 'visit';
      else if (lowerSummary.includes('email') || lowerSummary.includes('e-mail')) actType = 'email';
      else if (lowerSummary.includes('whatsapp') || lowerSummary.includes('wpp')) actType = 'whatsapp';
      else if (lowerSummary.includes('tarefa') || lowerSummary.includes('task')) actType = 'task';

      const existingCheck = await query(
        `SELECT id FROM activities_pj WHERE google_event_id = $1`,
        [event.id]
      );
      if (existingCheck.rows.length > 0) {
        console.log('[GCal Sync] Event already synced, skipping:', event.id);
        continue;
      }

      await query(
        `INSERT INTO activities_pj (id, type, description, scheduled_at, created_by, google_event_id)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)`,
        [actType, event.summary, startDateTime, agentId, event.id]
      );
      synced++;
    }

    await query(
      'UPDATE google_calendar_tokens SET last_sync_at = NOW() WHERE agent_id = $1',
      [agentId]
    );

    console.log(`[GCal] Synced ${synced} events from Google for agent ${agentId}`);
    return { synced };
  } catch (error) {
    console.error('[GCal] Sync from Google error:', error.message);
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    return { synced: 0, error: error.message };
  }
}

export async function syncAllAgents() {
  try {
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
  }
}
