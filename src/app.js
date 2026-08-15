import express from 'express';
import helmet from 'helmet';
import { clerkMiddleware } from '@clerk/express';
import { pool } from './database/pool.js';
import { UserRepository } from './auth/user.repository.js';
import { createAuthMiddleware } from './auth/auth.middleware.js';
import { RestaurantRepository } from './restaurants/restaurant.repository.js';
import { MenuRepository } from './menu/menu.repository.js';
import { MenuService } from './menu/menu.service.js';
import { createMenuController } from './menu/menu.controller.js';
import { createMenuRouter } from './menu/menu.routes.js';
import { errorHandler, notFoundHandler } from './shared/error-handler.js';
import { createUserController } from './users/user.controller.js';
import { createAdminUserRouter, createUserRouter } from './users/user.routes.js';
import { createClerkWebhookHandler } from './webhooks/clerk.webhook.js';
import { MediaRepository } from './media/media.repository.js';
import { MediaService } from './media/media.service.js';
import { createMediaController } from './media/media.controller.js';
import { createMediaRouter } from './media/media.routes.js';
import { createMediaStorage } from './media/media.storage.js';
import { config } from './config.js';

/** @param {any} [options] */
export function createApp(options = {}) {
  const {
    db = pool, authResolver, clerkAuthMiddleware, webhookVerifier, userRepository,
    restaurantRepository, menuRepository, mediaRepository, mediaStorage, mediaLimits
  } = options;
  const app = express();
  app.use(helmet());
  const users = userRepository || new UserRepository(db);
  const webhook = createClerkWebhookHandler({ users, webhookVerifier });
  app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), webhook);
  app.use(express.json({ limit: '100kb' }));
  app.use(clerkAuthMiddleware || clerkMiddleware());

  const restaurants = restaurantRepository || new RestaurantRepository(db);
  const menus = menuRepository || new MenuRepository(db);
  const service = new MenuService({ menus, restaurants });
  const controller = createMenuController(service);
  const auth = createAuthMiddleware({ users, authResolver });
  const userController = createUserController(users);
  const media = mediaRepository || new MediaRepository(db);
  const storage = mediaStorage || createMediaStorage(config.media);
  const mediaController = createMediaController(new MediaService({ media, menus, restaurants, storage, limits: mediaLimits || config.media }));

  app.use('/api/users', createUserRouter({ auth, controller: userController }));
  app.use('/api/admin/users', createAdminUserRouter({ auth, controller: userController }));
  app.use('/api/menu', createMenuRouter({ auth, controller }));
  app.use('/api/media', createMediaRouter({ auth, controller: mediaController }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
