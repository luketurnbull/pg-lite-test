import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Persist to IndexedDB (survives page refresh)
export const client = new PGlite("idb://pg-lite-test-db");

export const db = drizzle({ client, schema });
