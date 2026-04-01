import { query } from '../config/database.js';

const RUDO_API_BASE = 'https://api.wescctech.com.br/core/v2/api';

function getTemplateParamCount(templateDef) {
  const sources = [
    templateDef.dynamicComponents,
    templateDef.staticComponents,
    templateDef.components,
  ];
  
  for (const source of sources) {
    if (!source) continue;
    const body = source.find(c => c.type === 'BODY');
    if (body?.text) {
      const matches = body.text.match(/\{\{\d+\}\}/g);
      if (matches) return matches.length;
    }
  }
  return 0;
}

function resolveVariableValue(source, customValue, lead, agent, extraData = {}) {
  switch (source) {
    case 'lead_name':
      return lead.name || lead.referred_name || lead.contact_name || lead.full_name || 'Cliente';
    case 'company_name':
      return lead.company_name || lead.companyName || lead.razao_social || lead.nome_fantasia || lead.fantasy_name || '';
    case 'agent_name':
      return agent?.name || agent?.full_name || 'Consultor';
    case 'lead_email':
      return lead.email || '';
    case 'lead_phone':
      return lead.phone || lead.whatsapp || lead.cell_phone || '';
    case 'proposal_url':
      return extraData.proposalUrl || lead.proposal_url || '';
    case 'contract_url':
      return extraData.contractUrl || '';
    case 'custom':
      return customValue || '';
    default:
      return '';
  }
}

function buildTemplateComponentsFromMapping(templateVars, lead, agent, extraData = {}) {
  if (!templateVars || templateVars.length === 0) return [];

  const leadName = lead.name || lead.referred_name || lead.contact_name || lead.full_name || 'Cliente';
  const agentName = agent?.name || agent?.full_name || 'Consultor';
  const fallbackValues = [leadName, agentName, lead.email || '', lead.company_name || '', lead.phone || ''];

  const parameters = templateVars.map((v, idx) => {
    const resolved = v.source ? resolveVariableValue(v.source, v.customValue || v.custom_value, lead, agent, extraData) : '';
    return {
      type: 'text',
      text: resolved || fallbackValues[idx] || '',
    };
  });

  return [{ type: 'BODY', parameters }];
}

function buildTemplateComponents(paramCount, leadName, agentName, lead) {
  if (paramCount === 0) return [];

  const availableValues = [
    leadName,
    agentName,
    lead.email || '',
    lead.company_name || lead.companyName || '',
    lead.phone || '',
    '',
  ];

  const parameters = [];
  for (let i = 0; i < paramCount; i++) {
    parameters.push({
      type: 'text',
      text: availableValues[i] || `Param ${i + 1}`,
    });
  }

  return [{ type: 'BODY', parameters }];
}

async function getConfiguredToken() {
  try {
    const result = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'automation_token' LIMIT 1"
    );
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      return result.rows[0].setting_value;
    }
  } catch (err) {
    console.error('[WhatsApp] Error fetching automation_token from DB:', err.message);
  }
  return process.env.RUDO_WHATSAPP_TOKEN || null;
}

export async function getWhatsAppTemplates() {
  const token = await getConfiguredToken();
  
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const response = await fetch(`${RUDO_API_BASE}/action-cards/templates`, {
    method: 'GET',
    headers: {
      'access-token': token,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch templates: ${error.msg || response.statusText}`);
  }

  return response.json();
}

export async function getWhatsAppTemplatesByToken(channelToken) {
  if (!channelToken) {
    throw new Error('Channel token is required');
  }

  const response = await fetch(`${RUDO_API_BASE}/action-cards/templates`, {
    method: 'GET',
    headers: {
      'access-token': channelToken,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch templates for channel: ${error.msg || response.statusText}`);
  }

  return response.json();
}

export async function createChatWithToken(params, channelToken) {
  const token = channelToken || await getConfiguredToken();
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const { number, templateId, templateComponents } = params;

  const body = {
    number: number.replace(/\D/g, ''),
    quickAnswerId: templateId,
    quickAnswerComponents: templateComponents || [],
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/create-new`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = responseData.msg || response.statusText;
    const error = new Error(`Failed to create chat: ${errorMsg}`);
    error.apiMessage = errorMsg;
    throw error;
  }

  return responseData;
}

export async function sendTemplateWithToken(params, channelToken) {
  const token = channelToken || await getConfiguredToken();
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const { number, templateId, templateComponents } = params;

  const body = {
    number: number.replace(/\D/g, ''),
    templateId: templateId,
    templateComponents: templateComponents || [],
    forceSend: true,
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-template`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Failed to send template: ${responseData.msg || response.statusText}`);
  }

  return responseData;
}

export async function sendWhatsAppMessageWithToken(lead, agent, templateId, channelToken, templateComponents) {
  const phone = lead.phone || lead.referred_phone || lead.contact_phone || lead.whatsapp || lead.cell_phone;

  if (!phone) {
    throw new Error('Lead does not have a phone number');
  }

  const formattedNumber = phone.replace(/\D/g, '');
  const brazilNumber = formattedNumber.startsWith('55') ? formattedNumber : `55${formattedNumber}`;
  const leadName = lead.name || lead.referred_name || lead.contact_name || 'Cliente';
  const agentName = agent?.name || agent?.full_name || 'Consultor';

  let components = templateComponents;

  if (!components) {
    let paramCount = 1;
    try {
      const tokenToUse = channelToken || await getConfiguredToken();
      const templates = tokenToUse ? await getWhatsAppTemplatesByToken(tokenToUse) : await getWhatsAppTemplates();
      const templateDef = templates.find(t => t.id === templateId);
      if (templateDef) {
        paramCount = getTemplateParamCount(templateDef);
      }
    } catch (err) {
      console.error('[WhatsApp] Failed to fetch template definition for token, using fallback:', err.message);
    }

    components = buildTemplateComponents(paramCount, leadName, agentName, lead);
  }

  let result;
  let usedFallback = false;

  try {
    result = await createChatWithToken({
      number: brazilNumber,
      templateId,
      templateComponents: components,
    }, channelToken);
  } catch (error) {
    if (error.apiMessage && error.apiMessage.toLowerCase().includes('already open')) {
      usedFallback = true;
      result = await sendTemplateWithToken({
        number: brazilNumber,
        templateId,
        templateComponents: components,
      }, channelToken);
    } else {
      throw error;
    }
  }

  return { ...result, usedFallback };
}

export async function createChat(params) {
  const token = await getConfiguredToken();
  
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const { number, templateId, templateComponents } = params;

  const body = {
    number: number.replace(/\D/g, ''),
    quickAnswerId: templateId,
    quickAnswerComponents: templateComponents || [],
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/create-new`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = responseData.msg || response.statusText;
    const error = new Error(`Failed to create chat: ${errorMsg}`);
    error.apiMessage = errorMsg;
    throw error;
  }

  return responseData;
}

export async function sendTemplate(params) {
  const token = await getConfiguredToken();
  
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const { number, templateId, templateComponents } = params;

  const body = {
    number: number.replace(/\D/g, ''),
    templateId: templateId,
    templateComponents: templateComponents || [],
    forceSend: true,
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-template`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Failed to send template: ${responseData.msg || response.statusText}`);
  }

  return responseData;
}

export async function sendTextMessage(params) {
  const token = await getConfiguredToken();
  
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const { number, message } = params;

  const body = {
    number: number.replace(/\D/g, ''),
    message: message,
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-message`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Failed to send message: ${responseData.msg || response.statusText}`);
  }

  return responseData;
}

export async function sendDocument(params) {
  const token = await getConfiguredToken();
  
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const { number, documentUrl, caption, filename } = params;

  const body = {
    number: number.replace(/\D/g, ''),
    url: documentUrl,
    caption: caption || '',
    filename: filename || 'proposta.pdf',
    type: 'document',
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-media`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Failed to send document: ${responseData.msg || response.statusText}`);
  }

  return responseData;
}

export async function getContactByPhone(phoneNumber) {
  const token = await getConfiguredToken();
  
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const formattedNumber = phoneNumber.replace(/\D/g, '');
  const last8Digits = formattedNumber.slice(-8);

  // Search contacts by last digits of phone number
  const response = await fetch(`${RUDO_API_BASE}/contacts?phone=${last8Digits}`, {
    method: 'GET',
    headers: {
      'access-token': token,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const contacts = await response.json().catch(() => []);
  
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return null;
  }

  // Find exact match by last 8 digits (handles the extra 9 digit in Brazilian numbers)
  const targetLast8 = formattedNumber.slice(-8);
  const found = contacts.find(c => {
    const contactLast8 = (c.number || '').slice(-8);
    return contactLast8 === targetLast8;
  });

  return found || contacts[0];
}

export async function setContactAttributes(contactId, attributes) {
  const token = await getConfiguredToken();
  
  if (!token) {
    throw new Error('Token de automação não configurado. Configure o token no menu de Automações.');
  }

  const response = await fetch(`${RUDO_API_BASE}/contacts/${contactId}/set-attributes`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(attributes),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to set attributes: ${error.msg || response.statusText}`);
  }

  return response.json();
}

export async function sendWhatsAppMessage(lead, agent, templateId, templateComponents, templateVariables, extraData) {
  const phone = lead.phone || lead.referred_phone || lead.contact_phone || lead.whatsapp || lead.cell_phone;
  
  if (!phone) {
    throw new Error('Lead does not have a phone number');
  }

  const formattedNumber = phone.replace(/\D/g, '');
  const brazilNumber = formattedNumber.startsWith('55') ? formattedNumber : `55${formattedNumber}`;

  const leadName = lead.name || lead.referred_name || lead.contact_name || 'Cliente';
  const agentName = agent?.name || agent?.full_name || 'Consultor';

  let components = templateComponents;

  if (!components && templateVariables && templateVariables.length > 0 && templateVariables.some(v => v?.source)) {
    components = buildTemplateComponentsFromMapping(templateVariables, lead, agent, extraData || {});
  }

  if (!components) {
    let paramCount = 1;
    try {
      const templates = await getWhatsAppTemplates();
      const templateDef = templates.find(t => t.id === templateId);
      if (templateDef) {
        paramCount = getTemplateParamCount(templateDef);
      }
    } catch (err) {
      console.error('[WhatsApp] Failed to fetch template definition, using fallback params:', err.message);
    }

    components = buildTemplateComponents(paramCount, leadName, agentName, lead);
  }

  let result;
  let usedFallback = false;

  try {
    result = await createChat({
      number: brazilNumber,
      templateId,
      templateComponents: components,
    });
  } catch (error) {
    if (error.apiMessage && error.apiMessage.toLowerCase().includes('already open')) {
      console.log(`[WhatsApp] Chat already opened for ${brazilNumber}, using send-template fallback`);
      usedFallback = true;
      result = await sendTemplate({
        number: brazilNumber,
        templateId,
        templateComponents: components,
      });
    } else {
      throw error;
    }
  }

  // Always update contact attributes when we have an agent
  if (agent) {
    let contactId = result.contactId;
    
    // If no contactId in result (fallback case), try to find the contact by phone
    if (!contactId) {
      try {
        const contact = await getContactByPhone(brazilNumber);
        if (contact && contact.id) {
          contactId = contact.id;
          console.log(`[WhatsApp] Found existing contact ${contactId} for ${brazilNumber}`);
        } else if (contact && contact._id) {
          contactId = contact._id;
          console.log(`[WhatsApp] Found existing contact ${contactId} for ${brazilNumber}`);
        }
      } catch (err) {
        console.error('[WhatsApp] Failed to find contact by phone:', err.message);
      }
    }

    if (contactId) {
      try {
        await setContactAttributes(contactId, [
          { key: 'vendedor_nome', value: agent.name, description: 'Nome do vendedor responsável' },
          { key: 'vendedor_id', value: agent.id, description: 'ID do vendedor no CRM' },
        ]);
        console.log(`[WhatsApp] Updated contact ${contactId} attributes with agent ${agent.name}`);
      } catch (err) {
        console.error('[WhatsApp] Failed to set contact attributes:', err.message);
      }
    } else {
      console.log(`[WhatsApp] No contactId available for ${brazilNumber}, skipping attribute update`);
    }
  }

  return { ...result, usedFallback };
}
