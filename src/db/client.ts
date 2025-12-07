/**
 * Database Client
 *
 * Base class for database operations using PGlite with multi-tab support.
 * Uses PGliteWorker for automatic leader election across browser tabs.
 *
 * Usage:
 *   import { db } from './db'
 *
 *   // Generic queries
 *   const users = await db.query<User>('SELECT * FROM users')
 *
 *   // Live queries
 *   const unsubscribe = await db.liveQuery<Todo>(
 *     'SELECT * FROM todos',
 *     [],
 *     (todos) => renderTodos(todos)
 *   )
 */

import { PGliteWorker } from "@electric-sql/pglite/worker";
import { live } from "@electric-sql/pglite/live";
import type { PGlite, PGliteInterfaceExtensions } from "@electric-sql/pglite";

// Import worker using Vite's worker syntax
import PGliteWorkerScript from "../workers/pglite.worker?worker";

// Type for PGlite with live extension
type LivePGlite = PGlite & PGliteInterfaceExtensions<{ live: typeof live }>;

// Store active subscriptions for cleanup
const activeSubscriptions = new Map<
  string,
  { unsubscribe: () => Promise<void> }
>();

/**
 * DatabaseClient - Base class for all database operations
 *
 * Handles:
 * - PGliteWorker initialization with multi-tab support
 * - Generic query execution
 * - Live query subscriptions
 */
export class DatabaseClient {
  private pg: LivePGlite | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the database connection
   * Call this before any database operations
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    this.pg = (await PGliteWorker.create(
      new PGliteWorkerScript({ name: "pglite-worker" }),
      {
        dataDir: "idb://pg-lite-db",
        extensions: { live },
      },
    )) as unknown as LivePGlite;

    console.log("[DatabaseClient] Initialized");
  }

  /**
   * Ensure database is ready before operations
   */
  protected async ensureReady(): Promise<LivePGlite> {
    await this.init();
    if (!this.pg) throw new Error("Database not initialized");
    return this.pg;
  }

  /**
   * Get the underlying PGlite connection
   * Use this for advanced operations or custom queries
   */
  get connection(): LivePGlite {
    if (!this.pg) throw new Error("Database not initialized");
    return this.pg;
  }

  /**
   * Execute a query and return typed results
   *
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Array of typed results
   *
   * @example
   * const users = await db.query<User>('SELECT * FROM users WHERE id = $1', [1])
   */
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pg = await this.ensureReady();
    const result = await pg.query<T>(sql, params);
    return result.rows;
  }

  /**
   * Execute a query and return the first result
   *
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns First result or undefined
   */
  async queryOne<T>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE) without returning results
   *
   * @param sql - SQL statement
   * @param params - Statement parameters
   */
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const pg = await this.ensureReady();
    await pg.query(sql, params);
  }

  /**
   * Subscribe to live query updates
   *
   * The callback fires:
   * 1. Immediately with current data
   * 2. Automatically whenever the underlying data changes
   *
   * @param sql - SQL query string
   * @param params - Query parameters
   * @param callback - Function called with updated results
   * @returns Unsubscribe function
   *
   * @example
   * const unsubscribe = await db.liveQuery<Todo>(
   *   'SELECT * FROM todos ORDER BY id DESC',
   *   [],
   *   (todos) => renderTodos(todos)
   * )
   *
   * // Later, to stop listening:
   * await unsubscribe()
   */
  async liveQuery<T>(
    sql: string,
    params: unknown[],
    callback: (rows: T[]) => void,
  ): Promise<() => Promise<void>> {
    const pg = await this.ensureReady();
    const subscriptionId = crypto.randomUUID();

    const liveQuery = await pg.live.query<T>(
      sql,
      params,
      (result: { rows: T[] }) => {
        callback(result.rows);
      },
    );

    // Store for cleanup
    activeSubscriptions.set(subscriptionId, {
      unsubscribe: liveQuery.unsubscribe,
    });

    // Send initial results
    callback(liveQuery.initialResults.rows);

    // Return unsubscribe function
    return async () => {
      const sub = activeSubscriptions.get(subscriptionId);
      if (sub) {
        await sub.unsubscribe();
        activeSubscriptions.delete(subscriptionId);
      }
    };
  }

  /**
   * Cleanup all active subscriptions
   * Call this before page unload
   */
  async cleanup(): Promise<void> {
    for (const [id, sub] of activeSubscriptions) {
      await sub.unsubscribe();
      activeSubscriptions.delete(id);
    }
    console.log("[DatabaseClient] Cleaned up all subscriptions");
  }
}

// Export singleton instance
export const db = new DatabaseClient();
