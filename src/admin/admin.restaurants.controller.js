export class AdminRestaurantsController {
  constructor(service) { this.service = service; }
  list = async (req, res) => res.json({ success: true, data: await this.service.list(req.validatedQuery), pagination: { limit: req.validatedQuery.limit, offset: req.validatedQuery.offset } });
  get = async (req, res) => res.json({ success: true, data: await this.service.getAdmin(req.params.id) });
  setStatus = async (req, res) => res.json({ success: true, data: await this.service.setStatus(req.params.id, req.body.status) });
}
