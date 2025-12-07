/**
 * Database Client
 *
 * This is the main thread interface to the database worker.
 * It wraps the worker with Comlink to provide a type-safe async API.
 *
 * Usage:
 *   import { db } from './db/client'
 *
 *   // CRUD operations
 *   const todos = await db.getAllTodos()
 *   await db.addTodo('Learn PGlite')
 *
 *   // Live queries - callback fires on every change
 *   const unsubscribe = await db.subscribe((todos) => {
 *     renderTodos(todos)
 *   })
 */

import * as Comlink from "comlink";
import type { DbWorker } from "./worker";
import type { Todo } from "./schema";

// Import worker using Vite's worker syntax
// The ?worker suffix tells Vite to bundle this as a Web Worker
import DbWorkerModule from "./worker?worker";

class DatabaseClient {
  private worker: Comlink.Remote<DbWorker>;
  private initPromise: Promise<void>;
  private subscriptionId: string | null = null;

  constructor() {
    // Create the worker and wrap with Comlink for type-safe RPC
    const rawWorker = new DbWorkerModule();
    this.worker = Comlink.wrap<DbWorker>(rawWorker);

    // Start initialization immediately
    this.initPromise = this.worker.init();
  }

  /**
   * Wait for database to be ready before operations
   */
  private async ensureReady(): Promise<void> {
    await this.initPromise;
  }

  // ============ CRUD Operations ============

  async getAllTodos(): Promise<Todo[]> {
    await this.ensureReady();
    return this.worker.getAllTodos();
  }

  async addTodo(description: string): Promise<Todo> {
    await this.ensureReady();
    return this.worker.addTodo(description);
  }

  async toggleTodo(id: number): Promise<void> {
    await this.ensureReady();
    return this.worker.toggleTodo(id);
  }

  async deleteTodo(id: number): Promise<void> {
    await this.ensureReady();
    return this.worker.deleteTodo(id);
  }

  // ============ Live Queries ============

  /**
   * Subscribe to live todo updates
   *
   * The callback fires:
   * 1. Immediately with current data
   * 2. Automatically whenever any todo changes
   *
   * @param callback - Function called with updated todos
   * @returns Unsubscribe function - call to stop listening
   *
   * @example
   * const unsubscribe = await db.subscribe((todos) => {
   *   console.log('Todos updated:', todos)
   *   renderTodoList(todos)
   * })
   *
   * // Later, to stop listening:
   * unsubscribe()
   */
  async subscribe(callback: (todos: Todo[]) => void): Promise<() => void> {
    await this.ensureReady();

    // Comlink.proxy() wraps the callback so it can be called from the worker
    // Without this, functions can't cross the worker boundary
    this.subscriptionId = await this.worker.subscribeTodos(
      Comlink.proxy(callback),
    );

    // Return unsubscribe function
    return async () => {
      if (this.subscriptionId) {
        await this.worker.unsubscribe(this.subscriptionId);
        this.subscriptionId = null;
      }
    };
  }

  /**
   * Cleanup all subscriptions
   * Call this before the page unloads
   */
  async cleanup(): Promise<void> {
    await this.worker.cleanup();
  }
}

// Export singleton instance
// The worker is created once and shared across the app
export const db = new DatabaseClient();

// Re-export types for convenience
export type { Todo } from "./schema";
