import { PrismaClient } from "@/app/generated/prisma";

// Next.js dev hot-reload re-executes modules on every save, which would
// otherwise create a new PrismaClient (and a new DB connection pool) each
// time. Stashing it on `globalThis` in development keeps a single instance
// alive across reloads. Production always gets a fresh singleton per process.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
