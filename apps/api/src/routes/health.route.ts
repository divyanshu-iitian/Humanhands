import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.code(200).send({
      status: 'ok',
      version: process.env['npm_package_version'] ?? '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get('/health/ready', async (_req, reply) => {
    // Extend this with real readiness checks (DB, dependencies) as the system grows
    return reply.code(200).send({ ready: true });
  });
}
