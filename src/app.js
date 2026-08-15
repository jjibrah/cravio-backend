import express from 'express';
import helmet from 'helmet';
import { clerkMiddleware } from '@clerk/express';
import { pool } from './database/pool.js';
import { UserRepository } from './auth/user.repository.js';
import { createAuthMiddleware } from './auth/auth.middleware.js';
import { RestaurantRepository } from './restaurant/restaurant.repository.js';
import { RestaurantService } from './restaurant/restaurant.service.js';
import { RestaurantController } from './restaurant/restaurant.controller.js';
import { restaurantRoutes } from './restaurant/restaurant.routes.js';
import { publicRestaurantRoutes } from './restaurant/public.restaurant.routes.js';
import { MenuRepository } from './menu/menu.repository.js';
import { MenuService } from './menu/menu.service.js';
import { createMenuController } from './menu/menu.controller.js';
import { createMenuRouter } from './menu/menu.routes.js';
import { notFoundHandler } from './shared/error-handler.js';
import { createUserController } from './users/user.controller.js';
import { createUserRouter } from './users/user.routes.js';
import { createClerkWebhookHandler } from './webhooks/clerk.webhook.js';
import { MediaRepository } from './media/media.repository.js';
import { MediaService } from './media/media.service.js';
import { createMediaController } from './media/media.controller.js';
import { createMediaRouter, createMediaUploadLimiter } from './media/media.routes.js';
import { createMediaStorage } from './media/media.storage.js';
import { createVideoProcessor } from './media/video.processor.js';
import { config } from './config.js';
import { TableRepository } from './tables/table.repository.js';
import { TableService } from './tables/table.service.js';
import { createTableController } from './tables/table.controller.js';
import { createPublicQrRouter, createTableRouter } from './tables/table.routes.js';
import { createQrService } from './tables/qr.service.js';
import { PublicMenuRepository } from './public-menu/public-menu.repository.js';
import { PublicMenuService } from './public-menu/public-menu.service.js';
import { createPublicMenuController } from './public-menu/public-menu.controller.js';
import { createPublicMenuLimiter, createPublicMenuRouter } from './public-menu/public-menu.routes.js';
import { AdminRepository } from './admin/admin.repository.js';
import { AdminService } from './admin/admin.service.js';
import { createAdminController } from './admin/admin.controller.js';
import { createAdminRouter } from './admin/admin.routes.js';
import { AnalyticsRepository } from './analytics/analytics.repository.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { createAnalyticsController } from './analytics/analytics.controller.js';
import { createAnalyticsLimiters, createAnalyticsRouter, createPublicAnalyticsRouter } from './analytics/analytics.routes.js';
import { requestId, requestLogger } from './core/middleware/request-context.js';
import { cors } from './core/middleware/security.js';
import { createRateLimiter } from './core/middleware/rate-limit.js';
import { createHealthRouter } from './core/health/health.js';
import { logger as defaultLogger } from './core/logging/logger.js';
import { createErrorHandler } from './shared/error-handler.js';

/** @param {any} [options] */
export function createApp(options = {}) {
  const {
    db = pool, authResolver, clerkAuthMiddleware, webhookVerifier, userRepository,
    restaurantRepository, menuRepository, mediaRepository, mediaStorage, mediaLimits, mediaProcessor, mediaUploadLimiter,
    tableRepository, qrService, publicAppUrl, publicMenuRepository, publicMenuLimiter,
    adminRepository, analyticsRepository, analyticsLimiters, appConfig = config, logger = defaultLogger,
    generalLimiter, adminLimiter, healthStorage
  } = options;
  const app = express();
  if (appConfig.trustProxy) app.set('trust proxy', appConfig.trustProxy);
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origins: appConfig.corsOrigins || [], production: appConfig.nodeEnv === 'production' }));
  const users = userRepository || new UserRepository(db);
  const webhook = createClerkWebhookHandler({ users, webhookVerifier });
  app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), webhook);
  app.use(express.json({ limit: appConfig.jsonBodyLimit || '100kb' }));

  const restaurants = restaurantRepository || new RestaurantRepository(db);
  const restaurantController = new RestaurantController(new RestaurantService(restaurants));
  const menus = menuRepository || new MenuRepository(db);
  const service = new MenuService({ menus, restaurants });
  const controller = createMenuController(service);
  const auth = createAuthMiddleware({ users, authResolver });
  const userController = createUserController(users);
  const media = mediaRepository || new MediaRepository(db);
  const storage = mediaStorage || createMediaStorage(appConfig.media);
  const mediaController = createMediaController(new MediaService({ media, menus, restaurants, storage, processor: mediaProcessor || createVideoProcessor(appConfig.media), limits: mediaLimits || appConfig.media }));
  const tables = tableRepository || new TableRepository(db);
  const tableService = new TableService({ tables, restaurants, qr: qrService || createQrService(), publicAppUrl: publicAppUrl || appConfig.publicAppUrl });
  const tableController = createTableController(tableService);
  const publicMenus = publicMenuRepository || new PublicMenuRepository(db);
  const publicMenuController = createPublicMenuController(new PublicMenuService({ publicMenus, tables: tableService }));
  const adminData = adminRepository || new AdminRepository(db);
  const adminController = createAdminController(new AdminService({ admin: adminData, users }));
  const analytics = analyticsRepository || new AnalyticsRepository(db);
  const analyticsController = createAnalyticsController(new AnalyticsService({ analytics, tables: tableService, restaurants }));

  app.use('/health', createHealthRouter({ db, storage: healthStorage || storage, timeoutMs: appConfig.healthTimeoutMs || 2000 }));
  app.use(generalLimiter || createRateLimiter({ limit: appConfig.rateLimits?.general || 600 }));

  // Public diner routes intentionally run before Clerk middleware.
  app.use('/api/public/qr', createPublicQrRouter(tableController));
  app.use('/api/public/menu', createPublicMenuRouter({ controller: publicMenuController, limiter: publicMenuLimiter || createPublicMenuLimiter({ limit: appConfig.rateLimits?.publicMenu || 120 }) }));
  app.use('/api/public/analytics', createPublicAnalyticsRouter({ controller: analyticsController, limits: analyticsLimiters || createAnalyticsLimiters({ sessionLimit: appConfig.rateLimits?.analyticsSessions || 30, eventLimit: appConfig.rateLimits?.analyticsEvents || 300 }) }));
  app.use('/api/public/restaurants', publicRestaurantRoutes(restaurantController));
  app.use(clerkAuthMiddleware || clerkMiddleware());

  app.use('/api/users', createUserRouter({ auth, controller: userController }));
  app.use('/api/admin', adminLimiter || createRateLimiter({ limit: appConfig.rateLimits?.admin || 120 }), createAdminRouter({ auth, controller: adminController }));
  app.use('/api/restaurants', restaurantRoutes(restaurantController, auth));
  app.use('/api/menu', createMenuRouter({ auth, controller }));
  app.use('/api/media', createMediaRouter({ auth, controller: mediaController, uploadLimiter: mediaUploadLimiter || createMediaUploadLimiter({ limit: appConfig.rateLimits?.media || 20 }) }));
  app.use('/api/tables', createTableRouter({ auth, controller: tableController }));
  app.use('/api/analytics', createAnalyticsRouter({ auth, controller: analyticsController }));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
