import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = Router();

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const uploadDir = path.join(__dirname2, '../../../data/bom-auto-images');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uuidv4()}${ext}`);
  }
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, PNG, GIF, WebP)'), false);
    }
  }
});

router.get('/consulta', authMiddleware, async (req, res) => {
  try {
    const { documento, placa } = req.query;

    if (!documento && !placa) {
      return res.status(400).json({ message: 'Informe ao menos documento ou placa' });
    }

    if (documento && !/^\d{11}$/.test(documento.replace(/\D/g, ''))) {
      return res.status(400).json({ message: 'CPF inválido. Deve conter 11 dígitos' });
    }

    if (placa && !/^[A-Za-z]{3}\d{1}[A-Za-z0-9]{1}\d{2}$/.test(placa.replace(/[-\s]/g, ''))) {
      return res.status(400).json({ message: 'Formato de placa inválido' });
    }

    const params = new URLSearchParams();
    if (documento) {
      const digits = documento.replace(/\D/g, '');
      const formatted = digits.length === 11
        ? `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`
        : documento;
      params.append('documento', formatted);
    }
    if (placa) params.append('placa_ajustada', placa);

    const erpUrl = `http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_TESTE_BOM_AUTO?${params.toString()}`;

    const erpToken = process.env.ERP_AUTH_TOKEN || '58378BA0-250C-4061-AF33-A2BE38C2BC01';
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${erpToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!erpResponse.ok) {
      return res.status(erpResponse.status).json({
        message: `Erro ao consultar ERP: ${erpResponse.statusText}`
      });
    }

    const rawData = await erpResponse.json();

    if (!Array.isArray(rawData) || rawData.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado no ERP.' });
    }

    const first = rawData[0];
    const veiculos = rawData.map(item => ({
      placa: item.placa_ajustada || '',
      descricao_veiculo: item.descricao_veiculo_limpa || '',
      descricao_veiculo_limpa: item.descricao_veiculo_limpa || '',
      ano: item.ano_ajustado || '',
    }));

    const situacaoContratoRaw = first.situacao_contrato || '';
    let situacao_contrato = situacaoContratoRaw;
    if (situacaoContratoRaw.toUpperCase() === 'A') situacao_contrato = 'ATIVO';
    else if (situacaoContratoRaw.toUpperCase() === 'I') situacao_contrato = 'INATIVO';
    else if (situacaoContratoRaw.toUpperCase() === 'C') situacao_contrato = 'CANCELADO';

    const situacaoFinanceiraRaw = first.situacao_financeira || '';
    let situacao_financeira = situacaoFinanceiraRaw;
    const sfUpper = situacaoFinanceiraRaw.toUpperCase().trim();
    if (sfUpper === 'I' || sfUpper.includes('INADIMPLENTE')) situacao_financeira = 'INADIMPLENTE';
    else if (sfUpper === 'A' || sfUpper.includes('ADIMPLENTE') || sfUpper.includes('EM DIA')) situacao_financeira = 'ADIMPLENTE';

    const normalized = {
      contratante: first.contratante || '',
      documento: first.documento || '',
      celular: first.celular || '',
      situacao_contrato,
      situacao_financeira,
      pedido: first.pedido || '',
      contrato_id: first.contrato_id || '',
      contratos_servicos: first.contrato_servicos || first.contratos_servicos || '',
      veiculos,
    };

    res.json(normalized);
  } catch (error) {
    console.error('Error in bom-auto consulta:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/utilizacoes/:documento', authMiddleware, async (req, res) => {
  try {
    const { documento } = req.params;
    const countResult = await query(
      `SELECT COUNT(*) FROM bom_auto_atendimentos
       WHERE documento_cliente = $1
       AND data_hora >= date_trunc('year', CURRENT_DATE)
       AND data_hora < date_trunc('year', CURRENT_DATE) + interval '1 year'
       AND status_atendimento != 'Cancelado'`,
      [documento]
    );
    const listResult = await query(
      `SELECT id, protocolo, tipo_servico, status_atendimento, usuario, data_hora
       FROM bom_auto_atendimentos
       WHERE documento_cliente = $1
       AND data_hora >= date_trunc('year', CURRENT_DATE)
       AND data_hora < date_trunc('year', CURRENT_DATE) + interval '1 year'
       ORDER BY data_hora DESC`,
      [documento]
    );
    res.json({ count: parseInt(countResult.rows[0].count, 10), atendimentos: listResult.rows });
  } catch (error) {
    console.error('Error in bom-auto utilizacoes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/atendimentos', authMiddleware, async (req, res) => {
  try {
    const { documento_cliente, nome_cliente, placa, descricao_veiculo, tipo_servico, observacoes, usuario, telefone_contato, contratos_servicos } = req.body;

    if (!documento_cliente || !nome_cliente || !placa || !tipo_servico || !usuario) {
      return res.status(400).json({ message: 'Campos obrigatórios: documento_cliente, nome_cliente, placa, tipo_servico, usuario' });
    }

    const sanitizedObs = observacoes
      ? observacoes.replace(/<[^>]*>/g, '').trim()
      : null;

    const sanitizedTelefone = telefone_contato
      ? telefone_contato.replace(/\D/g, '').slice(0, 15)
      : null;

    const result = await query(
      `WITH next_seq AS (
        SELECT COALESCE(MAX(
          CASE WHEN protocolo LIKE 'BA' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '%'
          THEN CAST(RIGHT(protocolo, 4) AS INTEGER) ELSE 0 END
        ), 0) + 1 AS seq
        FROM bom_auto_atendimentos
      )
      INSERT INTO bom_auto_atendimentos
       (protocolo, documento_cliente, nome_cliente, placa, descricao_veiculo, tipo_servico, observacoes, usuario, status_atendimento, telefone_contato, contratos_servicos)
       VALUES (
         'BA' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || LPAD((SELECT seq FROM next_seq)::text, 4, '0'),
         $1, $2, $3, $4, $5, $6, $7, 'Pendente', $8, $9
       )
       RETURNING *`,
      [documento_cliente, nome_cliente, placa, descricao_veiculo || null, tipo_servico, sanitizedObs, usuario, sanitizedTelefone, contratos_servicos || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error in bom-auto create atendimento:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos/atendentes', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT usuario FROM bom_auto_atendimentos WHERE usuario IS NOT NULL ORDER BY usuario ASC`
    );
    res.json(result.rows.map(r => r.usuario));
  } catch (error) {
    console.error('Error fetching atendentes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos/contadores', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status_atendimento = 'Pendente') AS pendentes,
        COUNT(*) FILTER (WHERE status_atendimento = 'Solucionado') AS solucionados,
        COUNT(*) FILTER (WHERE status_atendimento = 'Cancelado') AS cancelados,
        COUNT(*) AS total
       FROM bom_auto_atendimentos`
    );
    const row = result.rows[0];
    res.json({
      pendentes: parseInt(row.pendentes, 10),
      solucionados: parseInt(row.solucionados, 10),
      cancelados: parseInt(row.cancelados, 10),
      total: parseInt(row.total, 10),
    });
  } catch (error) {
    console.error('Error fetching bom-auto contadores:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const atendResult = await query('SELECT * FROM bom_auto_atendimentos WHERE id = $1', [id]);
    if (atendResult.rows.length === 0) {
      return res.status(404).json({ message: 'Atendimento não encontrado.' });
    }
    const imagensResult = await query(
      'SELECT * FROM bom_auto_imagens WHERE atendimento_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json({ ...atendResult.rows[0], imagens: imagensResult.rows });
  } catch (error) {
    console.error('Error fetching bom-auto atendimento detail:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos', authMiddleware, async (req, res) => {
  try {
    const { documento, status, data_inicio, data_fim, nome, placa, tipo_servico } = req.query;

    let sql = 'SELECT * FROM bom_auto_atendimentos WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND status_atendimento = $${paramIndex++}`;
      params.push(status);
    }
    if (documento) {
      sql += ` AND REPLACE(REPLACE(REPLACE(documento_cliente, '.', ''), '-', ''), ' ', '') ILIKE $${paramIndex++}`;
      params.push(`%${documento.replace(/\D/g, '')}%`);
    }
    if (nome) {
      sql += ` AND nome_cliente ILIKE $${paramIndex++}`;
      params.push(`%${nome}%`);
    }
    if (placa) {
      sql += ` AND REPLACE(REPLACE(placa, '-', ''), ' ', '') ILIKE $${paramIndex++}`;
      params.push(`%${placa.replace(/[^a-zA-Z0-9]/g, '')}%`);
    }
    if (tipo_servico) {
      sql += ` AND tipo_servico = $${paramIndex++}`;
      params.push(tipo_servico);
    }
    if (data_inicio) {
      sql += ` AND data_hora >= $${paramIndex++}`;
      params.push(data_inicio);
    }
    if (data_fim) {
      sql += ` AND data_hora <= $${paramIndex++}`;
      params.push(data_fim + ' 23:59:59');
    }
    if (req.query.atendente) {
      sql += ` AND usuario ILIKE $${paramIndex++}`;
      params.push(`%${req.query.atendente}%`);
    }

    sql += ` ORDER BY CASE WHEN status_atendimento = 'Pendente' THEN 0 ELSE 1 END, data_hora DESC LIMIT 500`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error in bom-auto list atendimentos:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/atendimentos/:id/imagens', authMiddleware, imageUpload.array('imagens', 10), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Nenhuma imagem enviada.' });
    }
    const inserted = [];
    for (const file of req.files) {
      const url = `/data/bom-auto-images/${file.filename}`;
      const result = await query(
        `INSERT INTO bom_auto_imagens (atendimento_id, filename, original_name, mimetype, size, url)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, file.filename, file.originalname, file.mimetype, file.size, url]
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json(inserted);
  } catch (error) {
    console.error('Error uploading bom-auto images:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/atendimentos/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status_atendimento, observacoes_tratamento, usuario } = req.body;

    if (!usuario) {
      return res.status(400).json({ message: 'Usuário é obrigatório.' });
    }

    const current = await query('SELECT * FROM bom_auto_atendimentos WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Atendimento não encontrado.' });
    }

    const atendimento = current.rows[0];
    const statusAnterior = atendimento.status_atendimento;

    if (status_atendimento === 'Solucionado') {
      const imgCount = await query(
        'SELECT COUNT(*) FROM bom_auto_imagens WHERE atendimento_id = $1',
        [id]
      );
      if (parseInt(imgCount.rows[0].count, 10) === 0) {
        return res.status(400).json({ message: 'Para marcar como Solucionado, é obrigatório anexar pelo menos uma imagem.' });
      }
    }

    let updateSql = `UPDATE bom_auto_atendimentos SET status_atendimento = $1`;
    let updateParams = [status_atendimento || statusAnterior];
    let paramIdx = 2;

    if (observacoes_tratamento !== undefined && observacoes_tratamento !== null) {
      const sanitized = observacoes_tratamento.replace(/<[^>]*>/g, '').trim();
      updateSql += `, observacoes_tratamento = $${paramIdx++}`;
      updateParams.push(sanitized);
    }

    if (!atendimento.data_hora_inicio_tratamento) {
      updateSql += `, data_hora_inicio_tratamento = NOW(), usuario_responsavel_tratamento = $${paramIdx++}`;
      updateParams.push(usuario);
    }

    updateSql += ` WHERE id = $${paramIdx++} RETURNING *`;
    updateParams.push(id);

    const result = await query(updateSql, updateParams);

    const statusChanged = status_atendimento && status_atendimento !== statusAnterior;
    const hasObs = observacoes_tratamento && observacoes_tratamento.replace(/<[^>]*>/g, '').trim();
    if (statusChanged || hasObs) {
      const sanitizedObs = hasObs || null;
      await query(
        `INSERT INTO bom_auto_historico_alteracoes (atendimento_id, status_anterior, status_novo, usuario, observacao)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, statusAnterior, statusChanged ? status_atendimento : statusAnterior, usuario, sanitizedObs]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating bom-auto atendimento:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos/:id/historico', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM bom_auto_historico_alteracoes
       WHERE atendimento_id = $1
       ORDER BY data_hora DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bom-auto historico:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
