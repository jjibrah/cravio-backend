const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const createMediaController = (service) => ({
  createVideoUpload: async (req, res) => ok(res, await service.createVideoUpload(req.auth.user.id, req.params.itemId, req.body.mime_type), 201),
  completeVideo: async (req, res) => ok(res, await service.completeVideo(req.auth.user.id, req.params.id, req.body.duration_ms)),
  getForItem: async (req, res) => ok(res, await service.getForItem(req.auth.user.id, req.params.itemId)),
  createThumbnailUpload: async (req, res) => ok(res, await service.createThumbnailUpload(req.auth.user.id, req.params.id, req.body.mime_type), 201),
  completeThumbnail: async (req, res) => ok(res, await service.completeThumbnail(req.auth.user.id, req.params.id)),
  remove: async (req, res) => ok(res, await service.remove(req.auth.user.id, req.params.id))
});
