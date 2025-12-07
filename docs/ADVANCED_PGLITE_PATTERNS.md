# Advanced PGlite Patterns: Live Queries, Workers, and Electron

This document covers advanced patterns for PGlite including live queries, web workers, multi-tab synchronization, Electron integration, and type-safe worker communication with Comlink.

## Table of Contents

1. [Live Queries (Reactive Data)](#live-queries-reactive-data)
2. [Web Workers and Multi-Tab Sync](#web-workers-and-multi-tab-sync)
3. [Electron Integration](#electron-integration)
4. [Type-Safe Workers with Comlink](#type-safe-workers-with-comlink)
5. [Recommended Architecture](#recommended-architecture)

---

## Live Queries (Reactive Data)

PGlite provides a `live` extension that enables reactive queries - your UI automatically updates when underlying data changes.

### Setup

Install and enable the live extension:

```typescript
import { PGlite } from '@electric-sql/pglite'
import { live } from '@electric-sql/pglite/live'

const db = await PGlite.create({
  dataDir: 'idb://my-database',
  extensions: { live },
})
```

### Basic Live Query

Subscribe to query results that auto-update:

```typescript
const liveQuery = await db.live.query(
  'SELECT * FROM todos WHERE completed = false ORDER BY id',
  [],
  (results) => {
    console.log('Updated results:', results.rows)
    // Re-render UI here - this fires automatically on any change
  }
)

// Initial results available immediately
console.log('Initial:', liveQuery.initialResults.rows)

// Clean up when done
await liveQuery.unsubscribe()
```

### Incremental Live Queries (Large Datasets)

For large result sets, use incremental queries that only diff changes:

```typescript
const liveQuery = await db.live.incrementalQuery(
  'SELECT * FROM todos ORDER BY id',
  [],
  'id', // Primary key column for diffing
  (results) => {
    console.log('Efficiently updated:', results.rows)
  }
)
```

### Live Changes API (INSERT/UPDATE/DELETE Events)

Get granular change notifications:

```typescript
const changes = await db.live.changes(
  'SELECT * FROM todos ORDER BY id',
  [],
  'id',
  (changeSet) => {
    for (const change of changeSet) {
      switch (change.__op__) {
        case 'INSERT':
          console.log('New row:', change)
          console.log('Insert after row with id:', change.__after__)
          break
        case 'UPDATE':
          console.log('Updated row:', change.id)
          console.log('Changed columns:', change.__changed_columns__)
          break
        case 'DELETE':
          console.log('Deleted row:', change.id)
          break
      }
    }
  }
)

await changes.unsubscribe()
```

### Windowed Live Queries (Pagination)

For paginated data with live updates:

```typescript
const liveQuery = await db.live.query({
  query: 'SELECT * FROM todos ORDER BY id',
  offset: 0,
  limit: 10,
  callback: (results) => {
    console.log('Current page:', results.rows)
    console.log('Total count:', results.totalCount)
  },
})

// Navigate to page 2
await liveQuery.refresh({ offset: 10, limit: 10 })
```

### Framework Hooks

PGlite provides framework-specific hooks:

**React** (`@electric-sql/pglite-react`):
```typescript
import { useLiveQuery, useLiveIncrementalQuery } from '@electric-sql/pglite-react'

function TodoList() {
  const todos = useLiveQuery(`
    SELECT * FROM todos WHERE completed = $1 ORDER BY id
  `, [false])

  return (
    <ul>
      {todos?.map(todo => <li key={todo.id}>{todo.description}</li>)}
    </ul>
  )
}
```

**Vue** (`@electric-sql/pglite-vue`):
```vue
<script lang="ts">
import { useLiveQuery } from '@electric-sql/pglite-vue'

const todos = useLiveQuery(
  'SELECT * FROM todos ORDER BY id',
  []
)
</script>

<template>
  <li v-for="todo in todos" :key="todo.id">{{ todo.description }}</li>
</template>
```

---

## Web Workers and Multi-Tab Sync

PGlite can run in a Web Worker, enabling:
- Non-blocking database operations
- Automatic multi-tab synchronization (single writer, multiple readers)
- Better performance for heavy queries

### Worker Setup

**Worker file (`src/db/pglite-worker.ts`):**
```typescript
import { PGlite } from '@electric-sql/pglite'
import { worker } from '@electric-sql/pglite/worker'
import { live } from '@electric-sql/pglite/live'

worker({
  async init(options) {
    return new PGlite({
      dataDir: options.dataDir,
      extensions: { live },
    })
  },
})
```

**Main thread (`src/db/client.ts`):**
```typescript
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { live } from '@electric-sql/pglite/live'

// For Vite, use the ?worker import syntax
import PGWorker from './pglite-worker?worker'

export const db = await PGliteWorker.create(
  new PGWorker({ type: 'module', name: 'pglite-worker' }),
  {
    dataDir: 'idb://my-database',
    extensions: { live },
  }
)

// Use exactly like regular PGlite
await db.exec('SELECT * FROM todos')

// Live queries work too
db.live.query('SELECT * FROM todos', [], (results) => {
  console.log('Updated:', results.rows)
})
```

### Multi-Tab Leader Election

PGlite automatically handles multi-tab coordination:

```typescript
db.onLeaderChange(() => {
  if (db.isLeader) {
    console.log('This tab is now the leader (writer)')
    // Only the leader can write to the database
  } else {
    console.log('This tab is a follower (reader)')
  }
})
```

### Vite Configuration for Workers

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es', // Required for PGlite workers
  },
})
```

---

## Electron Integration

PGlite works well with Electron, offering different persistence options for renderer and main processes.

### Renderer Process (Browser-like)

Use IndexedDB persistence (same as web):

```typescript
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite('idb://my-electron-app-db')
```

### Main Process (Node.js)

Use filesystem persistence:

```typescript
import { PGlite } from '@electric-sql/pglite'
import { app } from 'electron'
import path from 'path'

const dbPath = path.join(app.getPath('userData'), 'database')
const db = new PGlite(dbPath)
```

### Recommended Electron Architecture

For best performance and multi-window support:

```
┌─────────────────────────────────────────────────────┐
│                   Main Process                       │
│  ┌───────────────────────────────────────────────┐  │
│  │              PGlite (NodeFS)                  │  │
│  │         ./userData/database/                   │  │
│  └───────────────────────────────────────────────┘  │
│                        │                             │
│                    IPC Bridge                        │
│                        │                             │
└────────────────────────┼────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Renderer 1  │ │  Renderer 2  │ │  Renderer 3  │
│   (Window)   │ │   (Window)   │ │   (Window)   │
└──────────────┘ └──────────────┘ └──────────────┘
```

**Main Process (`main.ts`):**
```typescript
import { PGlite } from '@electric-sql/pglite'
import { ipcMain, app } from 'electron'
import path from 'path'

const dbPath = path.join(app.getPath('userData'), 'pglite-data')
const db = new PGlite(dbPath)

// Expose database operations via IPC
ipcMain.handle('db:query', async (_, sql, params) => {
  return await db.query(sql, params)
})

ipcMain.handle('db:exec', async (_, sql) => {
  return await db.exec(sql)
})
```

**Preload Script (`preload.ts`):**
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('db', {
  query: (sql: string, params?: any[]) => 
    ipcRenderer.invoke('db:query', sql, params),
  exec: (sql: string) => 
    ipcRenderer.invoke('db:exec', sql),
})
```

**Renderer Process:**
```typescript
// Access via window.db
const results = await window.db.query('SELECT * FROM todos')
```

---

## Type-Safe Workers with Comlink

[Comlink](https://github.com/GoogleChromeLabs/comlink) provides type-safe RPC for web workers. It can be combined with PGlite for a cleaner API.

### Why Comlink + PGlite?

- **Type Safety**: Full TypeScript inference across worker boundaries
- **Clean API**: Call worker methods as if they were local async functions
- **Tiny**: Only 1.1kB gzipped

### Setup

```bash
bun add comlink
```

### Worker Implementation

**`src/db/db-worker.ts`:**
```typescript
import { PGlite } from '@electric-sql/pglite'
import { live } from '@electric-sql/pglite/live'
import * as Comlink from 'comlink'

class DatabaseWorker {
  private db: PGlite | null = null

  async init(dataDir: string) {
    this.db = await PGlite.create({
      dataDir,
      extensions: { live },
    })
  }

  async exec(sql: string) {
    if (!this.db) throw new Error('Database not initialized')
    return this.db.exec(sql)
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized')
    const result = await this.db.query<T>(sql, params)
    return result.rows
  }

  async insert<T extends Record<string, any>>(
    table: string, 
    data: T
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    const keys = Object.keys(data)
    const values = Object.values(data)
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
    
    await this.db.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
      values
    )
  }

  // Subscribe to live queries with a callback
  async subscribeLiveQuery(
    sql: string,
    params: any[],
    callback: (rows: any[]) => void
  ): Promise<string> {
    if (!this.db) throw new Error('Database not initialized')
    
    const id = crypto.randomUUID()
    
    await this.db.live.query(sql, params, (results) => {
      callback(results.rows)
    })
    
    return id
  }
}

const dbWorker = new DatabaseWorker()
Comlink.expose(dbWorker)

export type DbWorkerType = typeof dbWorker
```

### Main Thread Client

**`src/db/client.ts`:**
```typescript
import * as Comlink from 'comlink'
import type { DbWorkerType } from './db-worker'

// Vite worker import
import DbWorker from './db-worker?worker'

class DatabaseClient {
  private worker: Comlink.Remote<DbWorkerType>
  private ready: Promise<void>

  constructor() {
    const worker = new DbWorker()
    this.worker = Comlink.wrap<DbWorkerType>(worker)
    this.ready = this.worker.init('idb://my-database')
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    await this.ready
    return this.worker.query<T>(sql, params)
  }

  async exec(sql: string) {
    await this.ready
    return this.worker.exec(sql)
  }

  async insert<T extends Record<string, any>>(table: string, data: T) {
    await this.ready
    return this.worker.insert(table, data)
  }

  async subscribe(
    sql: string,
    params: any[],
    callback: (rows: any[]) => void
  ) {
    await this.ready
    return this.worker.subscribeLiveQuery(
      sql,
      params,
      Comlink.proxy(callback)
    )
  }
}

export const db = new DatabaseClient()
```

### Usage

```typescript
import { db } from './db/client'

// Fully type-safe!
interface Todo {
  id: number
  description: string
  completed: boolean
}

// Query with types
const todos = await db.query<Todo>('SELECT * FROM todos')

// Insert with type checking
await db.insert('todos', { 
  description: 'Learn Comlink', 
  completed: false 
})

// Subscribe to live updates
await db.subscribe(
  'SELECT * FROM todos ORDER BY id',
  [],
  (todos) => {
    console.log('Todos updated:', todos)
    renderTodos(todos)
  }
)
```

### Comlink + Drizzle ORM

For full type safety, combine Comlink with Drizzle:

**`src/db/db-worker.ts`:**
```typescript
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { live } from '@electric-sql/pglite/live'
import * as Comlink from 'comlink'
import * as schema from './schema'
import { eq } from 'drizzle-orm'

class DrizzleWorker {
  private client: PGlite | null = null
  private db: ReturnType<typeof drizzle> | null = null

  async init(dataDir: string) {
    this.client = await PGlite.create({
      dataDir,
      extensions: { live },
    })
    this.db = drizzle({ client: this.client, schema })
  }

  async getAllTodos() {
    if (!this.db) throw new Error('Not initialized')
    return this.db.select().from(schema.todosTable)
  }

  async addTodo(description: string) {
    if (!this.db) throw new Error('Not initialized')
    return this.db.insert(schema.todosTable).values({ description })
  }

  async toggleTodo(id: number) {
    if (!this.db) throw new Error('Not initialized')
    const [todo] = await this.db
      .select()
      .from(schema.todosTable)
      .where(eq(schema.todosTable.id, id))
    
    if (todo) {
      await this.db
        .update(schema.todosTable)
        .set({ completed: !todo.completed })
        .where(eq(schema.todosTable.id, id))
    }
  }

  async deleteTodo(id: number) {
    if (!this.db) throw new Error('Not initialized')
    await this.db.delete(schema.todosTable).where(eq(schema.todosTable.id, id))
  }
}

const worker = new DrizzleWorker()
Comlink.expose(worker)

export type DrizzleWorkerType = typeof worker
```

---

## Recommended Architecture

### For Simple Apps (Browser Only)

```
┌─────────────────────────────────────────┐
│              Main Thread                 │
│  ┌─────────────────────────────────────┐│
│  │    PGlite + live extension          ││
│  │    IndexedDB persistence            ││
│  │    Direct Drizzle ORM queries       ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### For Complex Apps (Multi-Tab, Heavy Queries)

```
┌─────────────────────────────────────────┐
│              Main Thread                 │
│  ┌─────────────────────────────────────┐│
│  │    Comlink Client (Type-Safe RPC)   ││
│  │    Live Query Subscriptions         ││
│  │    UI Rendering                     ││
│  └───────────────┬─────────────────────┘│
└──────────────────┼──────────────────────┘
                   │ postMessage (via Comlink)
┌──────────────────┼──────────────────────┐
│          Web Worker (Shared)            │
│  ┌───────────────┴─────────────────────┐│
│  │    PGlite + live extension          ││
│  │    Drizzle ORM                      ││
│  │    IndexedDB persistence            ││
│  │    Leader election (multi-tab)      ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### For Electron Apps

```
┌─────────────────────────────────────────┐
│              Main Process                │
│  ┌─────────────────────────────────────┐│
│  │    PGlite (NodeFS)                  ││
│  │    Filesystem persistence           ││
│  │    IPC handlers                     ││
│  └───────────────┬─────────────────────┘│
└──────────────────┼──────────────────────┘
                   │ IPC (contextBridge)
┌──────────────────┼──────────────────────┐
│         Renderer Process(es)            │
│  ┌───────────────┴─────────────────────┐│
│  │    Type-safe IPC client             ││
│  │    React/Vue/Vanilla UI             ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

---

## Package Summary

| Package | Purpose |
|---------|---------|
| `@electric-sql/pglite` | Core PGlite database |
| `@electric-sql/pglite/live` | Live query extension |
| `@electric-sql/pglite/worker` | Web Worker support |
| `@electric-sql/pglite-react` | React hooks |
| `@electric-sql/pglite-vue` | Vue composables |
| `drizzle-orm` | Type-safe ORM |
| `drizzle-orm/pglite` | Drizzle PGlite adapter |
| `comlink` | Type-safe worker RPC |

---

## References

- [PGlite Documentation](https://pglite.dev/)
- [PGlite Live Queries](https://pglite.dev/docs/live-queries)
- [PGlite Multi-Tab Worker](https://pglite.dev/docs/multi-tab-worker)
- [Drizzle ORM PGlite](https://orm.drizzle.team/docs/connect-pglite)
- [Comlink](https://github.com/GoogleChromeLabs/comlink)
