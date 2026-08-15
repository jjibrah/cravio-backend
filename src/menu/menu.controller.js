const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const createMenuController = (service) => ({
  createCategory: async (req, res) =>
    ok(res, await service.createCategory(req.auth.user.id, req.body), 201),
  listCategories: async (req, res) => ok(res, await service.listCategories(req.auth.user.id)),
  getCategory: async (req, res) =>
    ok(res, await service.getCategory(req.auth.user.id, req.params.id)),
  updateCategory: async (req, res) =>
    ok(res, await service.updateCategory(req.auth.user.id, req.params.id, req.body)),
  deleteCategory: async (req, res) => {
    await service.deleteCategory(req.auth.user.id, req.params.id);
    return res.status(204).send();
  },
  reorderCategories: async (req, res) =>
    ok(res, await service.reorderCategories(req.auth.user.id, req.body.category_ids)),
  createItem: async (req, res) =>
    ok(res, await service.createItem(req.auth.user.id, req.body), 201),
  listItems: async (req, res) =>
    ok(res, await service.listItems(req.auth.user.id, req.validatedQuery)),
  getItem: async (req, res) => ok(res, await service.getItem(req.auth.user.id, req.params.id)),
  updateItem: async (req, res) =>
    ok(res, await service.updateItem(req.auth.user.id, req.params.id, req.body)),
  deleteItem: async (req, res) =>
    ok(res, await service.deleteItem(req.auth.user.id, req.params.id)),
  setAvailability: async (req, res) =>
    ok(res, await service.setAvailability(req.auth.user.id, req.params.id, req.body.is_available)),
  reorderItems: async (req, res) =>
    ok(res, await service.reorderItems(req.auth.user.id, req.body.category_id, req.body.item_ids)),
});
