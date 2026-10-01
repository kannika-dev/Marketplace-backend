import jwt from 'jsonwebtoken';

/**
 * Authentication Middleware
 * Validates Bearer JWT token from Authorization header
 */
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'craftiverse_default_secret');
    req.user = decoded; // Contains id, email, role, etc.
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};

/**
 * Role-Based Access Control Middleware (RBAC)
 * Allows access if req.user.role matches one of the specified allowedRoles
 * Default hierarchy: 'admin' has access to admin/seller/buyer routes; 'seller' can access seller/buyer; 'buyer' is base
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. User information missing.'
      });
    }

    const userRole = req.user.role || 'buyer';

    // Admin has superuser privileges across roles
    if (userRole === 'admin') {
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Requires [${allowedRoles.join(', ')}] permissions. Current role: '${userRole}'.`
      });
    }

    next();
  };
};
