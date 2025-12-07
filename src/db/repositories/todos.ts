/**
 * Todo Repository
 *
 * Domain-specific repository for todo operations.
 * Uses DatabaseClient for all database interactions.
 *
 * Usage:
 *   import { todos } from './db'
 *
 *   // Subscribe to live updates
 *   const unsubscribe = await todos.subscribe(renderTodos)
 *
 *   // CRUD operations
 *   await todos.add('Learn PGlite')
 *   await todos.toggle(1)
 *   await todos.delete(1)
 */

import type { DatabaseClient } from "../client";
import type { Todo } from "../schema";

export class TodoRepository {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Get all todos ordered by id descending (newest first)
   */
  async getAll(): Promise<Todo[]> {
    return this.db.query<Todo>("SELECT * FROM todos ORDER BY id DESC");
  }

  /**
   * Get a single todo by id
   */
  async getById(id: number): Promise<Todo | undefined> {
    return this.db.queryOne<Todo>("SELECT * FROM todos WHERE id = $1", [id]);
  }

  /**
   * Add a new todo
   *
   * @param description - Todo description
   * @returns The created todo
   */
  async add(description: string): Promise<Todo> {
    const rows = await this.db.query<Todo>(
      "INSERT INTO todos (description) VALUES ($1) RETURNING *",
      [description],
    );
    return rows[0];
  }

  /**
   * Toggle a todo's completed status
   *
   * @param id - Todo id
   */
  async toggle(id: number): Promise<void> {
    await this.db.execute(
      "UPDATE todos SET completed = NOT completed WHERE id = $1",
      [id],
    );
  }

  /**
   * Update a todo's description
   *
   * @param id - Todo id
   * @param description - New description
   */
  async update(id: number, description: string): Promise<void> {
    await this.db.execute("UPDATE todos SET description = $1 WHERE id = $2", [
      description,
      id,
    ]);
  }

  /**
   * Delete a todo
   *
   * @param id - Todo id
   */
  async delete(id: number): Promise<void> {
    await this.db.execute("DELETE FROM todos WHERE id = $1", [id]);
  }

  /**
   * Delete all completed todos
   */
  async clearCompleted(): Promise<void> {
    await this.db.execute("DELETE FROM todos WHERE completed = true");
  }

  /**
   * Subscribe to live todo updates
   *
   * The callback fires:
   * 1. Immediately with current todos
   * 2. Automatically whenever any todo changes
   *
   * @param callback - Function called with updated todos
   * @returns Unsubscribe function
   *
   * @example
   * const unsubscribe = await todos.subscribe((todos) => {
   *   renderTodoList(todos)
   * })
   *
   * // Later, to stop listening:
   * await unsubscribe()
   */
  async subscribe(
    callback: (todos: Todo[]) => void,
  ): Promise<() => Promise<void>> {
    return this.db.liveQuery<Todo>(
      "SELECT * FROM todos ORDER BY id DESC",
      [],
      callback,
    );
  }
}
