import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter — it no longer reads
// DATABASE_URL implicitly from the datasource block at runtime.
//
// The client is created lazily (on first use), not at module load. `next build`
// imports every route module to collect its config, and on a clean CI build
// (e.g. Azure Static Web Apps) the runtime secrets aren't present — so
// throwing at import time would fail the build even though no query runs.
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Next.js dev hot-reload re-executes modules on every save, which would
// otherwise create a new PrismaClient (and a new DB connection pool) each
// time. Stashing it on `globalThis` in development keeps a single instance
// alive across reloads. Production always gets a fresh singleton per process.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = createClient();
  // Cache in every environment: lazily-created, so we only ever build one.
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    // Bind methods (e.g. $transaction, $disconnect) so `this` is the real client.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
