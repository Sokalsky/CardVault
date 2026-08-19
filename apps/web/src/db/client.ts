import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let cached: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (cached) return cached;
  const client = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
  cached = drizzle(client);
  return cached;
}
