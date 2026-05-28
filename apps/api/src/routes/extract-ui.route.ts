import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { chromium } from 'playwright';
import { UIGraphBuilder } from '@humanhands/ui-graph';
import { DomExtractor } from './extract-ui.helper.js';

const ExtractRequestSchema = z.object({
  url: z.string().url(),
  sessionId: z.string().optional(),
  waitForSelector: z.string().optional(),
  timeout: z.number().int().positive().max(60000).default(15000),
});

export async function extractUIRoutes(app: FastifyInstance): Promise<void> {
  const builder = new UIGraphBuilder();

  app.post<{ Body: z.infer<typeof ExtractRequestSchema> }>(
    '/extract-ui',
    {
      schema: {
        description: 'Navigate to a URL and return a structured semantic UI graph',
        tags: ['extraction'],
        body: {
          type: 'object',
          required: ['url'],
        },
      },
    },
    async (req, reply) => {
      const parseResult = ExtractRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          details: parseResult.error.flatten(),
        });
      }

      const { url, sessionId, waitForSelector, timeout } = parseResult.data;
      const resolvedSessionId = sessionId ?? `session_${Date.now().toString(36)}`;

      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();

      try {
        await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });

        if (waitForSelector) {
          await page.locator(waitForSelector).waitFor({ timeout: 5000 }).catch(() => {});
        }

        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

        const rawElements = await page.evaluate(DomExtractor.extractScript, {
          sessionId: resolvedSessionId,
          pageId: `page_${Date.now().toString(36)}`,
        });

        const graph = builder.build({
          sessionId: resolvedSessionId,
          url: page.url(),
          title: await page.title(),
          elements: rawElements,
          viewport: { width: 1280, height: 900 },
        });

        return reply.code(200).send({
          success: true,
          graph: graph.toJSON(),
          stats: {
            totalElements: graph.elementCount,
            interactableElements: graph.interactableCount,
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ error: 'EXTRACTION_FAILED', message: msg });
      } finally {
        await context.close();
        await browser.close();
      }
    },
  );
}
