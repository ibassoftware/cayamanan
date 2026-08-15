// Lazily-created Redis client for platform concerns that need Redis outside Mastra's own
// wiring (src/mastra/index.ts owns a separate client for its server cache — that module
// is a Mastra composition root, not a general-purpose place for the rest of the app to
// import from). Currently used by src/modules/identity/service/rate-limit.ts for login
// rate limiting.
import { createClient, type RedisClientType } from 'redis';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let client: RedisClientType | undefined;

export function getRedis(): RedisClientType {
  if (!client) {
    client = createClient({ url: requireEnv('REDIS_URL') });
    client.on('error', (error: Error) => {
      console.error('[redis] client error:', error.message);
    });
    // Not awaited: node-redis queues commands issued while the socket is still
    // connecting, and awaiting connect() at module load would make anything importing
    // this (including `next build`) depend on Redis being reachable.
    void client.connect().catch((error: Error) => {
      console.error('[redis] initial connection failed:', error.message);
    });
  }
  return client;
}
