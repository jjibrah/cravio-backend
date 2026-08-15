import { getAuth } from '@clerk/express';

import { AppError } from '../shared/errors.js';

/** @param {any} [options] */
export function createAuthMiddleware(options = {}) {
  const { users, authResolver = getAuth } = options;
  return async (req, _res, next) => {
    try {
      const auth = authResolver(req);
      if (!auth?.isAuthenticated || !auth.userId) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
      }
      const user = await users.findByClerkId(auth.userId);
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Local user profile not found');
      if (user.status === 'disabled')
        throw new AppError(403, 'ACCOUNT_DISABLED', 'Account is disabled');
      req.auth = { clerkUserId: auth.userId, user };
      next();
    } catch (error) {
      next(
        error instanceof AppError
          ? error
          : new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired authentication token'),
      );
    }
  };
}

export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.auth.user.role)
      ? next()
      : next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));

export const requireActiveAccount = (req, _res, next) => {
  if (req.auth.user.status === 'active') return next();
  const disabled = req.auth.user.status === 'disabled';
  return next(
    new AppError(
      403,
      disabled ? 'ACCOUNT_DISABLED' : 'ACCOUNT_SUSPENDED',
      disabled ? 'Account is disabled' : 'Account is suspended',
    ),
  );
};
