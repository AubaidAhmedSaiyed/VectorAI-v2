const jwt = require('jsonwebtoken');

const JWT_SECRET =
  process.env.JWT_SECRET || 'vectorai-dev-secret-change-in-production';

const authDisabled =
  process.env.AUTH_DISABLED === '1' || process.env.AUTH_DISABLED === 'true';

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function requireAuth(req, res, next) {
  if (authDisabled) return next();
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/** Attach req.user when a valid Bearer token is present; never 401. */
function optionalAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return next();
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
  } catch {
    // ignore invalid token for optional path
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (authDisabled) return next();
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin role required' });
  }
  return next();
}

module.exports = {
  JWT_SECRET,
  signToken,
  requireAuth,
  optionalAuth,
  requireAdmin,
  authDisabled,
};
