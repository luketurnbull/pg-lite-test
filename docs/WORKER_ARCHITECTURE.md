# PGlite Worker Architecture

This document explains the worker-based database architecture with the repository pattern.

## Overview

The database runs in a Web Worker with automatic leader election for multi-tab support. Domain logic is organized using the repository pattern.

```
src/
├── workers/
│   └── pglite.worker.ts     # PGlite worker with leader election
├── db/
│   ├── schema.ts            # Drizzle table definitions + types
│   ├── client.ts            # DatabaseClient (base class)
│   ├── index.ts             # Main exports
│   └── repositories/
│       ├── index.ts         # Repository exports
│       └── todos.ts         # TodoRepository
└── main.ts
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Main Thread                                │
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐ │
│  │   main.ts    │────▶│ TodoRepository│────▶│   DatabaseClient    │ │
│  │   (App UI)   │     │   (Domain)   │     │  (Query + LiveQuery) │ │
│  └──────────────┘     └──────────────┘     └──────────┬───────────┘ │
│                                                        │             │
└────────────────────────────────────────────────────────┼─────────────┘
                                                         │
                                                    PGliteWorker
                                                         │
┌────────────────────────────────────────────────────────┼─────────────┐
│                          Web Worker                    │             │
│                                                        ▼             │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    pglite.worker.ts                              │ │
│  │  ┌──────────────────┐    ┌──────────────────────────────────┐   │ │
│  │  │      PGlite      │    │     Leader Election (auto)       │   │ │
│  │  │   + Extensions   │    │  Only one tab runs the database  │   │ │
│  │  └────────┬─────────┘    └──────────────────────────────────┘   │ │
│  └───────────┼─────────────────────────────────────────────────────┘ │
│              │                                                       │
│              ▼                                                       │
│  ┌──────────────────┐                                               │
│  │    IndexedDB     │                                               │
│  │   (Persistent)   │                                               │
│  └──────────────────┘                                               │
└──────────────────────────────────────────────────────────────────────┘
```

## Components

### DatabaseClient (`db/client.ts`)

Base class that handles:
- PGliteWorker initialization with multi-tab leader election
- Generic `query<T>()` and `queryOne<T>()` methods
- Live query subscriptions via `liveQuery<T>()`
- Connection management and cleanup

```typescript
import { db } from './db'

// Initialize once at app start
await db.init()

// Generic queries
const users = await db.query<User>('SELECT * FROM users')
const user = await db.queryOne<User>('SELECT * FROM users WHERE id = $1', [1])

// Live queries
const unsubscribe = await db.liveQuery<Todo>(
  'SELECT * FROM todos ORDER BY id DESC',
  [],
  (todos) => renderTodos(todos)
)
```

### Repositories (`db/repositories/`)

Domain-specific classes that encapsulate entity operations:

```typescript
import { todos } from './db'

// CRUD operations
const allTodos = await todos.getAll()
const newTodo = await todos.add('Learn PGlite')
await todos.toggle(1)
await todos.delete(1)

// Live subscription
const unsubscribe = await todos.subscribe((todoList) => {
  renderTodos(todoList)
})
```

### Worker (`workers/pglite.worker.ts`)

Uses PGlite's built-in `worker()` wrapper for:
- Leader election across browser tabs
- Automatic failover when leader tab closes
- Database initialization and migrations

```typescript
import { PGlite } from '@electric-sql/pglite'
import { live } from '@electric-sql/pglite/live'
import { worker } from '@electric-sql/pglite/worker'

worker({
  async init(options) {
    const pg = await PGlite.create({
      dataDir: options?.dataDir ?? 'idb://my-db',
      extensions: { live },
    })
    
    // Run migrations
    await pg.exec(`CREATE TABLE IF NOT EXISTS ...`)
    
    return pg
  },
})
```

## Adding a New Repository

1. **Define schema** in `db/schema.ts`:

```typescript
export const usersTable = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
})

export type User = typeof usersTable.$inferSelect
```

2. **Create repository** in `db/repositories/users.ts`:

```typescript
import type { DatabaseClient } from '../client'
import type { User } from '../schema'

export class UserRepository {
  private db: DatabaseClient

  constructor(db: DatabaseClient) {
    this.db = db
  }

  async getAll(): Promise<User[]> {
    return this.db.query<User>('SELECT * FROM users ORDER BY name')
  }

  async add(name: string, email: string): Promise<User> {
    const rows = await this.db.query<User>(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    )
    return rows[0]
  }

  async subscribe(callback: (users: User[]) => void) {
    return this.db.liveQuery<User>(
      'SELECT * FROM users ORDER BY name',
      [],
      callback
    )
  }
}
```

3. **Export from index** in `db/repositories/index.ts`:

```typescript
import { db } from '../client'
import { TodoRepository } from './todos'
import { UserRepository } from './users'

export const todos = new TodoRepository(db)
export const users = new UserRepository(db)

export { TodoRepository, UserRepository }
```

4. **Re-export from main** in `db/index.ts`:

```typescript
export { todos, users, TodoRepository, UserRepository } from './repositories'
export type { User } from './schema'
```

5. **Add migration** in `workers/pglite.worker.ts`:

```typescript
await pg.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL
  );
`)
```

## Multi-Tab Behavior

- **Leader Election**: Only one tab runs the actual PGlite database
- **Automatic Proxy**: Other tabs proxy queries through the leader
- **Failover**: When leader closes, a new leader is elected
- **Live Sync**: Changes propagate to all tabs instantly

This is handled automatically by `PGliteWorker` - no manual configuration needed.

## Key Benefits

| Benefit | Description |
|---------|-------------|
| **Separation of Concerns** | Workers in `/workers`, DB logic in `/db` |
| **Repository Pattern** | Domain logic encapsulated in repositories |
| **Type Safety** | Full TypeScript inference throughout |
| **Multi-Tab** | Automatic leader election, no conflicts |
| **Live Queries** | Reactive updates across all tabs |
| **Extensible** | Easy to add new repositories |
