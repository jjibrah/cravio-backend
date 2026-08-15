import { AppError } from '../shared/errors.js';
import { publicView, slugify } from './restaurant.utils.js';

const missing = () => new AppError(404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found');
const assertOperable = (restaurant) => {
  if (restaurant.status === 'suspended')
    throw new AppError(403, 'RESTAURANT_SUSPENDED', 'Restaurant is suspended');
  if (restaurant.status === 'disabled')
    throw new AppError(403, 'RESTAURANT_DISABLED', 'Restaurant is disabled');
};

export class RestaurantService {
  constructor(repository) {
    this.repository = repository;
  }
  async create(ownerId, data) {
    if (await this.repository.findByOwnerId(ownerId))
      throw new AppError(409, 'RESTAURANT_ALREADY_EXISTS', 'Owner already has a restaurant');
    const base = slugify(data.name);
    for (let suffix = 1; suffix <= 100; suffix += 1) {
      const slug = suffix === 1 ? base : `${base}-${suffix}`;
      try {
        return await this.repository.create(ownerId, slug, data);
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'restaurants_slug_key') continue;
        if (error.code === '23505' && error.constraint === 'restaurants_owner_id_key')
          throw new AppError(409, 'RESTAURANT_ALREADY_EXISTS', 'Owner already has a restaurant');
        throw error;
      }
    }
    throw new AppError(409, 'SLUG_CONFLICT', 'Could not generate a unique restaurant slug');
  }
  async getMine(ownerId) {
    return (await this.repository.findByOwnerId(ownerId)) || Promise.reject(missing());
  }
  async updateMine(ownerId, data) {
    const restaurant = await this.getMine(ownerId);
    assertOperable(restaurant);
    return this.repository.update(restaurant.id, data);
  }
  async publish(ownerId) {
    const restaurant = await this.getMine(ownerId);
    assertOperable(restaurant);
    for (const field of [
      'name',
      'description',
      'phone',
      'email',
      'address',
      'city',
      'country',
      'currency',
    ]) {
      if (!restaurant[field])
        throw new AppError(
          422,
          'INVALID_RESTAURANT_DATA',
          `Restaurant profile is incomplete: ${field}`,
        );
    }
    const readiness = await this.repository.publicationReadiness(restaurant.id);
    if (!readiness.has_category || !readiness.has_item)
      throw new AppError(
        422,
        'RESTAURANT_MENU_INCOMPLETE',
        'Restaurant needs an active category and an available active menu item before publication',
      );
    return this.repository.publish(restaurant.id);
  }
  async unpublish(ownerId) {
    const restaurant = await this.getMine(ownerId);
    assertOperable(restaurant);
    return this.repository.unpublish(restaurant.id);
  }
  async getPublic(slug) {
    const restaurant = await this.repository.findPublicBySlug(slug);
    if (!restaurant)
      throw new AppError(404, 'RESTAURANT_NOT_PUBLISHED', 'Restaurant is not available');
    return publicView(restaurant);
  }
  async list(query) {
    return this.repository.list(query);
  }
  async getAdmin(id) {
    return (await this.repository.findById(id)) || Promise.reject(missing());
  }
  async setStatus(id, status) {
    const restaurant = await this.repository.setStatus(id, status);
    if (!restaurant) throw missing();
    return restaurant;
  }
}
