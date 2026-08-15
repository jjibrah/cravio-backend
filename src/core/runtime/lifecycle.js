import { clearTimeout, setTimeout } from 'node:timers';

/** @param {{server: any, closeDatabase: () => Promise<void>, logger: any, timeoutMs?: number, processRef?: any}} options */
export function installGracefulShutdown({
  server,
  closeDatabase,
  logger,
  timeoutMs = 10_000,
  processRef = process,
}) {
  let stopping = false;
  const shutdown = async (signal, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    logger.info('Server shutdown started', { signal });
    const fallback = setTimeout(() => {
      logger.error('Graceful shutdown timed out');
      processRef.exit(1);
    }, timeoutMs);
    fallback.unref?.();
    try {
      await new Promise((resolve) => server.close(resolve));
      await closeDatabase();
      clearTimeout(fallback);
      logger.info('Server shutdown completed');
      processRef.exit(exitCode);
    } catch (error) {
      clearTimeout(fallback);
      logger.error('Server shutdown failed', { error: error?.message });
      processRef.exit(1);
    }
  };
  processRef.once('SIGTERM', () => shutdown('SIGTERM'));
  processRef.once('SIGINT', () => shutdown('SIGINT'));
  processRef.once('unhandledRejection', (error) => {
    logger.error('Unhandled rejection', {
      error: error instanceof Error ? error.message : String(error),
    });
    shutdown('unhandledRejection', 1);
  });
  processRef.once('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error instanceof Error ? error.message : String(error),
    });
    shutdown('uncaughtException', 1);
  });
  return shutdown;
}
