const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function fetchAPI(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };
  
  console.log(`[API] ${options.method || 'GET'} ${endpoint}`, { hasAuth: !!headers.Authorization });
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    console.error(`[API] Error ${response.status}:`, error.message);
    throw new Error(error.message || 'API Error');
  }

  return response.json();
}

function createEntityClient(entityName) {
  const endpoint = `/${entityName}`;
  
  return {
    list: async (sort, limit) => {
      const params = new URLSearchParams();
      if (sort) params.append('sort', sort);
      if (limit) params.append('limit', limit);
      const query = params.toString() ? `?${params.toString()}` : '';
      return fetchAPI(`${endpoint}${query}`);
    },
    
    get: async (id) => {
      return fetchAPI(`${endpoint}/${id}`);
    },
    
    create: async (data) => {
      return fetchAPI(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    
    update: async (id, data) => {
      return fetchAPI(`${endpoint}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    
    delete: async (id) => {
      return fetchAPI(`${endpoint}/${id}`, {
        method: 'DELETE',
      });
    },
    
    filter: async (filters) => {
      return fetchAPI(`${endpoint}/filter`, {
        method: 'POST',
        body: JSON.stringify(filters),
      });
    },
  };
}

export const base44 = {
  auth: {
    me: async () => {
      return await fetchAPI('/auth/me');
    },
    
    login: async (email, password) => {
      const result = await fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      return result.user;
    },
    
    register: async (email, password, full_name) => {
      const result = await fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name }),
      });
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      return result.user;
    },
    
    logout: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    },
    
    redirectToLogin: (returnUrl) => {
      localStorage.setItem('returnUrl', returnUrl);
      window.location.href = '/login';
    },
  },
  
  entities: {
    Contact: createEntityClient('contacts'),
    Account: createEntityClient('accounts'),
    Contract: createEntityClient('contracts'),
    Team: createEntityClient('teams'),
    Queue: createEntityClient('queues'),
    Agent: createEntityClient('agents'),
    AgentType: createEntityClient('agent-types'),
    SLAPolicy: createEntityClient('sla-policies'),
    Ticket: createEntityClient('tickets'),
    TicketMessage: createEntityClient('ticket-messages'),
    Macro: createEntityClient('macros'),
    Template: createEntityClient('templates'),
    CSATSurvey: createEntityClient('csat-surveys'),
    TicketType: createEntityClient('ticket-types'),
    Dependent: createEntityClient('dependents'),
    KBCategory: createEntityClient('kb-categories'),
    KBArticle: createEntityClient('kb-articles'),
    KBFeedback: createEntityClient('kb-feedback'),
    KBArticleVersion: createEntityClient('kb-article-versions'),
    Lead: createEntityClient('leads'),
    Visit: createEntityClient('visits'),
    Activity: createEntityClient('activities'),
    Territory: createEntityClient('territories'),
    SalesGoal: createEntityClient('sales-goals'),
    SalesAgent: createEntityClient('agents'), // Unificado com agents
    ProposalTemplate: createEntityClient('proposal-templates'),
    Sale: createEntityClient('sales'),
    PortalSession: createEntityClient('portal-sessions'),
    SystemSettings: createEntityClient('system-settings'),
    Notification: createEntityClient('notifications'),
    NotificationPreference: createEntityClient('notification-preferences'),
    LeadAutomation: createEntityClient('lead-automations'),
    Referral: createEntityClient('referrals'),
    ReferralActivity: createEntityClient('referral-activities'),
    DistributionRule: createEntityClient('distribution-rules'),
    QuickService: createEntityClient('quick-services'),
    LeadPJ: createEntityClient('leads-pj'),
    LeadNotePJ: createEntityClient('lead-notes-pj'),
    LeadPJProposalItem: createEntityClient('lead-pj-proposal-items'),
    LeadPJFile: createEntityClient('lead-pj-files'),
    ActivityPJ: createEntityClient('activities-pj'),
    LeadPJAutomation: createEntityClient('lead-pj-automations'),
    ReferralAutomation: createEntityClient('referral-automations'),
    AutomationLog: createEntityClient('automation-logs'),
    CallAudit: createEntityClient('call-audits'),
    QualityChecklist: createEntityClient('quality-checklists'),
  },
  
  whatsapp: {
    getTemplates: () => fetchAPI('/whatsapp/templates'),
    sendMessage: (params) => fetchAPI('/whatsapp/send-message', { method: 'POST', body: JSON.stringify(params) }),
    setAttributes: (contactId, attributes) => fetchAPI(`/whatsapp/set-attributes/${contactId}`, { method: 'POST', body: JSON.stringify({ attributes }) }),
    testConnection: () => fetchAPI('/whatsapp/test-connection', { method: 'POST', body: JSON.stringify({}) }),
  },
  
  functions: {
    invoke: async (functionName, params) => {
      const functionMap = {
        'getCustomerFromERP': 'get-customer-from-erp',
        'validateWhatsApp': 'validate-whatsapp',
        'generateProposal': 'generate-proposal',
        'sendProposalWhatsApp': 'send-proposal-whatsapp',
        'sendProposalEmail': 'send-proposal-email',
        'assignTicketRoundRobin': 'assign-ticket-round-robin',
        'buscaCNPJ': 'busca-cnpj',
        'createNotification': 'create-notification',
        'autentiqueCreateDocument': 'autentiqueCreateDocument',
        'autentiqueCheckStatus': 'autentiqueCheckStatus',
      };
      const endpoint = functionMap[functionName] || functionName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
      const response = await fetchAPI(`/functions/${endpoint}`, { 
        method: 'POST', 
        body: JSON.stringify(params) 
      });
      return { data: response };
    },
    generateProposal: (params) => fetchAPI('/functions/generate-proposal', { method: 'POST', body: JSON.stringify(params) }),
    sendProposalWhatsApp: (params) => fetchAPI('/functions/send-proposal-whatsapp', { method: 'POST', body: JSON.stringify(params) }),
    sendProposalEmail: (params) => fetchAPI('/functions/send-proposal-email', { method: 'POST', body: JSON.stringify(params) }),
    generateSignatureLink: (params) => fetchAPI('/functions/generate-signature-link', { method: 'POST', body: JSON.stringify(params) }),
    portalAuth: (params) => fetchAPI('/functions/portal-auth', { method: 'POST', body: JSON.stringify(params) }),
    validateToken: (params) => fetchAPI('/functions/validate-token', { method: 'POST', body: JSON.stringify(params) }),
    sendCollectionWhatsApp: (params) => fetchAPI('/functions/send-collection-whatsapp', { method: 'POST', body: JSON.stringify(params) }),
    autentiqueCreateDocument: (params) => fetchAPI('/functions/autentique-create-document', { method: 'POST', body: JSON.stringify(params) }),
    autentiqueCheckStatus: (params) => fetchAPI('/functions/autentique-check-status', { method: 'POST', body: JSON.stringify(params) }),
    testAutentique: (params) => fetchAPI('/functions/test-autentique', { method: 'POST', body: JSON.stringify(params) }),
    autentiqueGenerateLink: (params) => fetchAPI('/functions/autentique-generate-link', { method: 'POST', body: JSON.stringify(params) }),
    respondProposal: (params) => fetchAPI('/functions/respond-proposal', { method: 'POST', body: JSON.stringify(params) }),
    getPublicProposal: (params) => fetchAPI('/functions/get-public-proposal', { method: 'POST', body: JSON.stringify(params) }),
    checkNotifications: (params) => fetchAPI('/functions/check-notifications', { method: 'POST', body: JSON.stringify(params) }),
    createNotification: (params) => fetchAPI('/functions/create-notification', { method: 'POST', body: JSON.stringify(params) }),
    checkSLAWarnings: (params) => fetchAPI('/functions/check-sla-warnings', { method: 'POST', body: JSON.stringify(params) }),
    checkLeadAutomations: (params) => fetchAPI('/functions/check-lead-automations', { method: 'POST', body: JSON.stringify(params) }),
    getCustomerFromERP: (params) => fetchAPI('/functions/get-customer-from-erp', { method: 'POST', body: JSON.stringify(params) }),
    validateWhatsApp: (params) => fetchAPI('/functions/validate-whatsapp', { method: 'POST', body: JSON.stringify(params) }),
    assignTicketRoundRobin: (params) => fetchAPI('/functions/assign-ticket-round-robin', { method: 'POST', body: JSON.stringify(params) }),
    sendNpsSurvey: (params) => fetchAPI('/functions/send-nps-survey', { method: 'POST', body: JSON.stringify(params) }),
    getNpsSurvey: (params) => fetchAPI('/functions/get-nps-survey', { method: 'POST', body: JSON.stringify(params) }),
    submitNpsSurvey: (params) => fetchAPI('/functions/submit-nps-survey', { method: 'POST', body: JSON.stringify(params) }),
    validateWhatsAppToken: (params) => fetchAPI('/functions/validate-whatsapp-token', { method: 'POST', body: JSON.stringify(params) }),
    generateWhatsAppToken: (params) => fetchAPI('/functions/generate-whatsapp-token', { method: 'POST', body: JSON.stringify(params) }),
    buscaCNPJ: (params) => fetchAPI('/functions/busca-cnpj', { method: 'POST', body: JSON.stringify(params) }),
    ai_assistant: (params) => fetchAPI('/functions/ai-assistant', { method: 'POST', body: JSON.stringify(params) }),
    processCallAudit: (params) => fetchAPI('/functions/process-call-audit', { method: 'POST', body: JSON.stringify(params) }),
  },
  
  reports: {
    leadPjAgentPeriods: async ({ stage, agentId, teamId, page, pageSize } = {}) => {
      const params = new URLSearchParams();
      if (stage) params.append('stage', stage);
      if (agentId) params.append('agent_id', agentId);
      if (teamId) params.append('team_id', teamId);
      if (page) params.append('page', String(page));
      if (pageSize) params.append('page_size', String(pageSize));
      const qs = params.toString();
      return fetchAPI(`/reports/lead-pj-agent-periods${qs ? `?${qs}` : ''}`);
    },
    leadPjAgentPeriodsAll: async ({ stage, agentId, teamId, pageSize = 200, onProgress } = {}) => {
      const allLeads = [];
      const allActivities = [];
      let page = 1;
      let total = 0;
      let totalPages = 1;
      // Loop until backend says no more pages.
      // Cap iterations defensively to avoid infinite loops.
      for (let i = 0; i < 1000; i += 1) {
        const data = await base44.reports.leadPjAgentPeriods({
          stage,
          agentId,
          teamId,
          page,
          pageSize,
        });
        if (Array.isArray(data?.leads)) allLeads.push(...data.leads);
        if (Array.isArray(data?.activities)) allActivities.push(...data.activities);
        total = data?.total ?? allLeads.length;
        totalPages = data?.totalPages ?? 1;
        if (typeof onProgress === 'function') {
          onProgress({ page, totalPages, loaded: allLeads.length, total });
        }
        if (!data?.hasMore) break;
        page += 1;
      }
      return { leads: allLeads, activities: allActivities, total, totalPages };
    },
  },

  integrations: {
    Core: {
      InvokeLLM: (params) => fetchAPI('/functions/ai-assistant', { method: 'POST', body: JSON.stringify(params) }),
      SendEmail: (params) => fetchAPI('/functions/send-email', { method: 'POST', body: JSON.stringify(params) }),
      UploadFile: async ({ file }) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        return response.json();
      },
      GenerateImage: (params) => fetchAPI('/functions/generate-image', { method: 'POST', body: JSON.stringify(params) }),
      ExtractDataFromUploadedFile: (params) => fetchAPI('/functions/extract-data', { method: 'POST', body: JSON.stringify(params) }),
      CreateFileSignedUrl: (params) => fetchAPI('/functions/create-signed-url', { method: 'POST', body: JSON.stringify(params) }),
      UploadPrivateFile: async ({ file }) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        return response.json();
      },
    },
  },
};

