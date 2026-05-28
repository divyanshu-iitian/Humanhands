import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ActionRequestSchema } from '@humanhands/shared-types';
import type { Executor } from '@humanhands/executor';

export async function executeRoutes(app: FastifyInstance, executor: Executor): Promise<void> {
  app.post<{ Body: z.infer<typeof ActionRequestSchema> }>(
    '/execute',
    {
      schema: {
        description: 'Execute a deterministic browser action in a session',
        tags: ['execution'],
        body: {
          type: 'object',
          required: ['id', 'sessionId', 'type', 'createdAt'],
        },
      },
    },
    async (req, reply) => {
      const parseResult = ActionRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid action request',
          details: parseResult.error.flatten(),
        });
      }

      const actionResult = await executor.execute(parseResult.data);

      const statusCode = actionResult.success ? 200 : 422;
      return reply.code(statusCode).send({
        success: actionResult.success,
        result: actionResult,
      });
    },
  );

  app.post<{ Body: { headless?: boolean } }>(
    '/sessions',
    {
      schema: {
        description: 'Create a new browser session',
        tags: ['sessions'],
      },
    },
    async (_req, reply) => {
      const sessionId = await executor.createSession();
      return reply.code(201).send({ sessionId });
    },
  );

  app.delete<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId',
    {
      schema: {
        description: 'Close a browser session',
        tags: ['sessions'],
      },
    },
    async (req, reply) => {
      await executor.closeSession(req.params.sessionId);
      return reply.code(204).send();
    },
  );
}
