export class RestaurantController {
  constructor(service) { this.service = service; }
  create = async (req, res) => res.status(201).json({ success: true, data: await this.service.create(req.auth.user.id, req.body) });
  getMine = async (req, res) => res.json({ success: true, data: await this.service.getMine(req.auth.user.id) });
  updateMine = async (req, res) => res.json({ success: true, data: await this.service.updateMine(req.auth.user.id, req.body) });
  publish = async (req, res) => res.json({ success: true, data: await this.service.publish(req.auth.user.id) });
  unpublish = async (req, res) => res.json({ success: true, data: await this.service.unpublish(req.auth.user.id) });
  getPublic = async (req, res) => res.json({ success: true, data: await this.service.getPublic(req.params.slug) });
}
