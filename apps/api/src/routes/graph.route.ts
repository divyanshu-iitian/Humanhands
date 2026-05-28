import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UIGraphBuilder, UIGraphTraversal } from '@humanhands/ui-graph';
import type { UIGraph } from '@humanhands/shared-types';

const graphStore = new Map<string, UIGraph>();

export function registerGraph(sessionId: string, graph: UIGraph): void {
  graphStore.set(sessionId, graph);
}

export async function graphRoutes(app: FastifyInstance): Promise<void> {
  const builder = new UIGraphBuilder();

  app.post<{ Body: { graph: UIGraph; sessionId: string } }>(
    '/graphs',
    {
      schema: {
        description: 'Ingest a UI graph snapshot from the extension',
        tags: ['graphs'],
      },
    },
    async (req, reply) => {
      const { graph, sessionId } = req.body;
      if (!graph || !sessionId) {
        return reply.code(400).send({ error: 'graph and sessionId are required' });
      }
      registerGraph(sessionId, graph);
      return reply.code(201).send({
        success: true,
        pageId: graph.pageId,
        checksum: graph.checksum,
        elementCount: graph.elements.length,
      });
    },
  );

  app.get<{ Params: { sessionId: string } }>(
    '/graphs/:sessionId',
    {
      schema: {
        description: 'Get the latest graph snapshot for a session',
        tags: ['graphs'],
      },
    },
    async (req, reply) => {
      const graph = graphStore.get(req.params.sessionId);
      if (!graph) return reply.code(404).send({ error: 'No graph found for session' });
      return reply.code(200).send({ success: true, graph });
    },
  );

  app.get<{
    Params: { sessionId: string };
    Querystring: { role?: string; interactableOnly?: string; text?: string };
  }>(
    '/graphs/:sessionId/elements',
    {
      schema: {
        description: 'Query elements from the latest session graph',
        tags: ['graphs'],
      },
    },
    async (req, reply) => {
      const graph = graphStore.get(req.params.sessionId);
      if (!graph) return reply.code(404).send({ error: 'No graph found for session' });

      const { role, interactableOnly, text } = req.query;
      let elements = graph.elements;

      if (role) {
        elements = elements.filter((el) => el.role === role);
      }
      if (interactableOnly === 'true') {
        elements = elements.filter((el) => el.interactable);
      }
      if (text) {
        const needle = text.toLowerCase();
        elements = elements.filter((el) => el.text.toLowerCase().includes(needle));
      }

      return reply.code(200).send({
        success: true,
        count: elements.length,
        elements,
      });
    },
  );

  app.get<{
    Params: { sessionId: string };
    Querystring: { selector: string };
  }>(
    '/graphs/:sessionId/validate-selector',
    {
      schema: {
        description: 'Validate a CSS selector against the stored graph',
        tags: ['graphs'],
      },
    },
    async (req, reply) => {
      const { selector } = req.query;
      if (!selector) return reply.code(400).send({ error: 'selector is required' });

      const graph = graphStore.get(req.params.sessionId);
      if (!graph) return reply.code(404).send({ error: 'No graph found for session' });

      const matching = graph.elements.filter(
        (el) =>
          el.selector.primary === selector ||
          el.selector.fallbacks.includes(selector) ||
          el.selector.dataTestId === selector,
      );

      return reply.code(200).send({
        success: true,
        selector,
        matchCount: matching.length,
        uniqueMatch: matching.length === 1,
        matchedElement: matching.length === 1 ? matching[0] : null,
      });
    },
  );
}
