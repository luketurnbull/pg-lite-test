/**
 * Database Module
 *
 * Main entry point for all database operations.
 *
 * Usage:
 *   import { db, todos, type Todo } from './db'
 *
 *   // Initialize (called once at app start)
 *   await db.init()
 *
 *   // Use repositories for domain operations
 *   const unsubscribe = await todos.subscribe(renderTodos)
 *   await todos.add('Learn PGlite')
 *
 *   // Use db directly for custom queries
 *   const results = await db.query<MyType>('SELECT ...')
 */

// Database client
export { db, DatabaseClient } from "./client";

// Repositories
export { todos, TodoRepository } from "./repositories";

// Types from schema
export type { Todo, NewTodo } from "./schema";
export { todosTable } from "./schema";
