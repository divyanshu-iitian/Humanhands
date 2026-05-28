import { buildServer } from './server.js';

const HOST = process.env['HOST'] ?? '0.0.0.0';
const PORT = parseInt(process.env['PORT'] ?? '3000');

async function main(): Promise<void> {
  const app = await buildServer({
    host: HOST,
    port: PORT,
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
  });

  try {
    await app.listen({ host: HOST, port: PORT });
    app.log.info(`HumanHands API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
