/**
 * Database Schema
 *
 * Defines tables using Drizzle ORM's type-safe schema builder.
 * These definitions are used both for:
 * 1. Type inference (Todo, NewTodo types)
 * 2. Query building (db.select().from(todosTable))
 *
 * Note: Actual table creation happens in worker.ts via raw SQL.
 * In production, use Drizzle Kit migrations for schema changes.
 */

import { integer, pgTable, varchar, boolean } from "drizzle-orm/pg-core";

/**
 * Todos table
 *
 * Uses PostgreSQL features:
 * - GENERATED ALWAYS AS IDENTITY for auto-incrementing IDs
 * - VARCHAR with length constraint
 * - BOOLEAN with default value
 */
export const todosTable = pgTable("todos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  description: varchar("description", { length: 255 }).notNull(),
  completed: boolean().notNull().default(false),
});

/**
 * Inferred Types
 *
 * $inferSelect - Type of a row returned from SELECT
 * $inferInsert - Type for INSERT (id is optional since it's auto-generated)
 */
export type Todo = typeof todosTable.$inferSelect;
export type NewTodo = typeof todosTable.$inferInsert;
