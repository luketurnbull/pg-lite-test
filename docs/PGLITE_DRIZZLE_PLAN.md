# PGlite + Drizzle ORM Browser Implementation Plan

This document outlines how to run PGlite (PostgreSQL in WASM) with Drizzle ORM in a Vite browser application.

## Current Setup Analysis

**Packages (from package.json):**
- `@electric-sql/pglite`: ^0.3.14 - WASM PostgreSQL database
- `drizzle-orm`: ^0.45.0 - Type-safe ORM
- `drizzle-kit`: ^0.31.8 - Schema migrations and tooling
- `vite` (via rolldown-vite): ^7.2.5 - Build tool

**Current Issues:**
1. `src/db/client.ts` - calls `drizzle()` with no PGlite instance
2. No Vite configuration for PGlite optimization
3. No persistence configured (data lost on refresh)
4. No migration strategy for browser environment

---

## Implementation Steps

### Step 1: Configure Vite for PGlite

Create or update `vite.config.ts` to exclude PGlite from dependency optimization:

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',  // Required if using multi-tab worker later
  },
})
```

### Step 2: Update Database Client

Update `src/db/client.ts` to properly initialize PGlite with IndexedDB persistence:

```typescript
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from './schema'

// Persist to IndexedDB (survives page refresh)
const client = new PGlite('idb://pg-lite-test-db')

export const db = drizzle({ client, schema })

// Export client for direct access if needed
export { client }
```

**Persistence Options:**
- `new PGlite()` - In-memory only (lost on refresh)
- `new PGlite('idb://my-db')` - IndexedDB persistence (recommended for browser)
- With relaxed durability for better performance:
  ```typescript
  const client = new PGlite({
    dataDir: 'idb://my-db',
    relaxedDurability: true,  // Don't wait for IndexedDB flushes
  })
  ```

### Step 3: Browser Migration Strategy

Drizzle-kit commands (`db:push`, `db:studio`) won't work directly in browser. Options:

**Option A: Runtime Schema Creation (Simplest)**

Create tables on app startup using PGlite's `exec()` method:

```typescript
// src/db/migrate.ts
import { client } from './client'

export async function runMigrations() {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false
    );
  `)
}
```

**Option B: Generate SQL and Bundle**

1. Generate migrations locally: `bun run db:push` (against a local PGlite file)
2. Copy generated SQL to project
3. Run SQL at startup using `client.exec()`

**Option C: Use drizzle-orm-browser (Community Package)**

For more complex apps, consider `drizzle-orm-browser` package for bundling migrations.

### Step 4: Initialize Database on App Load

Update `src/main.ts` to initialize the database:

```typescript
import './style.css'
import { db, client } from './db/client'
import { usersTable } from './db/schema'

async function initApp() {
  // Run migrations
  await client.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false
    );
  `)

  // Now use Drizzle ORM
  const todos = await db.select().from(usersTable)
  console.log('Todos:', todos)

  // Insert example
  await db.insert(usersTable).values({
    description: 'Learn PGlite',
    completed: false,
  })
}

initApp()
```

### Step 5: Fix Schema Naming (Optional)

Your schema has a naming inconsistency - `usersTable` creates a `todos` table:

```typescript
// src/db/schema.ts
import { integer, pgTable, varchar, boolean } from 'drizzle-orm/pg-core'

export const todosTable = pgTable('todos', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  description: varchar('description', { length: 255 }).notNull(),
  completed: boolean().notNull().default(false),
})
```

---

## Optional Enhancements

### Live Queries (Reactive Data)

PGlite supports live queries that auto-update when data changes:

```typescript
import { PGlite } from '@electric-sql/pglite'
import { live } from '@electric-sql/pglite/live'

const client = new PGlite('idb://my-db', {
  extensions: { live },
})

// Subscribe to query results
const { unsubscribe } = client.live.query(
  'SELECT * FROM todos ORDER BY id',
  [],
  (results) => {
    console.log('Updated todos:', results.rows)
    // Re-render UI here
  }
)
```

### React Hooks (if using React)

Install: `@electric-sql/pglite-react`

```typescript
import { useLiveQuery } from '@electric-sql/pglite-react'

function TodoList() {
  const todos = useLiveQuery('SELECT * FROM todos ORDER BY id')
  return (
    <ul>
      {todos?.map(todo => <li key={todo.id}>{todo.description}</li>)}
    </ul>
  )
}
```

### Multi-Tab Support

For apps that need to sync across browser tabs:

```typescript
import { PGliteWorker } from '@electric-sql/pglite/worker'
import PGWorker from './pglite-worker?worker'

const client = new PGliteWorker(
  new PGWorker({ type: 'module' }),
  { dataDir: 'idb://my-db' }
)
```

---

## Updated drizzle.config.ts

For local development/testing with drizzle-kit:

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  schema: './src/db/schema.ts',
  dbCredentials: {
    url: './local-dev-db/',  // Local folder for dev
  },
})
```

Note: This config is for drizzle-kit CLI commands during development, not for the browser runtime.

---

## Summary Checklist

- [ ] Add `vite.config.ts` with PGlite optimization exclusion
- [ ] Update `src/db/client.ts` to create PGlite instance with IndexedDB
- [ ] Create migration/schema initialization code
- [ ] Update `src/main.ts` to initialize database on load
- [ ] (Optional) Fix `usersTable` → `todosTable` naming
- [ ] (Optional) Add live queries for reactive updates
- [ ] (Optional) Add React hooks if using React

## Key Points

1. **PGlite runs entirely in the browser** - no server needed
2. **Use `idb://` prefix** for IndexedDB persistence
3. **Drizzle-kit is for development** - browser migrations need manual SQL or runtime creation
4. **Vite must exclude PGlite** from dependency optimization
5. **Schema is defined in TypeScript** with `drizzle-orm/pg-core`
