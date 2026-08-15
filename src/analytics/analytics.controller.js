const ok = (res, data) => res.json({ success: true, data });
export const createAnalyticsController = (service) => ({
  createSession: async (req, res) =>
    ok(res.status(201), await service.createSession(req.body.qr_token)),
  event: async (req, res) => {
    await service.record(req.body);
    return res.status(202).json({ success: true });
  },
  overview: async (req, res) =>
    ok(res, await service.overview(req.auth.user.id, req.validatedQuery)),
  items: async (req, res) => ok(res, await service.items(req.auth.user.id, req.validatedQuery)),
  item: async (req, res) =>
    ok(res, await service.item(req.auth.user.id, req.params.id, req.validatedQuery)),
  categories: async (req, res) =>
    ok(res, await service.categories(req.auth.user.id, req.validatedQuery)),
  tables: async (req, res) =>
    ok(res, await service.tableReport(req.auth.user.id, req.validatedQuery)),
});
