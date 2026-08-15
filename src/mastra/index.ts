import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { RedisServerCache, nodeRedisPreset, type RedisClient } from '@mastra/redis';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { createClient } from 'redis';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Postgres backs every storage domain (memory, workflows, scores, observability).
const storage = new PostgresStore({
  id: 'mastra-storage',
  connectionString: requireEnv('DATABASE_URL'),
});

// Redis backs Mastra's server cache (stream events / resumable agent streams).
// node-redis queues commands issued while the socket is still connecting, so the
// connect is not awaited here — that keeps module load (and `next build`) from
// depending on Redis being reachable.
const redis = createClient({ url: requireEnv('REDIS_URL') });
redis.on('error', (error: Error) => {
  console.error('[redis] client error:', error.message);
});
void redis.connect().catch((error: Error) => {
  console.error('[redis] initial connection failed:', error.message);
});

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  storage,
  // `nodeRedisPreset` maps the cache's command calls onto node-redis' camelCase
  // API. The cast is needed because @mastra/redis types `RedisClient` against the
  // Upstash-style lowercase surface; the preset covers every divergent command.
  cache: new RedisServerCache({ client: redis as unknown as RedisClient }, nodeRedisPreset),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
