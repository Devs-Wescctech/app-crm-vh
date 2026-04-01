import { query } from '../config/database.js';

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

const fieldAliases = {
  'created_date': 'created_at',
  'updated_date': 'updated_at',
  'createdDate': 'created_at',
  'updatedDate': 'updated_at',
};

function normalizeFieldName(field) {
  const snakeField = camelToSnake(field);
  return fieldAliases[snakeField] || fieldAliases[field] || snakeField;
}

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

const JSONB_FIELDS = ['stage_history', 'photos', 'metadata', 'history', 'address_components', 'permissions', 'capacity', 'working_hours', 'settings', 'options', 'config', 'data', 'features', 'terms', 'variables', 'trigger_config', 'action_config', 'action_result'];
const POSTGRES_ARRAY_FIELDS = ['queue_ids', 'skills', 'modules', 'territories', 'tags', 'categories', 'allowed_submenus'];

function convertKeysToSnake(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnake);
  
  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = camelToSnake(key);
    acc[snakeKey] = convertKeysToSnake(obj[key]);
    return acc;
  }, {});
}

function convertKeysToCamel(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => {
    if (typeof item === 'object' && item !== null) {
      return convertKeysToCamel(item);
    }
    return item;
  });
  if (obj instanceof Date) return obj.toISOString();
  
  return Object.keys(obj).reduce((acc, key) => {
    const camelKey = snakeToCamel(key);
    let value = obj[key];
    
    if (JSONB_FIELDS.includes(key) && typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (e) {
      }
    }
    
    if (JSONB_FIELDS.includes(key) && Array.isArray(value)) {
      acc[camelKey] = value;
    } else {
      acc[camelKey] = convertKeysToCamel(value);
    }
    return acc;
  }, {});
}

function sanitizeValue(key, value) {
  if (value === '' || value === undefined) {
    return null;
  }
  
  if (POSTGRES_ARRAY_FIELDS.includes(key) && Array.isArray(value)) {
    return value;
  }
  
  if (JSONB_FIELDS.includes(key) && (Array.isArray(value) || typeof value === 'object')) {
    return JSON.stringify(value);
  }
  
  if (typeof value === 'object' && value !== null && !JSONB_FIELDS.includes(key)) {
    return JSON.stringify(value);
  }
  
  return value;
}

function sanitizeData(data) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = sanitizeValue(key, value);
  }
  return sanitized;
}

export function createCrudRouter(tableName, options = {}) {
  const { 
    searchFields = ['name'], 
    defaultSort = '-created_at',
    allowedFilters = []
  } = options;

  return {
    async list(req, res) {
      try {
        const { sort = defaultSort, limit = 10000, offset = 0, search, ...filters } = req.query;
        
        let sql = `SELECT * FROM ${tableName}`;
        const params = [];
        const conditions = [];
        
        if (search && searchFields.length > 0) {
          const searchConditions = searchFields.map((field, i) => {
            params.push(`%${search}%`);
            return `${field} ILIKE $${params.length}`;
          });
          conditions.push(`(${searchConditions.join(' OR ')})`);
        }
        
        const snakeFilters = convertKeysToSnake(filters);
        for (const [key, value] of Object.entries(snakeFilters)) {
          if (allowedFilters.includes(key) || allowedFilters.length === 0) {
            params.push(value);
            conditions.push(`${key} = $${params.length}`);
          }
        }
        
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        const sortField = normalizeFieldName(sort.startsWith('-') ? sort.slice(1) : sort);
        const sortDir = sort.startsWith('-') ? 'DESC' : 'ASC';
        sql += ` ORDER BY ${sortField} ${sortDir}`;
        
        params.push(parseInt(limit));
        sql += ` LIMIT $${params.length}`;
        
        params.push(parseInt(offset));
        sql += ` OFFSET $${params.length}`;
        
        const result = await query(sql, params);
        res.json(result.rows.map(convertKeysToCamel));
      } catch (error) {
        console.error(`Error listing ${tableName}:`, error);
        res.status(500).json({ message: error.message });
      }
    },

    async get(req, res) {
      try {
        const { id } = req.params;
        const result = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
        
        if (result.rows.length === 0) {
          return res.status(404).json({ message: 'Not found' });
        }
        
        res.json(convertKeysToCamel(result.rows[0]));
      } catch (error) {
        console.error(`Error getting ${tableName}:`, error);
        res.status(500).json({ message: error.message });
      }
    },

    async create(req, res) {
      try {
        const rawData = convertKeysToSnake(req.body);
        const data = sanitizeData(rawData);
        const keys = Object.keys(data).filter(k => data[k] !== null);
        const values = keys.map(k => data[k]);
        
        if (keys.length === 0) {
          return res.status(400).json({ message: 'No data provided' });
        }
        
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        
        const result = await query(sql, values);
        res.status(201).json(convertKeysToCamel(result.rows[0]));
      } catch (error) {
        console.error(`Error creating ${tableName}:`, error);
        res.status(500).json({ message: error.message });
      }
    },

    async update(req, res) {
      try {
        const { id } = req.params;
        const rawData = convertKeysToSnake(req.body);
        const data = sanitizeData(rawData);
        const keys = Object.keys(data);
        const values = Object.values(data);
        
        if (keys.length === 0) {
          return res.status(400).json({ message: 'No data provided' });
        }
        
        const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        values.push(id);
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = $${values.length} RETURNING *`;
        
        const result = await query(sql, values);
        
        if (result.rows.length === 0) {
          return res.status(404).json({ message: 'Not found' });
        }
        
        res.json(convertKeysToCamel(result.rows[0]));
      } catch (error) {
        console.error(`Error updating ${tableName}:`, error);
        res.status(500).json({ message: error.message });
      }
    },

    async delete(req, res) {
      try {
        const { id } = req.params;
        const result = await query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING *`, [id]);
        
        if (result.rows.length === 0) {
          return res.status(404).json({ message: 'Not found' });
        }
        
        res.json({ success: true, deleted: convertKeysToCamel(result.rows[0]) });
      } catch (error) {
        console.error(`Error deleting ${tableName}:`, error);
        res.status(500).json({ message: error.message });
      }
    },

    async filter(req, res) {
      try {
        const filters = convertKeysToSnake(req.body);
        const keys = Object.keys(filters);
        const values = Object.values(filters);
        
        let sql = `SELECT * FROM ${tableName}`;
        
        if (keys.length > 0) {
          const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
          sql += ` WHERE ${conditions}`;
        }
        
        sql += ` ORDER BY created_at DESC`;
        
        const result = await query(sql, values);
        res.json(result.rows.map(convertKeysToCamel));
      } catch (error) {
        console.error(`Error filtering ${tableName}:`, error);
        res.status(500).json({ message: error.message });
      }
    }
  };
}
