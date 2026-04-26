import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../config/database.js';

const router = Router();

const PRIVATE_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'lead-pj-files');
if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) {
  fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true, mode: 0o750 });
}

const MAX_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 1 },
});

const SIGNATURES = {
  'image/jpeg': {
    ext: 'jpg',
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    ext: 'png',
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  'application/pdf': {
    ext: 'pdf',
    test: (b) =>
      b.length >= 5 &&
      b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
  },
};

function detectMime(buffer) {
  for (const [mime, info] of Object.entries(SIGNATURES)) {
    if (info.test(buffer)) return { mime, ext: info.ext };
  }
  return null;
}

const PDF_DANGEROUS_TOKENS = [
  '/JS',
  '/JavaScript',
  '/OpenAction',
  '/AA',
  '/Launch',
  '/EmbeddedFile',
  '/RichMedia',
  '/SubmitForm',
  '/XFA',
  '/GoToR',
  '/GoToE',
  '/ImportData',
];

function pdfHasDangerousContent(buffer) {
  const text = buffer.toString('latin1');
  for (const token of PDF_DANGEROUS_TOKENS) {
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(token, from);
      if (idx === -1) break;
      const next = text.charAt(idx + token.length);
      if (!/[A-Za-z0-9_]/.test(next)) {
        return token;
      }
      from = idx + token.length;
    }
  }
  // Detecta também a forma com escape hexadecimal usado em ofuscação de PDF
  // (ex.: /#4Aavascript em vez de /JavaScript).
  if (/\/#[0-9A-Fa-f]{2}/.test(text)) {
    return '/#xx (hex-encoded name)';
  }
  return null;
}

function sanitizeOriginalName(name) {
  if (typeof name !== 'string') return 'arquivo';
  const base = path.basename(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 120);
  return cleaned || 'arquivo';
}

async function resolveVisibleAgentIds(userId) {
  if (!userId) return [];
  const me = await query('SELECT id, agent_type FROM agents WHERE id = $1', [userId]);
  if (me.rows.length === 0) return [];
  const agentType = me.rows[0].agent_type;

  if (agentType === 'admin' || agentType === 'coordinator') return null;

  const isSupervisor =
    agentType === 'supervisor' ||
    agentType === 'sales_supervisor' ||
    (typeof agentType === 'string' && agentType.endsWith('_supervisor'));

  if (isSupervisor) {
    const subs = await query('SELECT id FROM agents WHERE supervisor_id = $1', [userId]);
    const ids = new Set(subs.rows.map((r) => String(r.id)));
    const ownedTeams = await query('SELECT id FROM teams WHERE supervisor_id = $1', [userId]);
    if (ownedTeams.rows.length > 0) {
      const teamIds = ownedTeams.rows.map((r) => r.id);
      const placeholders = teamIds.map((_, i) => `$${i + 1}`).join(',');
      const teamMembers = await query(
        `SELECT id FROM agents WHERE team_id IN (${placeholders})`,
        teamIds
      );
      teamMembers.rows.forEach((r) => ids.add(String(r.id)));
    }
    ids.add(String(userId));
    return Array.from(ids);
  }

  return [String(userId)];
}

async function assertLeadVisible(leadId, userId) {
  const visibleIds = await resolveVisibleAgentIds(userId);
  const result = await query('SELECT agent_id FROM leads_pj WHERE id = $1', [leadId]);
  if (result.rows.length === 0) return { ok: false, status: 404, message: 'Lead não encontrado' };
  if (visibleIds === null) return { ok: true };
  const owner = result.rows[0].agent_id ? String(result.rows[0].agent_id) : null;
  if (!owner || !visibleIds.includes(owner)) {
    return { ok: false, status: 404, message: 'Lead não encontrado' };
  }
  return { ok: true };
}

function isAdminOrCoord(role) {
  const r = (role || '').toLowerCase();
  return r === 'admin' || r === 'coordinator' || r === 'coordenador';
}

async function loadCurrentUser(userId) {
  if (!userId) return null;
  const r = await query(
    'SELECT id, name, agent_type FROM agents WHERE id = $1',
    [userId]
  );
  return r.rows[0] || null;
}

function snakeFile(row) {
  if (!row) return row;
  return {
    id: row.id,
    leadId: row.lead_id,
    originalName: row.original_name,
    storedName: row.stored_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/lead-pj-files', authMiddleware, async (req, res) => {
  try {
    const leadId = req.query.lead_id || req.query.leadId;
    if (!leadId) return res.status(400).json({ message: 'lead_id é obrigatório' });
    const visibility = await assertLeadVisible(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const result = await query(
      'SELECT * FROM lead_pj_files WHERE lead_id = $1 ORDER BY created_at DESC',
      [leadId]
    );
    res.json(result.rows.map(snakeFile));
  } catch (error) {
    console.error('Error listing lead-pj-files:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/lead-pj-files/filter', authMiddleware, async (req, res) => {
  try {
    const filters = req.body || {};
    const leadId = filters.lead_id || filters.leadId;
    if (!leadId) return res.status(400).json({ message: 'lead_id é obrigatório' });
    const visibility = await assertLeadVisible(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const result = await query(
      'SELECT * FROM lead_pj_files WHERE lead_id = $1 ORDER BY created_at DESC',
      [leadId]
    );
    res.json(result.rows.map(snakeFile));
  } catch (error) {
    console.error('Error filtering lead-pj-files:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post(
  '/lead-pj-files/upload',
  authMiddleware,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: 'Arquivo excede o limite de 5MB.' });
        }
        return res.status(400).json({ message: err.message || 'Falha no upload.' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const leadId = req.body?.lead_id || req.body?.leadId;
      if (!leadId) return res.status(400).json({ message: 'lead_id é obrigatório' });
      if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado.' });

      const visibility = await assertLeadVisible(leadId, req.user?.id);
      if (!visibility.ok) {
        return res.status(visibility.status).json({ message: visibility.message });
      }

      const buffer = req.file.buffer;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ message: 'Arquivo vazio.' });
      }
      if (buffer.length > MAX_SIZE) {
        return res.status(413).json({ message: 'Arquivo excede o limite de 5MB.' });
      }

      const detected = detectMime(buffer);
      if (!detected) {
        return res.status(415).json({
          message: 'Tipo de arquivo não permitido. Apenas .jpg, .png e .pdf são aceitos.',
        });
      }

      const declaredExt = path.extname(req.file.originalname || '').toLowerCase().replace('.', '');
      const declaredMime = (req.file.mimetype || '').toLowerCase();
      const expectedExts = detected.ext === 'jpg' ? ['jpg', 'jpeg'] : [detected.ext];
      const expectedMimes =
        detected.mime === 'image/jpeg' ? ['image/jpeg', 'image/jpg'] : [detected.mime];
      if (declaredExt && !expectedExts.includes(declaredExt)) {
        return res.status(415).json({
          message: 'Conteúdo do arquivo não corresponde à extensão declarada.',
        });
      }
      if (declaredMime && !expectedMimes.includes(declaredMime)) {
        return res.status(415).json({
          message: 'Conteúdo do arquivo não corresponde ao tipo declarado.',
        });
      }

      if (detected.mime === 'application/pdf') {
        const dangerous = pdfHasDangerousContent(buffer);
        if (dangerous) {
          return res.status(422).json({
            message: `PDF rejeitado: contém conteúdo potencialmente perigoso (${dangerous}).`,
          });
        }
      }

      const storedName = `${uuidv4()}.${detected.ext}`;
      const fullPath = path.join(PRIVATE_UPLOAD_DIR, storedName);
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(PRIVATE_UPLOAD_DIR) + path.sep)) {
        return res.status(400).json({ message: 'Caminho de arquivo inválido.' });
      }

      const user = await loadCurrentUser(req.user?.id);
      const originalName = sanitizeOriginalName(req.file.originalname);

      fs.writeFileSync(fullPath, buffer, { mode: 0o640 });
      try {
        fs.chmodSync(fullPath, 0o640);
      } catch (_) {}

      let insert;
      try {
        insert = await query(
          `INSERT INTO lead_pj_files
            (lead_id, original_name, stored_name, mime_type, file_size, uploaded_by, uploaded_by_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            leadId,
            originalName,
            storedName,
            detected.mime,
            buffer.length,
            req.user?.id || null,
            user?.name || null,
          ]
        );
      } catch (dbErr) {
        try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch (_) {}
        throw dbErr;
      }

      res.status(201).json(snakeFile(insert.rows[0]));
    } catch (error) {
      console.error('Error uploading lead-pj-file:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

router.get('/lead-pj-files/:id/download', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM lead_pj_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Arquivo não encontrado' });
    const file = result.rows[0];

    const visibility = await assertLeadVisible(file.lead_id, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const fullPath = path.join(PRIVATE_UPLOAD_DIR, file.stored_name);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(PRIVATE_UPLOAD_DIR) + path.sep)) {
      return res.status(400).json({ message: 'Caminho inválido.' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Arquivo não encontrado em disco.' });
    }

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Length', file.file_size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.original_name)}"`
    );
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error('Error downloading lead-pj-file:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/lead-pj-files/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM lead_pj_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Arquivo não encontrado' });
    const file = result.rows[0];

    const visibility = await assertLeadVisible(file.lead_id, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const user = await loadCurrentUser(req.user?.id);
    const isUploader = String(file.uploaded_by || '') === String(req.user?.id || '');
    if (!isUploader && !isAdminOrCoord(user?.agent_type || user?.type)) {
      return res.status(403).json({ message: 'Sem permissão para remover este arquivo.' });
    }

    const fullPath = path.join(PRIVATE_UPLOAD_DIR, file.stored_name);
    const resolved = path.resolve(fullPath);
    if (resolved.startsWith(path.resolve(PRIVATE_UPLOAD_DIR) + path.sep)) {
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) {
        console.warn('Falha ao remover arquivo do disco:', e.message);
      }
    }

    await query('DELETE FROM lead_pj_files WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead-pj-file:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
