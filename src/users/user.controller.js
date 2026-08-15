import { notFound } from '../shared/errors.js';

const ok = (res, data) => res.json({ success: true, data });

export function createUserController(users) {
  return {
    me: (req, res) => ok(res, req.auth.user),
    updateMe: async (req, res) => ok(res, await users.updateProfile(req.auth.user.id, req.body)),
    list: async (req, res) => {
      const { page, limit } = req.validatedQuery;
      const result = await users.list({ limit, offset: (page - 1) * limit });
      return ok(res, { ...result, page, limit });
    },
    get: async (req, res) => {
      const user = await users.findById(req.params.id);
      if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
      return ok(res, user);
    },
    setStatus: async (req, res) => {
      const user = await users.setStatus(req.params.id, req.body.status);
      if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
      return ok(res, user);
    },
    setRole: async (req, res) => {
      const user = await users.setRole(req.params.id, req.body.role);
      if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
      return ok(res, user);
    }
  };
}
