export const AGENT_PERMISSIONS = {
  admin: {
    modules: ['sales_pj', 'config'],
    canViewAllTickets: true,
    canViewAllLeads: true,
    canAccessReports: true,
    canManageAgents: true,
    canManageSettings: true,
  },
  coordinator: {
    modules: ['sales_pj'],
    canViewAllTickets: true,
    canViewAllLeads: true,
    canAccessReports: true,
    canManageAgents: true,
    canManageSettings: false,
  },
  supervisor: {
    modules: ['sales_pj'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: true,
    canManageSettings: false,
  },
  sales_supervisor: {
    modules: ['sales_pj'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: true,
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

export function isCoordinatorType(agentType) {
  return agentType === 'coordinator';
}

export function canAccessModule(agent, moduleId) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;

  if ((agentType === 'coordinator' || isSupervisorType(agentType)) && moduleId === 'config') {
    return true;
  }
  
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
  
  if (agentType === 'admin' || agentType === 'coordinator') return true;
  if (isSupervisorType(agentType)) return true;
  
  if (agent.modules && agent.modules.length > 0) {
    if (agent.modules.includes('all') || agent.modules.includes('config')) return true;
  }
  
  if (agent.permissions?.can_manage_agents) return true;
  
  return false;
}

export function canManageAgentInTeam(currentAgent, agentTeamId) {
  const agentType = currentAgent?.agent_type || currentAgent?.agentType;
  if (!currentAgent || !agentType) return false;
  
  if (agentType === 'admin' || agentType === 'coordinator') return true;
  
  if (isSupervisorType(agentType)) {
    const myTeamId = currentAgent.teamId || currentAgent.team_id;
    return agentTeamId === myTeamId;
  }
  
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

export const SYSTEMS_PERMISSION_KEYS = [
  'SystemsSalesFields',
  'SystemsGoogleCalendar',
  'SystemsAutentique',
];

export function canAccessSystemsItem(agent, key) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent) return false;
  if (agentType === 'admin') return true;
  if (Array.isArray(agent.modules) && agent.modules.includes('all')) return true;
  const allowed = agent.allowedSubmenus || agent.allowed_submenus || [];
  return allowed.includes(key);
}

export function hasAnySystemsAccess(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent) return false;
  if (agentType === 'admin') return true;
  return SYSTEMS_PERMISSION_KEYS.some(k => canAccessSystemsItem(agent, k));
}

export function isSupervisorType(agentType) {
  return agentType === 'supervisor' || agentType === 'sales_supervisor' || agentType?.endsWith('_supervisor');
}

export function hasFullVisibility(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agentType) return false;
  if (agentType === 'admin' || agentType === 'coordinator') return true;
  if (canViewAll(agent, 'leads-pj')) return true;
  return false;
}

export function hasTeamVisibility(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agentType) return false;
  if (agentType === 'admin') return true;
  if (isSupervisorType(agentType)) return true;
  if (canViewTeam(agent, 'leads-pj')) return true;
  return false;
}

export function getVisibleAgentIds(currentAgent, allAgents, allTeams = null) {
  if (!currentAgent) return [];

  if (hasFullVisibility(currentAgent)) {
    return allAgents.map(a => a.id);
  }

  const agentType = currentAgent?.agent_type || currentAgent?.agentType;
  if (isSupervisorType(agentType)) {
    // REGRA ESTRITA (causa raiz do vazamento corrigido): supervisor enxerga
    // apenas agentes em que `supervisor_id` é o seu próprio id. Não usar
    // `team_id` como fallback porque um time pode ter VÁRIOS supervisores
    // (ex.: time "Vendas" com Supervisor A e Supervisor B), e isso fazia
    // cada supervisor ver os subordinados do outro.
    const idsBySupervisor = new Set(
      allAgents
        .filter(a => (a.supervisorId || a.supervisor_id) === currentAgent.id)
        .map(a => a.id)
    );

    // Fallback OPCIONAL: se a página passou `allTeams` e existe um time cujo
    // `supervisor_id` é o currentAgent (ou seja, o supervisor é o "dono"
    // declarado do time), inclui também os membros desse time.
    if (Array.isArray(allTeams)) {
      const ownedTeamIds = new Set(
        allTeams
          .filter(t => (t.supervisorId || t.supervisor_id) === currentAgent.id)
          .map(t => t.id)
      );
      if (ownedTeamIds.size > 0) {
        for (const a of allAgents) {
          const tId = a.teamId || a.team_id;
          if (tId && ownedTeamIds.has(tId)) idsBySupervisor.add(a.id);
        }
      }
    }

    idsBySupervisor.add(currentAgent.id);
    return Array.from(idsBySupervisor);
  }

  if (hasTeamVisibility(currentAgent)) {
    const teamId = currentAgent.teamId || currentAgent.team_id;
    if (!teamId) return [currentAgent.id];
    const ids = allAgents
      .filter(a => (a.teamId || a.team_id) === teamId)
      .map(a => a.id);
    if (!ids.includes(currentAgent.id)) {
      ids.push(currentAgent.id);
    }
    return ids;
  }

  return [currentAgent.id];
}

export function getVisibleTeams(currentAgent, allTeams, allAgents) {
  if (!currentAgent) return [];

  if (hasFullVisibility(currentAgent)) {
    return allTeams;
  }

  const agentType = currentAgent?.agent_type || currentAgent?.agentType;
  if (isSupervisorType(agentType) && allAgents) {
    const visibleIds = getVisibleAgentIds(currentAgent, allAgents);
    const teamIds = new Set();
    allAgents
      .filter(a => visibleIds.includes(a.id))
      .forEach(a => {
        const tid = a.teamId || a.team_id;
        if (tid) teamIds.add(tid);
      });
    return allTeams.filter(t => teamIds.has(t.id));
  }

  if (hasTeamVisibility(currentAgent)) {
    const teamId = currentAgent.teamId || currentAgent.team_id;
    return allTeams.filter(t => t.id === teamId);
  }

  return [];
}

export function getVisibleAgentsForFilter(currentAgent, allAgents) {
  if (!currentAgent) return [];

  if (hasFullVisibility(currentAgent)) {
    return allAgents;
  }

  const visibleIds = getVisibleAgentIds(currentAgent, allAgents);
  return allAgents.filter(a => visibleIds.includes(a.id));
}

export function canManageTeam(currentAgent, teamId, allTeams) {
  const agentType = currentAgent?.agent_type || currentAgent?.agentType;
  if (!currentAgent || !agentType) return false;

  if (agentType === 'admin') return true;

  if (agentType === 'coordinator') {
    if (!teamId || !allTeams) return true;
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return true;
    return team.coordinator_id === currentAgent.id || team.coordinatorId === currentAgent.id;
  }

  if (isSupervisorType(agentType)) {
    const myTeamId = currentAgent.teamId || currentAgent.team_id;
    return teamId === myTeamId;
  }

  return false;
}

export function getManagedTeams(currentAgent, allTeams) {
  const agentType = currentAgent?.agent_type || currentAgent?.agentType;
  if (!currentAgent || !agentType) return [];

  if (agentType === 'admin') return allTeams;

  if (agentType === 'coordinator') {
    return allTeams.filter(t => t.coordinator_id === currentAgent.id || t.coordinatorId === currentAgent.id);
  }

  if (isSupervisorType(agentType)) {
    const myTeamId = currentAgent.teamId || currentAgent.team_id;
    return allTeams.filter(t => t.id === myTeamId);
  }

  return [];
}

export function getDataVisibilityKey(user, currentAgent) {
  if (!user) return 'none';
  if (hasFullVisibility(currentAgent)) return 'admin';
  if (hasTeamVisibility(currentAgent)) {
    const teamId = currentAgent?.teamId || currentAgent?.team_id;
    return `supervisor-${teamId || 'no-team'}`;
  }
  return currentAgent?.id || 'none';
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
        
        if (subItem.supervisorOnly && !isSupervisor && agentType !== 'coordinator') {
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
