import { integer, pgTable, varchar, boolean } from "drizzle-orm/pg-core";

export const todosTable = pgTable("todos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  description: varchar("description", { length: 255 }).notNull(),
  completed: boolean().notNull().default(false),
});
