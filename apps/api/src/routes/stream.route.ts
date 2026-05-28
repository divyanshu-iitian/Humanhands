import type { FastifyInstance } from 'fastify';
import type { EventBus } from '@humanhands/event-system';

/**
 * Server-Sent Events streaming endpoint.
 *
 * Streams WorkflowEvents filtered by sessionId to browser/AI clients.
 * WebSocket upgrade is the planned Step 3 evolution — SSE is production-safe today.
 */
export async function streamRoutes(app: FastifyInstance, eventBus: EventBus): Promise<void> {
  app.get<{ Querystring: { sessionId?: string } }>(
    '/stream/events',
    {
      schema: {
        description: 'SSE stream of WorkflowEvents for a session',
        tags: ['streaming'],
        querystring: {
          type: 'object',
          properties: { sessionId: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { sessionId } = req.query;

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');
      reply.raw.flushHeaders();

      const heartbeatTimer = setInterval(() => {
        if (!reply.raw.destroyed) {
          reply.raw.write(': heartbeat\n\n');
        }
      }, 20000);

      const subscriptionId = eventBus.on('UI_GRAPH_UPDATE' as Parameters<typeof eventBus.on>[0], (event) => {
        if (sessionId && event.sessionId !== sessionId) return;
        if (!reply.raw.destroyed) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

      const actionSubId = eventBus.on('ACTION_COMPLETED' as Parameters<typeof eventBus.on>[0], (event) => {
        if (sessionId && event.sessionId !== sessionId) return;
        if (!reply.raw.destroyed) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

      reply.raw.write(`data: ${JSON.stringify({ type: 'CONNECTED', sessionId, timestamp: Date.now() })}\n\n`);

      req.raw.on('close', () => {
        clearInterval(heartbeatTimer);
        eventBus.off(subscriptionId);
        eventBus.off(actionSubId);
      });

      // Keep connection alive — Fastify won't send reply until stream closes
      await new Promise<void>((resolve) => {
        reply.raw.on('close', resolve);
        reply.raw.on('error', resolve);
      });
    },
  );

  app.get(
    '/stream/status',
    {
      schema: {
        description: 'WebSocket streaming readiness status',
        tags: ['streaming'],
      },
    },
    async (_req, reply) => {
      return reply.code(200).send({
        sse: { endpoint: '/stream/events', status: 'available' },
        websocket: { status: 'planned', note: 'Step 3 roadmap — use SSE for now' },
        eventBusStats: eventBus.stats(),
      });
    },
  );
}
