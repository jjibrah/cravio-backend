const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const createTableController = (service) => ({
  create: async (req, res) => ok(res, await service.create(req.auth.user.id, req.body), 201),
  bulkCreate: async (req, res) => ok(res, await service.bulkCreate(req.auth.user.id, req.body), 201),
  list: async (req, res) => ok(res, await service.list(req.auth.user.id)),
  get: async (req, res) => ok(res, await service.get(req.auth.user.id, req.params.id)),
  update: async (req, res) => ok(res, await service.update(req.auth.user.id, req.params.id, req.body)),
  deactivate: async (req, res) => ok(res, await service.deactivate(req.auth.user.id, req.params.id)),
  regenerate: async (req, res) => ok(res, await service.regenerate(req.auth.user.id, req.params.id)),
  qr: async (req, res) => { const result = await service.renderQr(req.auth.user.id, req.params.id, req.validatedQuery.format); return res.type(result.contentType).set('Content-Disposition', `attachment; filename="${result.table.code}.${req.validatedQuery.format}"`).send(result.body); },
  printOne: async (req, res) => res.type('html').send(await service.printOne(req.auth.user.id, req.params.id)),
  printAll: async (req, res) => res.type('html').send(await service.printAll(req.auth.user.id)),
  resolve: async (req, res) => ok(res, await service.resolveQrToken(req.params.token))
});
