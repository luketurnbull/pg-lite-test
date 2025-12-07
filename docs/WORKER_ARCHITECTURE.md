# PGlite + Drizzle + Comlink Worker Architecture

This document explains the worker-based database architecture used in this project, featuring PGlite (in-browser PostgreSQL), Drizzle ORM, and Comlink for type-safe worker communication.

## Overview

The database runs entirely in a Web Worker, keeping the main thread free for UI rendering. Live queries automatically update the UI when data changes - no manual re-rendering required.

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Thread                             │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   main.ts    │───▶│  client.ts   │───▶│   Comlink    │   │
│  │  (UI Logic)  │    │  (API Layer) │    │   (Proxy)    │   │
│  └──────────────┘    └──────────────┘    └──────┬───────┘   │
│                                                  │           │
└──────────────────────────────────────────────────┼───────────┘
                                                   │
                                            postMessage
                                                   │
┌──────────────────────────────────────────────────┼───────────┐
│                      Web Worker                  │           │
│                                                  ▼           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Comlink    │───▶│  worker.ts   │───▶│   PGlite     │   │
│  │  (Expose)    │    │  (DB Logic)  │    │  + Drizzle   │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                  │           │
│                                                  ▼           │
│                                          ┌──────────────┐   │
│                                          │  IndexedDB   │   │
│                                          │ (Persistent) │   │
│                                          └──────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/db/
├── schema.ts   # Drizzle table definitions + TypeScript types
├── worker.ts   # Web Worker: PGlite + Drizzle + live queries
└── client.ts   # Main thread: Comlink wrapper with type-safe API
```

## How It Works

### 1. Schema Definition (`schema.ts`)

Define your tables using Drizzle's type-safe schema builder:

```typescript
import { integer, pgTable, varchar, boolean } from 'drizzle-orm/pg-core'

export const todosTable = pgTable('todos', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  description: varchar('description', { length: 255 }).notNull(),
  completed: boolean().notNull().default(false),
})

// Infer TypeScript types from the table
export type Todo = typeof todosTable.$inferSelect
export type NewTodo = typeof todosTable.$inferInsert
```

### 2. Worker (`worker.ts`)

The worker initializes PGlite with the live extension and exposes methods via Comlink:

```typescript
import { PGlite } from '@electric-sql/pglite'
import { live } from '@electric-sql/pglite/live'
import { drizzle } from 'drizzle-orm/pglite'
import * as Comlink from 'comlink'

class DatabaseWorker {
  private client: PGlite | null = null
  private db: ReturnType<typeof drizzle> | null = null

  async init() {
    // Create PGlite with live extension and IndexedDB persistence
    this.client = await PGlite.create({
      dataDir: 'idb://my-database',
      extensions: { live },
    })
    
    this.db = drizzle(this.client, { schema })
    
    // Run migrations
    await this.client.exec(`CREATE TABLE IF NOT EXISTS ...`)
  }

  // CRUD operations using Drizzle
  async getAllTodos() {
    return this.db.select().from(todosTable)
  }

  async addTodo(description: string) {
    return this.db.insert(todosTable).values({ description }).returning()
  }

  // Live query subscription
  async subscribeTodos(callback: (todos: Todo[]) => void) {
    const liveQuery = await this.client.live.query(
      'SELECT * FROM todos ORDER BY id DESC',
      [],
      (results) => callback(results.rows)
    )
    
    // Return initial results immediately
    callback(liveQuery.initialResults.rows)
    
    return subscriptionId // For cleanup
  }
}

Comlink.expose(new DatabaseWorker())
```

### 3. Client (`client.ts`)

The client wraps the worker with Comlink, providing a clean async API:

```typescript
import * as Comlink from 'comlink'
import type { DbWorker } from './worker'
import DbWorkerModule from './worker?worker'  // Vite worker import

class DatabaseClient {
  private worker: Comlink.Remote<DbWorker>
  private initPromise: Promise<void>

  constructor() {
    const rawWorker = new DbWorkerModule()
    this.worker = Comlink.wrap<DbWorker>(rawWorker)
    this.initPromise = this.worker.init()
  }

  async getAllTodos() {
    await this.initPromise
    return this.worker.getAllTodos()
  }

  async subscribe(callback: (todos: Todo[]) => void) {
    await this.initPromise
    
    // Comlink.proxy allows callbacks to work across worker boundary
    const subscriptionId = await this.worker.subscribeTodos(
      Comlink.proxy(callback)
    )
    
    // Return unsubscribe function
    return () => this.worker.unsubscribe(subscriptionId)
  }
}

export const db = new DatabaseClient()
```

### 4. Usage in Main Thread (`main.ts`)

```typescript
import { db, type Todo } from './db/client'

async function initApp() {
  // Subscribe to live updates - callback fires automatically on changes
  const unsubscribe = await db.subscribe((todos: Todo[]) => {
    renderTodos(todos)  // Re-render UI with new data
  })

  // CRUD operations - no manual re-render needed!
  await db.addTodo('Learn PGlite')     // UI updates automatically
  await db.toggleTodo(1)                // UI updates automatically
  await db.deleteTodo(1)                // UI updates automatically

  // Cleanup on page unload
  window.addEventListener('beforeunload', unsubscribe)
}
```

## Key Concepts

### Live Queries

PGlite's live extension watches for changes to the underlying tables and re-runs the query automatically:

```typescript
const liveQuery = await client.live.query(
  'SELECT * FROM todos',
  [],
  (results) => {
    // This callback fires EVERY TIME the todos table changes
    console.log('Data updated:', results.rows)
  }
)

// Initial results available immediately
console.log('Initial:', liveQuery.initialResults.rows)

// Stop listening
await liveQuery.unsubscribe()
```

### Comlink Proxies

Comlink normally can't send functions across the worker boundary. Use `Comlink.proxy()` to wrap callbacks:

```typescript
// Main thread
await worker.subscribe(Comlink.proxy((data) => {
  console.log('Received:', data)
}))

// Worker
async subscribe(callback: (data: any) => void) {
  // callback works even though it was defined in main thread!
  callback({ message: 'Hello from worker' })
}
```

### Type Safety

The worker exports its type, which the client uses for full TypeScript inference:

```typescript
// worker.ts
export type DbWorker = typeof worker

// client.ts
import type { DbWorker } from './worker'
const worker = Comlink.wrap<DbWorker>(rawWorker)

// Full autocomplete and type checking!
const todos = await worker.getAllTodos()  // Todo[]
```

## Vite Configuration

Workers require specific Vite config:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],  // Required for PGlite
  },
  worker: {
    format: 'es',  // Required for ES module workers
  },
})
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **Non-blocking** | Database operations don't freeze the UI |
| **Type-safe** | Full TypeScript inference across worker boundary |
| **Reactive** | Live queries auto-update UI on data changes |
| **Persistent** | IndexedDB storage survives page refreshes |
| **SQL Power** | Full PostgreSQL in the browser via PGlite |

## Debugging

Open browser DevTools and look for:

- **Console logs** prefixed with `[Worker]` for worker activity
- **Application > IndexedDB** to inspect stored data
- **Sources > worker.ts** to debug worker code

## Common Patterns

### Error Handling

```typescript
// client.ts
async addTodo(description: string) {
  try {
    await this.ensureReady()
    return await this.worker.addTodo(description)
  } catch (error) {
    console.error('Failed to add todo:', error)
    throw error
  }
}
```

### Multiple Subscriptions

```typescript
// Subscribe to different queries
const unsubTodos = await db.subscribeTodos(renderTodos)
const unsubUsers = await db.subscribeUsers(renderUsers)

// Cleanup all
window.addEventListener('beforeunload', () => {
  unsubTodos()
  unsubUsers()
})
```

### Optimistic Updates

```typescript
async function addTodo(description: string) {
  // Optimistically update UI
  const tempTodo = { id: -1, description, completed: false }
  setTodos(prev => [tempTodo, ...prev])
  
  try {
    await db.addTodo(description)
    // Live query will replace temp with real data
  } catch (error) {
    // Revert on failure
    setTodos(prev => prev.filter(t => t.id !== -1))
  }
}
```

## Next Steps

- Add more tables and relationships
- Implement Electric SQL sync for server synchronization
- Add offline queue for operations when offline
- Explore SharedWorker for multi-tab support
