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
import { TableRepository } from './tables/table.repository.js';
import { TableService } from './tables/table.service.js';
import { createTableController } from './tables/table.controller.js';
import { createPublicQrRouter, createTableRouter } from './tables/table.routes.js';
import { createQrService } from './tables/qr.service.js';
import { PublicMenuRepository } from './public-menu/public-menu.repository.js';
import { PublicMenuService } from './public-menu/public-menu.service.js';
import { createPublicMenuController } from './public-menu/public-menu.controller.js';
import { createPublicMenuRouter } from './public-menu/public-menu.routes.js';

/** @param {any} [options] */
export function createApp(options = {}) {
  const {
    db = pool, authResolver, clerkAuthMiddleware, webhookVerifier, userRepository,
    restaurantRepository, menuRepository, mediaRepository, mediaStorage, mediaLimits,
    tableRepository, qrService, publicAppUrl, publicMenuRepository, publicMenuLimiter
  } = options;
  const app = express();
  app.use(helmet());
  const users = userRepository || new UserRepository(db);
  const webhook = createClerkWebhookHandler({ users, webhookVerifier });
  app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), webhook);
  app.use(express.json({ limit: '100kb' }));

  const restaurants = restaurantRepository || new RestaurantRepository(db);
  const menus = menuRepository || new MenuRepository(db);
  const service = new MenuService({ menus, restaurants });
  const controller = createMenuController(service);
  const auth = createAuthMiddleware({ users, authResolver });
  const userController = createUserController(users);
  const media = mediaRepository || new MediaRepository(db);
  const storage = mediaStorage || createMediaStorage(config.media);
  const mediaController = createMediaController(new MediaService({ media, menus, restaurants, storage, limits: mediaLimits || config.media }));
  const tables = tableRepository || new TableRepository(db);
  const tableService = new TableService({ tables, restaurants, qr: qrService || createQrService(), publicAppUrl: publicAppUrl || config.publicAppUrl });
  const tableController = createTableController(tableService);
  const publicMenus = publicMenuRepository || new PublicMenuRepository(db);
  const publicMenuController = createPublicMenuController(new PublicMenuService({ publicMenus, tables: tableService }));

  // Public diner routes intentionally run before Clerk middleware.
  app.use('/api/public/qr', createPublicQrRouter(tableController));
  app.use('/api/public/menu', createPublicMenuRouter({ controller: publicMenuController, limiter: publicMenuLimiter }));
  app.use(clerkAuthMiddleware || clerkMiddleware());

  app.use('/api/users', createUserRouter({ auth, controller: userController }));
  app.use('/api/admin/users', createAdminUserRouter({ auth, controller: userController }));
  app.use('/api/menu', createMenuRouter({ auth, controller }));
  app.use('/api/media', createMediaRouter({ auth, controller: mediaController }));
  app.use('/api/tables', createTableRouter({ auth, controller: tableController }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
