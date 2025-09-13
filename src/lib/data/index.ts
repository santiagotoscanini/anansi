import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import "dotenv/config";

const client = postgres(process.env.DATABASE_URL!, {
  max: 10, // Set maximum pool size
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout after 10 seconds
  prepare: false, // Disable prepared statements for better connection handling
});

export const db = drizzle(client, { schema });
