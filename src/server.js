import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './core/logging/logger.js';
import { installGracefulShutdown } from './core/runtime/lifecycle.js';
import { closeDatabase, pool, verifyDatabase } from './database/pool.js';

try {
  await verifyDatabase(pool);
  const server = createApp().listen(config.port, () =>
    logger.info('Cravio API listening', { port: config.port, environment: config.nodeEnv }),
  );
  installGracefulShutdown({ server, closeDatabase: () => closeDatabase(pool), logger });
} catch (error) {
  logger.error('Application startup failed', { error: error?.message });
  await closeDatabase(pool).catch(() => {});
  process.exitCode = 1;
}
