export const createPublicMenuController = (service) => ({
  get: async (req, res) => res.json({ success: true, data: await service.getByQrToken(req.params.qrToken, req.validatedQuery.available || false) })
});
