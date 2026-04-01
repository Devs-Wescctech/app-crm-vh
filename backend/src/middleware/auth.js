import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('WARNING: JWT_SECRET environment variable is not set!');
}

function deriveRoleFromAgentType(agentType, existingRole) {
  if (existingRole) return existingRole;
  if (agentType === 'admin') return 'admin';
  if (agentType === 'supervisor') return 'supervisor';
  return 'agent';
}

export function generateTokens(user) {
  const role = deriveRoleFromAgentType(user.agent_type, user.role);
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Token not provided' });
  }
  
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}
