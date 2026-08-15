const ok = (res, data) => res.json({ success: true, data });

export function createUserController(users) {
  return {
    me: (req, res) => ok(res, req.auth.user),
    updateMe: async (req, res) => ok(res, await users.updateProfile(req.auth.user.id, req.body)),
  };
}
