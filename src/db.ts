import postgres from "postgres";
import { env } from "./whisk.js";

// DATABASE_URL is pooled in transaction mode: no prepared statements across statements.
export const sql = postgres(env("DATABASE_URL"), { prepare: false, max: 5, onnotice: () => {} });
