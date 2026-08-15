export function slugify(value) {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150).replace(/-+$/g, '');
  return slug || 'restaurant';
}

export const ownerView = (restaurant) => restaurant;

export const publicView = (restaurant) => ({
  name: restaurant.name,
  slug: restaurant.slug,
  description: restaurant.description,
  logo_url: restaurant.logo_url,
  cover_image_url: restaurant.cover_image_url,
  phone: restaurant.phone,
  email: restaurant.email,
  address: restaurant.address,
  city: restaurant.city,
  country: restaurant.country,
  currency: restaurant.currency
});
