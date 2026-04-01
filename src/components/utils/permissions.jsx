export const AGENT_PERMISSIONS = {
  admin: {
    modules: ['sales_pj', 'config'],
    canViewAllTickets: true,
    canViewAllLeads: true,
    canAccessReports: true,
    canManageAgents: true,
    canManageSettings: true,
  },
  sales_supervisor: {
    modules: ['sales_pj'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: false,
    canManageSettings: false,
  },
  sales: {
    modules: ['sales_pj'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
};

export function canAccessModule(agent, moduleId) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  if (agent.modules !== undefined && agent.modules !== null) {
    if (agent.modules.length === 0) return false;
    if (agent.modules.includes('all')) return true;
    if (agent.modules.includes(moduleId)) return true;
    return false;
  }
  
  const basePermissions = AGENT_PERMISSIONS[agentType] || AGENT_PERMISSIONS.sales;
  return basePermissions.modules.includes(moduleId);
}

export function canViewAll(agent, resourceType = 'leads-pj') {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  const basePermissions = AGENT_PERMISSIONS[agentType];
  
  if (agent.permissions) {
    if (resourceType === 'leads-pj' && agent.permissions.can_view_all_leads) return true;
  }
  
  return basePermissions?.canViewAllLeads || false;
}

export function canViewTeam(agent, resourceType = 'leads-pj') {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  const basePermissions = AGENT_PERMISSIONS[agentType];
  
  if (agent.permissions) {
    if (resourceType === 'leads-pj' && agent.permissions.can_view_team_leads) return true;
  }
  
  return basePermissions?.canViewTeamLeads || false;
}

export function canAccessReports(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  if (agent.permissions?.can_access_reports) return true;
  
  const basePermissions = AGENT_PERMISSIONS[agentType];
  return basePermissions?.canAccessReports || false;
}

export function canManageAgents(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  if (agent.modules && agent.modules.length > 0) {
    if (agent.modules.includes('all') || agent.modules.includes('config')) return true;
  }
  
  if (agent.permissions?.can_manage_agents) return true;
  
  return false;
}

export function canManageSettings(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  if (agent.modules && agent.modules.length > 0) {
    if (agent.modules.includes('all') || agent.modules.includes('config')) return true;
  }
  
  if (agent.permissions?.can_manage_settings) return true;
  
  return false;
}

export function isSupervisorType(agentType) {
  return agentType === 'sales_supervisor' || agentType?.endsWith('_supervisor');
}

export function filterMenuItems(agent, menuItems) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return [];
  
  const isSupervisor = isSupervisorType(agentType);
  const isAdmin = agentType === 'admin';
  
  const allowedSubmenus = agent.allowedSubmenus || [];
  const hasSubmenuRestrictions = allowedSubmenus.length > 0;
  
  return menuItems
    .filter(item => {
      if (isAdmin) return true;
      
      const effectiveModuleId = item.moduleId || item.id;
      if (!canAccessModule(agent, effectiveModuleId)) return false;
      
      return true;
    })
    .map(item => {
      if (isAdmin) return item;
      
      if (!item.items || item.items.length === 0) return item;
      
      const filteredItems = item.items.filter(subItem => {
        const urlPageName = subItem.url ? subItem.url.replace(/^\//, '').split('?')[0] : null;
        const submenuKey = urlPageName || subItem.title;
        
        if (hasSubmenuRestrictions) {
          if (allowedSubmenus.includes(submenuKey)) {
            if (item.id === 'config') {
              if (subItem.title === 'Agentes') {
                return canManageAgents(agent);
              }
              return canManageSettings(agent);
            }
            return true;
          }
          return false;
        }
        
        if (subItem.supervisorOnly && !isSupervisor) {
          return false;
        }
        
        if (item.id === 'config') {
          if (subItem.title === 'Agentes') {
            return canManageAgents(agent);
          }
          return canManageSettings(agent);
        }
        
        return true;
      });
      
      return { ...item, items: filteredItems };
    });
}
