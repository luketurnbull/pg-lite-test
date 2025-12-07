/**
 * PGlite Multi-Tab Worker
 *
 * Uses PGlite's built-in leader election system for multi-tab support.
 * Only the leader tab runs the actual database, other tabs proxy through.
 */

import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { worker } from "@electric-sql/pglite/worker";

worker({
  async init(options) {
    const pg = await PGlite.create({
      dataDir: options?.dataDir ?? "idb://pg-lite-db",
      extensions: { live },
    });

    // Run migrations
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        description VARCHAR(255) NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT false
      );
    `);

    return pg;
  },
});
