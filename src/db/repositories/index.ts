/**
 * Repository Exports
 *
 * Creates and exports all repositories with shared database client.
 *
 * Usage:
 *   import { todos } from './db'
 *   // or
 *   import { todos } from './db/repositories'
 */

import { db } from "../client";
import { TodoRepository } from "./todos";

// Create repository instances with shared database client
export const todos = new TodoRepository(db);

// Re-export classes for custom instantiation
export { TodoRepository } from "./todos";
