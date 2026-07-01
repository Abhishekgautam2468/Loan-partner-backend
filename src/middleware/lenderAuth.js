import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/asyncHandler.js';

// Verifies a lender-scoped JWT (issued by /lender/verify-code) and attaches req.lender.
// Application-id matching is enforced in the controllers.
export function requireLenderToken(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required');
    const payload = verifyToken(token);
    if (payload.scope !== 'lender') throw new ApiError(401, 'Authentication required');
    req.lender = payload;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Invalid or expired token'));
    }
    next(err);
  }
}
