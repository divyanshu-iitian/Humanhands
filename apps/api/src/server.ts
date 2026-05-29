import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { Executor } from '@humanhands/executor';
import { EventBus } from '@humanhands/event-system';
import { healthRoutes } from './routes/health.route.js';
import { executeRoutes } from './routes/execute.route.js';
import { extractUIRoutes } from './routes/extract-ui.route.js';
import { streamRoutes } from './routes/stream.route.js';
import { graphRoutes } from './routes/graph.route.js';
import { workflowRoutes } from './routes/workflow.route.js';

export interface ServerConfig {
  host?: string;
  port?: number;
  logLevel?: string;
}

export async function buildServer(config: ServerConfig = {}) {
  const app = Fastify({
    logger: {
      level: config.logLevel ?? 'info',
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    requestTimeout: 60000,
  });

  // ─── Plugins ───────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  await app.register(sensible);

  // ─── Dependencies ─────────────────────────────────────────────────────────

  const eventBus = new EventBus({
    enableLogging: process.env['NODE_ENV'] !== 'production',
  });

  const executor = new Executor({
    headless: process.env['HEADLESS'] !== 'false',
    defaultTimeout: parseInt(process.env['DEFAULT_TIMEOUT'] ?? '10000'),
    eventBus,
  });

  await executor.init();

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down executor...');
    await executor.shutdown();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  // ─── Routes ───────────────────────────────────────────────────────────────

  await app.register(healthRoutes);
  await app.register(async (instance) => executeRoutes(instance, executor));
  await app.register(extractUIRoutes);
  await app.register(async (instance) => streamRoutes(instance, eventBus));
  await app.register(graphRoutes);
  await app.register(async (instance) => workflowRoutes(instance, executor, eventBus));

  // ─── Error Handler ────────────────────────────────────────────────────────

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500).send({
      error: error.name ?? 'INTERNAL_ERROR',
      message: error.message,
    });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
  });

  return app;
}
