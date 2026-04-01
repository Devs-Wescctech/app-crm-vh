import { query } from '../config/database.js';
import { getPermissions, getVisibilityFilter, canAccessModule } from '../config/permissions.js';

export async function loadAgentMiddleware(req, res, next) {
  if (!req.user) {
    return next();
  }

  try {
    const result = await query(
      'SELECT * FROM agents WHERE (email = $1 OR user_email = $1) AND active = true',
      [req.user.email]
    );

    if (result.rows.length > 0) {
      const agent = result.rows[0];
      req.agent = {
        id: agent.id,
        name: agent.name,
        agentType: agent.agent_type,
        teamId: agent.team_id,
        level: agent.level || 'pleno',
        online: agent.online,
        capacity: agent.capacity,
        queueIds: agent.queue_ids
      };
      req.permissions = getPermissions(agent.agent_type);
    } else if (req.user.role === 'admin') {
      req.agent = {
        id: null,
        name: req.user.full_name || 'Admin',
        agentType: 'admin',
        teamId: null,
        level: 'specialist',
        online: true,
        capacity: null,
        queueIds: []
      };
      req.permissions = getPermissions('admin');
    }

    next();
  } catch (error) {
    console.error('Error loading agent:', error);
    next();
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.permissions) {
      return res.status(403).json({ message: 'No permissions assigned' });
    }

    if (!req.permissions[permission]) {
      return res.status(403).json({ message: `Permission denied: ${permission}` });
    }

    next();
  };
}

export function requireModule(module) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent profile required' });
    }

    if (!canAccessModule(req.agent.agentType, module)) {
      return res.status(403).json({ message: `Access denied to module: ${module}` });
    }

    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent profile required' });
    }

    if (!roles.includes(req.agent.agentType) && !roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Insufficient role permissions' });
    }

    next();
  };
}

export function applyVisibilityFilter(entity) {
  return (req, res, next) => {
    if (!req.agent) {
      req.visibilityFilter = { type: 'own', agentId: req.user?.id };
    } else {
      req.visibilityFilter = getVisibilityFilter(
        req.agent.agentType,
        req.agent.id,
        req.agent.teamId,
        entity
      );
    }
    next();
  };
}

export function buildVisibilityQuery(baseQuery, filter, entityAlias = '') {
  const prefix = entityAlias ? `${entityAlias}.` : '';
  
  switch (filter.type) {
    case 'all':
      return { query: baseQuery, params: [] };
    case 'team':
      return {
        query: `${baseQuery} WHERE ${prefix}team_id = $1`,
        params: [filter.teamId]
      };
    case 'own':
      return {
        query: `${baseQuery} WHERE ${prefix}assigned_agent_id = $1`,
        params: [filter.agentId]
      };
    default:
      return { query: baseQuery, params: [] };
  }
}
