import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter — it no longer reads
// DATABASE_URL implicitly from the datasource block at runtime.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const adapter = new PrismaPg({ connectionString });

// Next.js dev hot-reload re-executes modules on every save, which would
// otherwise create a new PrismaClient (and a new DB connection pool) each
// time. Stashing it on `globalThis` in development keeps a single instance
// alive across reloads. Production always gets a fresh singleton per process.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
