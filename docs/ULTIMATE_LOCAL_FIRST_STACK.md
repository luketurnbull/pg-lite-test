# Ultimate Local-First Stack: Native Performance in the Browser

A comprehensive architecture for building high-performance, local-first applications that work seamlessly across browser and Electron with real-time sync, GPU acceleration, and type-safe everything.

## Table of Contents

1. [Stack Overview](#stack-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Core Technologies](#core-technologies)
4. [Sync Engine (Electric SQL)](#sync-engine-electric-sql)
5. [Backend (Bun + Hono/Elysia)](#backend-bun--honoelysia)
6. [Authentication (Better Auth)](#authentication-better-auth)
7. [GPU Acceleration (TypeGPU)](#gpu-acceleration-typegpu)
8. [Worker Architecture (OffscreenCanvas + Comlink)](#worker-architecture-offscreencanvas--comlink)
9. [Cross-Platform Code Sharing](#cross-platform-code-sharing)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Stack Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Browser/Electron)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │    React    │  │   TypeGPU   │  │OffscreenCanvas│ │     Drizzle ORM    │ │
│  │  (or Vue)   │  │   WebGPU    │  │   Workers   │  │     + PGlite       │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                │                     │           │
│         └────────────────┴────────────────┴─────────────────────┘           │
│                                    │                                         │
│                            ┌───────┴───────┐                                │
│                            │    Comlink    │                                │
│                            │  (Type-Safe)  │                                │
│                            └───────┬───────┘                                │
│                                    │                                         │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐  │
│  │                         Web Worker (Shared)                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐   │  │
│  │  │   PGlite     │  │ Electric Sync│  │   GPU Compute (TypeGPU)    │   │  │
│  │  │  + Drizzle   │  │    Client    │  │   + OffscreenCanvas        │   │  │
│  │  │  (IndexedDB) │  │              │  │                            │   │  │
│  │  └──────────────┘  └──────┬───────┘  └────────────────────────────┘   │  │
│  └───────────────────────────┼───────────────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                        WebSocket / HTTP
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                           BACKEND (Bun)                                      │
├──────────────────────────────┼──────────────────────────────────────────────┤
│  ┌───────────────────────────┴───────────────────────────────────────────┐  │
│  │                     Hono / Elysia (API Server)                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐   │  │
│  │  │ Better Auth  │  │  WebSocket   │  │      REST / tRPC API       │   │  │
│  │  │   (Auth)     │  │   Handler    │  │                            │   │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────────────┘   │  │
│  └───────────────────────────┬───────────────────────────────────────────┘  │
│                              │                                               │
│  ┌───────────────────────────┴───────────────────────────────────────────┐  │
│  │                         Drizzle ORM                                    │  │
│  └───────────────────────────┬───────────────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│  ┌───────────────────────────┴───────────────────────────────────────────┐  │
│  │                      Electric SQL Sync Engine                          │  │
│  │              (Postgres Logical Replication → Shapes)                   │  │
│  └───────────────────────────┬───────────────────────────────────────────┘  │
│                              │                                               │
│  ┌───────────────────────────┴───────────────────────────────────────────┐  │
│  │                         PostgreSQL                                     │  │
│  │                    (with Logical Replication)                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Technologies

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Database (Client)** | PGlite + Drizzle ORM | In-browser PostgreSQL with type-safe queries |
| **Database (Server)** | PostgreSQL + Drizzle ORM | Source of truth with logical replication |
| **Sync Engine** | Electric SQL | Real-time partial replication (Shapes) |
| **Backend Runtime** | Bun | Fast JavaScript runtime with native WebSocket |
| **API Framework** | Hono or Elysia | Type-safe, fast web framework |
| **Authentication** | Better Auth | Framework-agnostic auth with Drizzle adapter |
| **GPU Compute** | TypeGPU | Type-safe WebGPU shaders in TypeScript |
| **Rendering** | OffscreenCanvas | Worker-based canvas rendering |
| **Worker RPC** | Comlink | Type-safe worker communication |

---

## Sync Engine (Electric SQL)

Electric SQL is a Postgres sync engine that provides real-time, partial replication using "Shapes" - filtered subsets of your data that sync to clients.

### How It Works

```
┌────────────────┐         ┌────────────────┐         ┌────────────────┐
│   PostgreSQL   │ ──WAL──▶│  Electric SQL  │ ──HTTP──▶│    PGlite     │
│   (Source)     │         │  (Sync Engine) │   Shape  │   (Client)    │
│                │◀──API───│                │◀──Stream─│               │
└────────────────┘         └────────────────┘         └────────────────┘
```

1. **Postgres** streams changes via logical replication (WAL)
2. **Electric** receives changes and maintains "Shapes" (filtered views)
3. **Clients** subscribe to Shapes and receive real-time updates
4. **Writes** go through your API back to Postgres (or use optimistic local writes)

### Shape Definition

Shapes are filtered, partial replications of your tables:

```typescript
// Client subscribes to a shape
import { ShapeStream, Shape } from '@electric-sql/client'

const stream = new ShapeStream({
  url: `${ELECTRIC_URL}/v1/shape`,
  params: {
    table: 'todos',
    where: 'user_id = $1',
    columns: 'id,title,completed,created_at',
  },
})

const shape = new Shape(stream)

// Get initial data
const todos = await shape.rows

// Subscribe to changes
shape.subscribe(({ rows }) => {
  console.log('Todos updated:', rows)
})
```

### PGlite Sync Extension

Sync Electric Shapes directly into PGlite:

```typescript
import { PGlite } from '@electric-sql/pglite'
import { electricSync } from '@electric-sql/pglite-sync'
import { live } from '@electric-sql/pglite/live'

const db = await PGlite.create({
  dataDir: 'idb://my-app',
  extensions: {
    electric: electricSync(),
    live,
  },
})

// Sync a shape into a local table
await db.electric.syncShape({
  url: `${ELECTRIC_URL}/v1/shape`,
  params: {
    table: 'todos',
    where: `user_id = '${userId}'`,
  },
  table: 'todos', // Local table to sync into
})

// Now query locally with live updates
db.live.query('SELECT * FROM todos ORDER BY created_at', [], (results) => {
  renderTodos(results.rows)
})
```

### Optimistic Writes Pattern

For writes, use a shadow table pattern:

```sql
-- Synced data (immutable, from Electric)
CREATE TABLE todos_synced (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE
);

-- Local optimistic state
CREATE TABLE todos_local (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE
);

-- Combined view
CREATE VIEW todos AS
SELECT COALESCE(l.id, s.id) AS id,
       COALESCE(l.title, s.title) AS title,
       COALESCE(l.completed, s.completed) AS completed
FROM todos_synced s
FULL OUTER JOIN todos_local l ON s.id = l.id;

-- Change log for syncing back
CREATE TABLE pending_changes (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  payload JSONB NOT NULL,
  synced BOOLEAN DEFAULT FALSE
);
```

---

## Backend (Bun + Hono/Elysia)

### Why Bun?

- **Native WebSocket** - Built-in pub/sub WebSocket server
- **Fast** - Significantly faster than Node.js
- **All-in-one** - Runtime, bundler, package manager, test runner
- **TypeScript first** - No build step needed

### Hono vs Elysia

| Feature | Hono | Elysia |
|---------|------|--------|
| **Philosophy** | Lightweight, edge-first | Ergonomic, type-safe |
| **WebSocket** | Via adapter (`hono/bun`) | Native (`ws()` method) |
| **Validation** | Zod middleware | Built-in (schema) |
| **Type Safety** | Good | Excellent (end-to-end) |
| **Bundle Size** | ~14kb | ~25kb |

### Hono Example

```typescript
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'

const { upgradeWebSocket, websocket } = createBunWebSocket()

const app = new Hono()

// REST API
app.get('/api/todos', async (c) => {
  const todos = await db.select().from(todosTable)
  return c.json(todos)
})

// WebSocket for real-time
app.get('/ws', upgradeWebSocket((c) => ({
  onMessage(event, ws) {
    const data = JSON.parse(event.data)
    // Handle messages
  },
  onOpen(event, ws) {
    // Subscribe to topics
    ws.raw.subscribe('todos')
  },
})))

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
}
```

### Elysia Example

```typescript
import { Elysia, t } from 'elysia'

const app = new Elysia()
  .get('/api/todos', async () => {
    return db.select().from(todosTable)
  })
  .post('/api/todos', async ({ body }) => {
    return db.insert(todosTable).values(body).returning()
  }, {
    body: t.Object({
      title: t.String(),
      completed: t.Optional(t.Boolean()),
    })
  })
  .ws('/ws', {
    body: t.Object({
      type: t.String(),
      payload: t.Any(),
    }),
    message(ws, message) {
      if (message.type === 'subscribe') {
        ws.subscribe(message.payload.topic)
      }
    },
  })
  .listen(3000)
```

### WebSocket Pub/Sub Pattern

```typescript
// Server
app.ws('/sync', {
  open(ws) {
    ws.subscribe(`user:${ws.data.userId}`)
  },
  message(ws, message) {
    if (message.type === 'change') {
      // Persist to Postgres
      await db.insert(changesTable).values(message.payload)
      
      // Broadcast to all user's devices
      ws.publish(`user:${ws.data.userId}`, JSON.stringify({
        type: 'sync',
        changes: [message.payload],
      }))
    }
  },
})

// Client
const ws = new WebSocket('wss://api.example.com/sync')

ws.onmessage = (event) => {
  const { type, changes } = JSON.parse(event.data)
  if (type === 'sync') {
    applyChangesToLocalDb(changes)
  }
}
```

---

## Authentication (Better Auth)

Better Auth is a framework-agnostic authentication library with first-class Drizzle support.

### Server Setup

```typescript
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg', // or 'mysql', 'sqlite'
  }),
  
  // Email/password
  emailAndPassword: {
    enabled: true,
  },
  
  // Social providers
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  
  // Plugins
  plugins: [
    twoFactor(),      // 2FA support
    passkey(),        // WebAuthn/Passkey
    magicLink(),      // Email magic links
  ],
})
```

### Drizzle Schema (Auto-generated)

```typescript
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  // ...
})

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  // ...
})
```

### Client Usage

```typescript
import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000',
})

// Sign in
await authClient.signIn.email({
  email: 'user@example.com',
  password: 'password',
})

// Sign in with social
await authClient.signIn.social({ provider: 'github' })

// Get session
const session = await authClient.getSession()

// Sign out
await authClient.signOut()
```

### Integration with Hono

```typescript
import { Hono } from 'hono'
import { auth } from './auth'

const app = new Hono()

// Mount auth routes
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

// Protected route
app.get('/api/me', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })
  
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  return c.json(session.user)
})
```

---

## GPU Acceleration (TypeGPU)

[TypeGPU](https://docs.swmansion.com/TypeGPU/) is a type-safe WebGPU toolkit that lets you write shaders in TypeScript.

### Why TypeGPU?

- **Type Safety** - Full TypeScript inference for GPU buffers and shaders
- **No WGSL** - Write compute and render shaders in TypeScript
- **Automatic Alignment** - Handles byte alignment and padding
- **Cross-Platform** - Works in browsers and React Native (via react-native-wgpu)

### Setup

```bash
bun add typegpu
bun add -D unplugin-typegpu  # Bundler plugin
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import typegpu from 'unplugin-typegpu/vite'

export default defineConfig({
  plugins: [typegpu()],
})
```

### Basic Compute Shader

```typescript
import tgpu from 'typegpu'
import * as d from 'typegpu/data'

// Define data structure (type-safe!)
const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
})

// Create buffers
const particleBuffer = root
  .createBuffer(d.arrayOf(Particle, 1000))
  .$usage('storage')

// Write compute shader in TypeScript
const updateParticles = tgpu['~unstable']
  .computeFn({ workgroupSize: [64] })
  .implement((ctx) => {
    const idx = ctx.globalInvocationId.x
    const particle = particleBuffer.at(idx)
    
    // Update position based on velocity
    particle.position = d.vec2f.add(
      particle.position,
      d.vec2f.mulScalar(particle.velocity, 0.016) // deltaTime
    )
  })

// Execute
await root.compute(updateParticles, { dispatch: [1000 / 64] })
```

### Rendering with TypeGPU

```typescript
const vertexShader = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec2f, color: d.vec3f },
    out: { position: d.builtin.position, color: d.vec3f },
  })
  .implement((input) => ({
    position: d.vec4f(input.position, 0, 1),
    color: input.color,
  }))

const fragmentShader = tgpu['~unstable']
  .fragmentFn({
    in: { color: d.vec3f },
    out: { color: d.vec4f },
  })
  .implement((input) => ({
    color: d.vec4f(input.color, 1),
  }))

const pipeline = root.createRenderPipeline({
  vertex: vertexShader,
  fragment: fragmentShader,
})
```

### Use Cases

- **Data Visualization** - Render millions of data points
- **Physics Simulation** - Particle systems, fluid dynamics
- **Image Processing** - Filters, transformations
- **Machine Learning** - Inference on GPU
- **Procedural Generation** - Noise, terrain, textures

---

## Worker Architecture (OffscreenCanvas + Comlink)

Move heavy computation and rendering off the main thread for 60fps UI.

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Main Thread                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │    React UI    │  │  Event Handlers│  │   Comlink Proxy    │  │
│  └───────┬────────┘  └───────┬────────┘  └─────────┬──────────┘  │
│          │                   │                      │             │
│          └───────────────────┴──────────────────────┘             │
│                              │                                    │
│                      postMessage (Comlink)                        │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────────┐
│                         Worker Thread                             │
│                              │                                    │
│  ┌───────────────────────────┴───────────────────────────────┐   │
│  │                    Comlink.expose()                        │   │
│  └───────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│  ┌───────────────┬───────────┴───────────┬───────────────────┐   │
│  │    PGlite     │     TypeGPU          │  OffscreenCanvas   │   │
│  │   Database    │   GPU Compute        │    Rendering       │   │
│  └───────────────┴───────────────────────┴───────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### OffscreenCanvas Setup

```typescript
// main.ts
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const offscreen = canvas.transferControlToOffscreen()

const worker = new Worker(new URL('./render-worker.ts', import.meta.url), {
  type: 'module',
})

// Transfer canvas to worker
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])

// render-worker.ts
let canvas: OffscreenCanvas
let ctx: OffscreenCanvasRenderingContext2D

self.onmessage = (event) => {
  if (event.data.type === 'init') {
    canvas = event.data.canvas
    ctx = canvas.getContext('2d')!
    startRenderLoop()
  }
}

function startRenderLoop() {
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Render at 60fps without blocking main thread
    ctx.fillStyle = 'blue'
    ctx.fillRect(50, 50, 100, 100)
    requestAnimationFrame(render)
  }
  render()
}
```

### Full Worker with Comlink

```typescript
// worker-api.ts (shared types)
export interface WorkerAPI {
  initDatabase(dataDir: string): Promise<void>
  query<T>(sql: string, params?: any[]): Promise<T[]>
  initRenderer(canvas: OffscreenCanvas): Promise<void>
  updateParticles(deltaTime: number): Promise<void>
  runGPUCompute(data: Float32Array): Promise<Float32Array>
}

// worker.ts
import * as Comlink from 'comlink'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import tgpu from 'typegpu'
import type { WorkerAPI } from './worker-api'

class WorkerImpl implements WorkerAPI {
  private db: PGlite | null = null
  private drizzle: ReturnType<typeof drizzle> | null = null
  private canvas: OffscreenCanvas | null = null
  private gpuRoot: any = null

  async initDatabase(dataDir: string) {
    this.db = await PGlite.create({ dataDir })
    this.drizzle = drizzle({ client: this.db })
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized')
    const result = await this.db.query<T>(sql, params)
    return result.rows
  }

  async initRenderer(canvas: OffscreenCanvas) {
    this.canvas = canvas
    
    // Initialize WebGPU
    const adapter = await navigator.gpu.requestAdapter()
    const device = await adapter!.requestDevice()
    this.gpuRoot = tgpu.initFromDevice({ device })
    
    // Configure canvas for WebGPU
    const context = canvas.getContext('webgpu')!
    context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
    })
  }

  async updateParticles(deltaTime: number) {
    // GPU compute for particle physics
    // ... TypeGPU compute shader
  }

  async runGPUCompute(data: Float32Array): Promise<Float32Array> {
    // Generic GPU compute
    // ... TypeGPU implementation
    return data
  }
}

Comlink.expose(new WorkerImpl())

// main.ts
import * as Comlink from 'comlink'
import type { WorkerAPI } from './worker-api'

const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
})

const api = Comlink.wrap<WorkerAPI>(worker)

// Type-safe calls!
await api.initDatabase('idb://my-app')
const todos = await api.query<Todo>('SELECT * FROM todos')

// Transfer canvas for rendering
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const offscreen = canvas.transferControlToOffscreen()
await api.initRenderer(Comlink.transfer(offscreen, [offscreen]))
```

---

## Cross-Platform Code Sharing

Share 90%+ of code between browser and Electron.

### Abstraction Layer Pattern

```typescript
// platform/interface.ts
export interface PlatformAdapter {
  // Database
  createDatabase(name: string): Promise<Database>
  
  // File System
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  
  // System
  getAppDataPath(): string
  getPlatform(): 'browser' | 'electron' | 'mobile'
  
  // Networking
  createWebSocket(url: string): WebSocket
}

// platform/browser.ts
import { PGlite } from '@electric-sql/pglite'

export class BrowserAdapter implements PlatformAdapter {
  async createDatabase(name: string) {
    return new PGlite(`idb://${name}`)
  }
  
  async readFile(path: string) {
    // Use IndexedDB or File System Access API
    const handle = await navigator.storage.getDirectory()
    // ...
  }
  
  getAppDataPath() {
    return 'indexeddb://app-data'
  }
  
  getPlatform() {
    return 'browser' as const
  }
}

// platform/electron.ts
import { PGlite } from '@electric-sql/pglite'
import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'

export class ElectronAdapter implements PlatformAdapter {
  async createDatabase(name: string) {
    const dbPath = path.join(app.getPath('userData'), 'databases', name)
    return new PGlite(dbPath)
  }
  
  async readFile(filePath: string) {
    return fs.readFile(filePath)
  }
  
  getAppDataPath() {
    return app.getPath('userData')
  }
  
  getPlatform() {
    return 'electron' as const
  }
}

// platform/index.ts
import type { PlatformAdapter } from './interface'

let adapter: PlatformAdapter

export function initPlatform(a: PlatformAdapter) {
  adapter = a
}

export function getPlatform(): PlatformAdapter {
  if (!adapter) throw new Error('Platform not initialized')
  return adapter
}
```

### Shared Business Logic

```typescript
// core/todo-service.ts
import { getPlatform } from '../platform'
import { drizzle } from 'drizzle-orm/pglite'
import { todosTable } from './schema'

export class TodoService {
  private db: ReturnType<typeof drizzle>
  
  async init() {
    const platform = getPlatform()
    const client = await platform.createDatabase('todos')
    this.db = drizzle({ client })
  }
  
  async getAll() {
    return this.db.select().from(todosTable)
  }
  
  async create(title: string) {
    return this.db.insert(todosTable).values({ title }).returning()
  }
  
  // ... more methods
}
```

### Electron Main Process

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { ElectronAdapter } from './platform/electron'
import { initPlatform } from './platform'

// Initialize platform
initPlatform(new ElectronAdapter())

// Expose to renderer via IPC
ipcMain.handle('platform:readFile', (_, path) => {
  return getPlatform().readFile(path)
})

ipcMain.handle('platform:writeFile', (_, path, data) => {
  return getPlatform().writeFile(path, data)
})
```

### Conditional Imports

```typescript
// Use Vite's define for build-time branching
// vite.config.ts
export default defineConfig({
  define: {
    __PLATFORM__: JSON.stringify(process.env.PLATFORM || 'browser'),
  },
})

// app.ts
async function initApp() {
  if (__PLATFORM__ === 'electron') {
    const { ElectronAdapter } = await import('./platform/electron')
    initPlatform(new ElectronAdapter())
  } else {
    const { BrowserAdapter } = await import('./platform/browser')
    initPlatform(new BrowserAdapter())
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation

1. **Setup Monorepo** (Turborepo or Nx)
   ```
   packages/
   ├── core/           # Shared business logic
   ├── platform/       # Platform adapters
   ├── db/             # Drizzle schema (shared)
   ├── web/            # Browser app
   ├── desktop/        # Electron app
   └── server/         # Bun backend
   ```

2. **Database Layer**
   - Shared Drizzle schema
   - PGlite for client (browser + Electron renderer)
   - PostgreSQL for server
   - Electric SQL sync setup

3. **Authentication**
   - Better Auth server setup
   - Client auth hooks
   - Session management

### Phase 2: Sync Engine

1. **Electric SQL Integration**
   - Deploy Electric sync service
   - Define Shapes for each entity
   - Implement pglite-sync extension

2. **Optimistic Updates**
   - Shadow table pattern
   - Change log table
   - Conflict resolution strategy

3. **Real-time Updates**
   - WebSocket connection management
   - Reconnection logic
   - Offline queue

### Phase 3: Performance

1. **Worker Architecture**
   - Database in worker
   - Comlink type-safe API
   - OffscreenCanvas rendering

2. **GPU Acceleration**
   - TypeGPU setup
   - Identify compute-heavy operations
   - Implement GPU shaders

3. **Optimization**
   - Virtual scrolling
   - Lazy loading
   - Memory management

### Phase 4: Desktop

1. **Electron Shell**
   - Main/renderer process setup
   - IPC bridge
   - Native menus

2. **Platform Adapter**
   - File system access
   - System notifications
   - Auto-updates

3. **Code Sharing**
   - Shared core package
   - Platform-specific builds
   - Testing strategy

---

## Key Decisions

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| **API Framework** | Hono | Lighter, edge-compatible, sufficient type safety |
| **WebSocket** | Native Bun | Built-in pub/sub, best performance |
| **State Management** | TanStack Query + Zustand | Query cache + minimal global state |
| **UI Framework** | React (or Solid) | Ecosystem, worker support |
| **Bundler** | Vite | Fast, good worker support |
| **Electron Builder** | electron-vite | Unified Vite config |

---

## References

- [Electric SQL Documentation](https://electric-sql.com/docs)
- [PGlite Documentation](https://pglite.dev/)
- [Better Auth Documentation](https://www.better-auth.com/)
- [TypeGPU Documentation](https://docs.swmansion.com/TypeGPU/)
- [Comlink](https://github.com/GoogleChromeLabs/comlink)
- [Hono](https://hono.dev/)
- [Elysia](https://elysiajs.com/)
- [OffscreenCanvas MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [Bun WebSocket](https://bun.sh/guides/websocket/pubsub)
