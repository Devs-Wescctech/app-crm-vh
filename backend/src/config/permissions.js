export const AGENT_TYPES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  SUPPORT: 'support',
  SALES: 'sales',
  PRE_SALES: 'pre_sales',
  POST_SALES: 'post_sales',
  COLLECTION: 'collection'
};

export const AGENT_LEVELS = {
  JUNIOR: 'junior',
  PLENO: 'pleno',
  SENIOR: 'senior',
  SPECIALIST: 'specialist'
};

export const MODULES = {
  DASHBOARD: 'dashboard',
  SUPPORT: 'support',
  SALES: 'sales',
  PRE_SALES: 'pre_sales',
  POST_SALES: 'post_sales',
  COLLECTION: 'collection',
  QUALITY: 'quality',
  KNOWLEDGE_BASE: 'knowledge_base',
  REFERRALS: 'referrals',
  SETTINGS: 'settings',
  REPORTS: 'reports'
};

export const TICKET_PRIORITIES = {
  P1: { name: 'Crítico', firstResponseMinutes: 15, resolutionMinutes: 60 },
  P2: { name: 'Alto', firstResponseMinutes: 60, resolutionMinutes: 240 },
  P3: { name: 'Médio', firstResponseMinutes: 240, resolutionMinutes: 480 },
  P4: { name: 'Baixo', firstResponseMinutes: 480, resolutionMinutes: 1440 }
};

export const ACTIVITY_TYPES = {
  CALL: 'call',
  EMAIL: 'email',
  MEETING: 'meeting',
  PRESENTATION: 'presentation',
  NOTE: 'note',
  TASK: 'task'
};

export const ROLE_PERMISSIONS = {
  [AGENT_TYPES.ADMIN]: {
    modules: Object.values(MODULES),
    canViewAllTickets: true,
    canViewTeamTickets: true,
    canViewAllLeads: true,
    canViewTeamLeads: true,
    canManageAgents: true,
    canManageSettings: true,
    canAccessReports: true
  },
  [AGENT_TYPES.SUPERVISOR]: {
    modules: [MODULES.DASHBOARD, MODULES.SUPPORT, MODULES.SALES, MODULES.PRE_SALES, MODULES.POST_SALES, MODULES.COLLECTION, MODULES.QUALITY, MODULES.REPORTS],
    canViewAllTickets: false,
    canViewTeamTickets: true,
    canViewAllLeads: false,
    canViewTeamLeads: true,
    canManageAgents: false,
    canManageSettings: false,
    canAccessReports: true
  },
  [AGENT_TYPES.SUPPORT]: {
    modules: [MODULES.DASHBOARD, MODULES.SUPPORT, MODULES.KNOWLEDGE_BASE],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canManageAgents: false,
    canManageSettings: false,
    canAccessReports: false
  },
  [AGENT_TYPES.SALES]: {
    modules: [MODULES.DASHBOARD, MODULES.SALES, MODULES.REFERRALS],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canManageAgents: false,
    canManageSettings: false,
    canAccessReports: false
  },
  [AGENT_TYPES.PRE_SALES]: {
    modules: [MODULES.DASHBOARD, MODULES.PRE_SALES],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canManageAgents: false,
    canManageSettings: false,
    canAccessReports: false
  },
  [AGENT_TYPES.POST_SALES]: {
    modules: [MODULES.DASHBOARD, MODULES.POST_SALES, MODULES.SUPPORT],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canManageAgents: false,
    canManageSettings: false,
    canAccessReports: false
  },
  [AGENT_TYPES.COLLECTION]: {
    modules: [MODULES.DASHBOARD, MODULES.COLLECTION],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canManageAgents: false,
    canManageSettings: false,
    canAccessReports: false
  }
};

export function getPermissions(agentType) {
  return ROLE_PERMISSIONS[agentType] || ROLE_PERMISSIONS[AGENT_TYPES.SUPPORT];
}

export function canAccessModule(agentType, module) {
  const permissions = getPermissions(agentType);
  return permissions.modules.includes(module);
}

export function getVisibilityFilter(agentType, userId, teamId, entity) {
  const permissions = getPermissions(agentType);
  
  if (entity === 'tickets') {
    if (permissions.canViewAllTickets) {
      return { type: 'all' };
    }
    if (permissions.canViewTeamTickets && teamId) {
      return { type: 'team', teamId };
    }
    return { type: 'own', agentId: userId };
  }
  
  if (entity === 'leads') {
    if (permissions.canViewAllLeads) {
      return { type: 'all' };
    }
    if (permissions.canViewTeamLeads && teamId) {
      return { type: 'team', teamId };
    }
    return { type: 'own', agentId: userId };
  }
  
  return { type: 'all' };
}
