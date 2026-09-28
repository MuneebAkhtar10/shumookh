import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }

  return new PrismaClient({
    // The adapter ignores `connection_limit` in the URL, so cap the pool here:
    // Supabase's pooler only has a handful of backend slots, and an uncapped
    // pool per dev-server/serverless instance can crowd them out.
    adapter: new PrismaPg({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      connectionTimeoutMillis: 20_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    }),
  });
}

// Reuse the client across hot reloads in dev so we don't exhaust the pool.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
