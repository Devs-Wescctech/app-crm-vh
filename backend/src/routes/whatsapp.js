import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getWhatsAppTemplates, getWhatsAppTemplatesByToken, sendWhatsAppMessage, sendWhatsAppMessageWithToken, setContactAttributes } from '../services/whatsappService.js';
import { query } from '../config/database.js';
import { runAllAutomations, getAutomationLogs } from '../services/automationService.js';

const router = Router();

router.get('/templates', authMiddleware, async (req, res) => {
  try {
    const templates = await getWhatsAppTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/templates-by-token', authMiddleware, async (req, res) => {
  try {
    const channelToken = req.headers['x-channel-token'];
    if (!channelToken) {
      return res.status(400).json({ message: 'Channel token is required (header "x-channel-token")' });
    }
    const templates = await getWhatsAppTemplatesByToken(channelToken);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching WhatsApp templates by token:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/test-send', authMiddleware, async (req, res) => {
  try {
    const { phone, templateId, templateName, channelToken } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Número de telefone é obrigatório' });
    }
    if (!templateId) {
      return res.status(400).json({ success: false, error: 'Template é obrigatório' });
    }
    if (!channelToken) {
      return res.status(400).json({ success: false, error: 'Token do canal é obrigatório' });
    }

    const formattedPhone = phone.replace(/\D/g, '');

    const mockLead = {
      name: 'Teste de Envio',
      full_name: 'Teste de Envio',
      phone: formattedPhone,
    };

    const mockAgent = {
      name: req.user?.full_name || req.user?.name || 'Vendedor Teste',
      full_name: req.user?.full_name || req.user?.name || 'Vendedor Teste',
      phone: req.user?.phone || '',
      id: req.user?.id,
    };

    const result = await sendWhatsAppMessageWithToken(mockLead, mockAgent, templateId, channelToken, null);
    res.json({ success: true, message: `Mensagem de teste enviada para ${formattedPhone}` });
  } catch (error) {
    console.error('Error in test-send:', error);

    let userMessage = error.message;
    if (error.message && error.message.includes('already open')) {
      userMessage = 'Já existe uma conversa aberta com este número na plataforma WHU. Tente com outro número ou aguarde o chat ser fechado.';
    }

    res.status(500).json({ success: false, error: userMessage });
  }
});

router.post('/send-message', authMiddleware, async (req, res) => {
  try {
    const { leadId, leadType, templateId, templateComponents } = req.body;
    
    let lead;
    let tableName;
    
    if (leadType === 'pf') {
      tableName = 'leads';
    } else if (leadType === 'pj') {
      tableName = 'leads_pj';
    } else if (leadType === 'referral') {
      tableName = 'referrals';
    } else {
      return res.status(400).json({ message: 'Invalid lead type' });
    }

    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    lead = leadResult.rows[0];

    const agentId = lead.agent_id || lead.promoter_id;
    let agent = null;
    if (agentId) {
      const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
      agent = agentResult.rows[0];
    }

    const result = await sendWhatsAppMessage(lead, agent, templateId, templateComponents);
    
    await query(
      `INSERT INTO automation_logs (automation_type, lead_id, action_type, action_result, success)
       VALUES ($1, $2, $3, $4, $5)`,
      ['manual_whatsapp', leadId, 'send_whatsapp_message', JSON.stringify(result), true]
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    
    await query(
      `INSERT INTO automation_logs (automation_type, lead_id, action_type, success, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      ['manual_whatsapp', req.body.leadId, 'send_whatsapp_message', false, error.message]
    ).catch(console.error);

    res.status(500).json({ message: error.message });
  }
});

router.post('/set-attributes/:contactId', authMiddleware, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { attributes } = req.body;
    
    const result = await setContactAttributes(contactId, attributes);
    res.json(result);
  } catch (error) {
    console.error('Error setting contact attributes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/test-connection', authMiddleware, async (req, res) => {
  try {
    const templates = await getWhatsAppTemplates();
    res.json({ 
      success: true, 
      message: 'Connection successful',
      templatesCount: Array.isArray(templates) ? templates.length : 0 
    });
  } catch (error) {
    console.error('Error testing WhatsApp connection:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/test-automation', authMiddleware, async (req, res) => {
  try {
    const { automationType, automationId, testPhone, templateId, sampleData } = req.body;
    
    if (!testPhone) {
      return res.status(400).json({ message: 'Telefone de teste é obrigatório' });
    }
    if (!templateId) {
      return res.status(400).json({ message: 'Template é obrigatório' });
    }

    const leadName = sampleData?.name || 'Lead de Teste';
    const agentName = req.user?.full_name || req.user?.name || 'Vendedor Teste';

    const mockLead = {
      name: leadName,
      full_name: leadName,
      phone: testPhone,
      email: sampleData?.email || 'teste@exemplo.com',
    };

    const mockAgent = {
      name: agentName,
      full_name: agentName,
      phone: req.user?.phone || '',
      id: req.user?.id,
    };

    // Don't pass templateComponents - let sendWhatsAppMessage determine the correct number of parameters
    const result = await sendWhatsAppMessage(mockLead, mockAgent, templateId, null);
    
    await query(
      `INSERT INTO automation_logs (automation_type, action_type, action_result, success)
       VALUES ($1, $2, $3, $4)`,
      [`test_${automationType}`, 'send_whatsapp', JSON.stringify({ ...result, testPhone, templateId }), true]
    );

    res.json({ 
      success: true, 
      message: `Mensagem de teste enviada para ${testPhone}`,
      ...result 
    });
  } catch (error) {
    console.error('Error testing automation:', error);
    
    await query(
      `INSERT INTO automation_logs (automation_type, action_type, success, error_message)
       VALUES ($1, $2, $3, $4)`,
      [`test_${req.body.automationType}`, 'send_whatsapp', false, error.message]
    ).catch(console.error);

    let userMessage = error.message;
    if (error.message.includes('Chat already open')) {
      userMessage = 'Já existe uma conversa aberta com este número na plataforma WHU. Tente com outro número ou aguarde o chat ser fechado.';
    } else if (error.message.includes('needs components')) {
      userMessage = 'O template requer parâmetros que não foram fornecidos corretamente.';
    }

    res.status(500).json({ message: userMessage });
  }
});

router.get('/automation-logs', authMiddleware, async (req, res) => {
  try {
    const { automationType, status, automationId } = req.query;
    const logs = await getAutomationLogs({ automationType, status, automationId });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching automation logs:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/run-automations', authMiddleware, async (req, res) => {
  try {
    await runAllAutomations();
    res.json({ message: 'Automações executadas com sucesso' });
  } catch (error) {
    console.error('Error running automations:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/automation-logs/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM automation_logs WHERE id = $1', [id]);
    res.json({ message: 'Log removido' });
  } catch (error) {
    console.error('Error deleting automation log:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/automation-logs', authMiddleware, async (req, res) => {
  try {
    const { automationType } = req.query;
    if (automationType) {
      await query('DELETE FROM automation_logs WHERE automation_type = $1', [automationType]);
    } else {
      await query('DELETE FROM automation_logs');
    }
    res.json({ message: 'Logs limpos' });
  } catch (error) {
    console.error('Error clearing automation logs:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
