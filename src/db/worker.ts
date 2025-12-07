/**
 * Database Worker
 *
 * This worker runs PGlite (PostgreSQL in WASM) with Drizzle ORM.
 * It handles all database operations off the main thread and supports
 * live queries that automatically notify subscribers when data changes.
 *
 * Communication with the main thread is handled via Comlink, which
 * provides type-safe RPC over postMessage.
 */

import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as Comlink from "comlink";
import * as schema from "./schema";
import { todosTable } from "./schema";

// Store active live query subscriptions for cleanup
const liveSubscriptions = new Map<
  string,
  { unsubscribe: () => Promise<void> }
>();

/**
 * DatabaseWorker class - exposed to main thread via Comlink
 *
 * All methods are async and can be called from the main thread
 * as if they were local functions.
 */
class DatabaseWorker {
  private client: PGlite | null = null;
  private db: ReturnType<typeof drizzle<typeof schema>> | null = null;
  private initialized = false;

  /**
   * Initialize the database
   *
   * Creates PGlite instance with:
   * - IndexedDB persistence (idb:// prefix)
   * - Live query extension for reactive updates
   * - Drizzle ORM for type-safe queries
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Create PGlite with live extension
    // dataDir: 'idb://...' persists to IndexedDB (survives page refresh)
    // Use 'memory://' for ephemeral in-memory database
    this.client = await PGlite.create({
      dataDir: "idb://pg-lite-test-db",
      extensions: { live },
    });

    // Wrap with Drizzle ORM for type-safe queries
    this.db = drizzle(this.client as PGlite, { schema });

    // Run migrations - in production, use a proper migration system
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        description VARCHAR(255) NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT false
      );
    `);

    this.initialized = true;
    console.log("[Worker] Database initialized");
  }

  // ============ CRUD Operations ============
  // These use Drizzle ORM for type-safe queries

  async getAllTodos() {
    if (!this.db) throw new Error("Database not initialized");
    return this.db.select().from(todosTable);
  }

  async addTodo(description: string) {
    if (!this.db) throw new Error("Database not initialized");
    const result = await this.db
      .insert(todosTable)
      .values({ description })
      .returning();
    return result[0];
  }

  async toggleTodo(id: number) {
    if (!this.db) throw new Error("Database not initialized");
    const [todo] = await this.db
      .select()
      .from(todosTable)
      .where(eq(todosTable.id, id));

    if (todo) {
      await this.db
        .update(todosTable)
        .set({ completed: !todo.completed })
        .where(eq(todosTable.id, id));
    }
  }

  async deleteTodo(id: number) {
    if (!this.db) throw new Error("Database not initialized");
    await this.db.delete(todosTable).where(eq(todosTable.id, id));
  }

  // ============ Live Queries ============

  /**
   * Subscribe to live todo updates
   *
   * The callback is called:
   * 1. Immediately with current data
   * 2. Automatically whenever the todos table changes
   *
   * @param callback - Function called with updated todos array
   * @returns Subscription ID for cleanup
   */
  async subscribeTodos(
    callback: (todos: schema.Todo[]) => void,
  ): Promise<string> {
    if (!this.client) throw new Error("Database not initialized");

    const subscriptionId = crypto.randomUUID();

    // Type assertion for live extension (added at runtime)
    const liveClient = this.client as PGlite & {
      live: {
        query: <T>(
          query: string,
          params: unknown[],
          callback: (results: { rows: T[] }) => void,
        ) => Promise<{
          initialResults: { rows: T[] };
          unsubscribe: () => Promise<void>;
        }>;
      };
    };

    // Set up live query - callback fires on every change to todos table
    const liveQuery = await liveClient.live.query<schema.Todo>(
      "SELECT * FROM todos ORDER BY id DESC",
      [],
      (results) => {
        callback(results.rows);
      },
    );

    // Store subscription for cleanup
    liveSubscriptions.set(subscriptionId, {
      unsubscribe: liveQuery.unsubscribe,
    });

    // Send initial results immediately
    callback(liveQuery.initialResults.rows);

    console.log(`[Worker] Live subscription created: ${subscriptionId}`);
    return subscriptionId;
  }

  /**
   * Unsubscribe from a live query
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = liveSubscriptions.get(subscriptionId);
    if (subscription) {
      await subscription.unsubscribe();
      liveSubscriptions.delete(subscriptionId);
      console.log(`[Worker] Unsubscribed: ${subscriptionId}`);
    }
  }

  /**
   * Cleanup all subscriptions (call before worker termination)
   */
  async cleanup(): Promise<void> {
    for (const [id, sub] of liveSubscriptions) {
      await sub.unsubscribe();
      liveSubscriptions.delete(id);
    }
    console.log("[Worker] All subscriptions cleaned up");
  }
}

// Create worker instance and expose via Comlink
const worker = new DatabaseWorker();
Comlink.expose(worker);

// Export type for main thread to use with Comlink.wrap<DbWorker>()
export type DbWorker = typeof worker;
