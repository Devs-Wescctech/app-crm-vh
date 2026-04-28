import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import entityRoutes from './routes/entities.js';
import uploadRoutes from './routes/upload.js';
import leadPjFilesRoutes from './routes/leadPjFiles.js';
import functionRoutes from './routes/functions.js';
import whatsappRoutes from './routes/whatsapp.js';
import { runAllAutomations } from './services/automationService.js';
import { syncAllAgents } from './services/googleCalendarService.js';
import { startOutboxWorker } from './workers/gcalOutboxWorker.js';
import { createNotification } from './services/notificationService.js';
import { checkLeadTemperatures } from './services/leadTemperatureMonitor.js';
import { query as dbQuery } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

const distPath = path.join(process.cwd(), 'dist');
let indexHtml = '<!DOCTYPE html><html><head><title>SalesTwo - Vendas B2B</title></head><body><h1>OK</h1></body></html>';

try {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    indexHtml = fs.readFileSync(indexPath, 'utf8');
    console.log('Loaded index.html from dist');
  }
} catch (err) {
  console.log('Using fallback HTML');
}

app.get('/', (req, res) => {
  res.status(200).type('html').send(indexHtml);
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/proposals', express.static(path.join(__dirname, '../public/proposals')));
app.use(express.static(distPath));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api', leadPjFilesRoutes);
app.use('/api', entityRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.status(200).type('html').send(indexHtml);
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

initDatabase()
  .then(async () => {
    console.log('Database schema initialized successfully');
    
    const AUTOMATION_INTERVAL = 60 * 60 * 1000;
    
    setTimeout(() => {
      console.log('[Automations] Starting initial automation check...');
      runAllAutomations().catch(console.error);
    }, 30000);
    
    setInterval(() => {
      console.log('[Automations] Running scheduled automation check...');
      runAllAutomations().catch(console.error);
    }, AUTOMATION_INTERVAL);
    
    console.log(`[Automations] Scheduler initialized. Running every ${AUTOMATION_INTERVAL / 60000} minutes.`);

    setInterval(() => {
      syncAllAgents().catch(err => console.error('[GCal Sync] Erro na sincronização periódica:', err.message));
    }, 5 * 60 * 1000);
    console.log('[Google Calendar] Sync periódico agendado: a cada 5 minutos.');

    // Phase 2.2 — Outbox worker. Drains gcal_event_outbox every 30s with
    // exponential backoff and a Postgres advisory lock for singleton safety.
    startOutboxWorker(30 * 1000);

    async function checkUpcomingActivities() {
      try {
        const now = new Date();
        const in15min = new Date(now.getTime() + 15 * 60 * 1000);

        const activitiesPJResult = await dbQuery(`
          SELECT a.id, a.description, a.type, a.scheduled_at, a.created_by,
                 ag.email as agent_email, ag.name as agent_name
          FROM activities_pj a
          LEFT JOIN agents ag ON ag.id = a.created_by
          WHERE a.completed = false
            AND a.scheduled_at > $1
            AND a.scheduled_at <= $2
            AND a.id NOT IN (
              SELECT entity_id FROM notifications
              WHERE entity_type = 'activity_pj_reminder'
              AND entity_id IS NOT NULL
            )
        `, [now.toISOString(), in15min.toISOString()]);

        for (const act of activitiesPJResult.rows) {
          const email = act.agent_email;
          if (!email) continue;

          const scheduledAt = new Date(act.scheduled_at);
          const minutesUntil = Math.round((scheduledAt - now) / 60000);
          const timeLabel = minutesUntil <= 1 ? 'em 1 minuto' : `em ${minutesUntil} minutos`;

          await createNotification({
            userEmail: email,
            type: 'activity_reminder',
            title: `Atividade ${timeLabel}`,
            message: `"${act.description || 'Atividade'}" está agendada para ${scheduledAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
            link: '/Agenda',
            entityType: 'activity_pj_reminder',
            entityId: act.id,
            priority: 'high',
          });
        }

        if (activitiesPJResult.rows.length > 0) {
          console.log(`[Activity Reminder] ${activitiesPJResult.rows.length} notificação(ões) de atividade(s) próxima(s) enviada(s).`);
        }
      } catch (err) {
        console.error('[Activity Reminder] Erro ao verificar atividades próximas:', err.message);
      }
    }

    setInterval(checkUpcomingActivities, 5 * 60 * 1000);
    console.log('[Activity Reminder] Verificação agendada: a cada 5 minutos.');

    // Lead temperature monitor — alerts the assigned agent when one of their
    // PJ leads transitions into "cold" (per `lead_temperature_rules`) and
    // optionally pings supervisors when a lead turns hot. Runs hourly with a
    // short initial delay so we don't pile onto the boot sequence.
    const TEMPERATURE_INTERVAL = 60 * 60 * 1000;
    setTimeout(() => {
      checkLeadTemperatures()
        .then(({ checked, coldNotified, hotNotified }) => {
          console.log(`[Lead Temperature] Inicial: ${checked} leads avaliados, ${coldNotified} alertas de frio, ${hotNotified} avisos de quente.`);
        })
        .catch(err => console.error('[Lead Temperature] Erro na verificação inicial:', err.message));
    }, 60 * 1000);
    setInterval(() => {
      checkLeadTemperatures()
        .then(({ checked, coldNotified, hotNotified }) => {
          if (coldNotified > 0 || hotNotified > 0) {
            console.log(`[Lead Temperature] ${checked} leads avaliados, ${coldNotified} alertas de frio, ${hotNotified} avisos de quente.`);
          }
        })
        .catch(err => console.error('[Lead Temperature] Erro na verificação periódica:', err.message));
    }, TEMPERATURE_INTERVAL);
    console.log(`[Lead Temperature] Monitor de temperatura agendado: a cada ${TEMPERATURE_INTERVAL / 60000} minutos.`);
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });
