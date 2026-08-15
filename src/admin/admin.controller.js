const ok = (res, data) => res.json({ success: true, data });
export const createAdminController = (service) => ({
  dashboard: async (_req, res) => ok(res, await service.dashboard()),
  listRestaurants: async (req, res) => { const result = await service.listRestaurants(req.validatedQuery); return res.json({ success: true, ...result }); },
  getRestaurant: async (req, res) => ok(res, await service.getRestaurant(req.params.id)),
  setRestaurantStatus: async (req, res) => ok(res, await service.setRestaurantStatus(req.auth.user.id, req.params.id, req.body.status)),
  listOwners: async (req, res) => { const result = await service.listOwners(req.validatedQuery); return res.json({ success: true, ...result }); },
  getOwner: async (req, res) => ok(res, await service.getOwner(req.params.id)),
  setOwnerStatus: async (req, res) => ok(res, await service.setOwnerStatus(req.auth.user.id, req.params.id, req.body.status)),
  listUsers: async (req, res) => ok(res, await service.listUsers(req.validatedQuery)),
  getUser: async (req, res) => ok(res, await service.getUser(req.params.id)),
  setUserStatus: async (req, res) => ok(res, await service.setUserStatus(req.auth.user.id, req.params.id, req.body.status)),
  setUserRole: async (req, res) => ok(res, await service.setUserRole(req.auth.user.id, req.params.id, req.body.role))
});
