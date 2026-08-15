import { AppError, notFound } from '../shared/errors.js';

const categoryNotFound = () => notFound('CATEGORY_NOT_FOUND', 'Category not found');
const itemNotFound = () => notFound('MENU_ITEM_NOT_FOUND', 'Menu item not found');

export class MenuService {
  constructor({ menus, restaurants }) {
    this.menus = menus;
    this.restaurants = restaurants;
  }

  async ownerRestaurant(userId) {
    const restaurant = await this.restaurants.findByOwnerUserId(userId);
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found for this owner');
    return restaurant;
  }

  async createCategory(userId, data) {
    const restaurant = await this.ownerRestaurant(userId);
    try { return await this.menus.createCategory(restaurant.id, data); }
    catch (error) {
      if (error.code === '23505') throw new AppError(409, 'CATEGORY_NAME_EXISTS', 'A category with this name already exists');
      throw error;
    }
  }

  async listCategories(userId) {
    const restaurant = await this.ownerRestaurant(userId);
    return this.menus.listCategories(restaurant.id);
  }

  async getCategory(userId, id) {
    const restaurant = await this.ownerRestaurant(userId);
    const category = await this.menus.findCategory(id, restaurant.id);
    if (!category) throw categoryNotFound();
    return category;
  }

  async updateCategory(userId, id, data) {
    const restaurant = await this.ownerRestaurant(userId);
    try {
      const category = await this.menus.updateCategory(id, restaurant.id, data);
      if (!category) throw categoryNotFound();
      return category;
    } catch (error) {
      if (error.code === '23505') throw new AppError(409, 'CATEGORY_NAME_EXISTS', 'A category with this name already exists');
      throw error;
    }
  }

  async deleteCategory(userId, id) {
    const restaurant = await this.ownerRestaurant(userId);
    if (!await this.menus.findCategory(id, restaurant.id)) throw categoryNotFound();
    if (await this.menus.categoryItemCount(id, restaurant.id)) {
      throw new AppError(409, 'CATEGORY_HAS_ITEMS', 'Category cannot be deleted while it contains menu items');
    }
    await this.menus.deleteCategory(id, restaurant.id);
  }

  async reorderCategories(userId, ids) {
    const restaurant = await this.ownerRestaurant(userId);
    if (!await this.menus.reorderCategories(restaurant.id, ids)) {
      throw new AppError(400, 'INVALID_REORDER', 'Category IDs must exactly match the restaurant categories');
    }
    return this.menus.listCategories(restaurant.id);
  }

  async createItem(userId, data) {
    const restaurant = await this.ownerRestaurant(userId);
    const category = await this.menus.findCategory(data.category_id, restaurant.id);
    if (!category) throw new AppError(400, 'INVALID_CATEGORY', 'Category does not belong to this restaurant');
    return this.menus.createItem(restaurant.id, data);
  }

  async listItems(userId, filters) {
    const restaurant = await this.ownerRestaurant(userId);
    if (filters.category_id && !await this.menus.findCategory(filters.category_id, restaurant.id)) {
      throw new AppError(400, 'INVALID_CATEGORY', 'Category does not belong to this restaurant');
    }
    return this.menus.listItems(restaurant.id, filters);
  }

  async getItem(userId, id) {
    const restaurant = await this.ownerRestaurant(userId);
    const item = await this.menus.findItem(id, restaurant.id);
    if (!item) throw itemNotFound();
    return item;
  }

  async updateItem(userId, id, data) {
    const restaurant = await this.ownerRestaurant(userId);
    if (!await this.menus.findItem(id, restaurant.id)) throw itemNotFound();
    if (data.category_id && !await this.menus.findCategory(data.category_id, restaurant.id)) {
      throw new AppError(400, 'INVALID_CATEGORY', 'Category does not belong to this restaurant');
    }
    const item = await this.menus.updateItem(id, restaurant.id, data);
    if (!item) throw itemNotFound();
    return item;
  }

  async setAvailability(userId, id, isAvailable) {
    return this.updateItem(userId, id, { is_available: isAvailable });
  }

  async deleteItem(userId, id) {
    const restaurant = await this.ownerRestaurant(userId);
    const item = await this.menus.deactivateItem(id, restaurant.id);
    if (!item) throw itemNotFound();
    return item;
  }

  async reorderItems(userId, categoryId, ids) {
    const restaurant = await this.ownerRestaurant(userId);
    if (!await this.menus.findCategory(categoryId, restaurant.id)) {
      throw new AppError(400, 'INVALID_CATEGORY', 'Category does not belong to this restaurant');
    }
    if (!await this.menus.reorderItems(restaurant.id, categoryId, ids)) {
      throw new AppError(400, 'INVALID_REORDER', 'Item IDs must exactly match the items in the specified category');
    }
    return this.menus.listItems(restaurant.id, { category_id: categoryId });
  }

  async getPublicMenu(restaurantId) {
    const restaurant = await this.restaurants.findPublishedById(restaurantId);
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Published restaurant not found');
    const categories = await this.menus.getPublicMenu(restaurant.id);
    return { restaurant: { id: restaurant.id, name: restaurant.name, currency: restaurant.currency }, categories };
  }
}
