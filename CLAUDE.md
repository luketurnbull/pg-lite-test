# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MCP Server Usage

### context7 MCP (Documentation Lookup)
**Always use context7 MCP when looking up documentation for any library or framework.**

1. First, check `package.json` for the exact version being used
2. Use `mcp__context7__resolve-library-id` to find the correct library ID
3. Use `mcp__context7__get-library-docs` with specific topics to fetch relevant docs

Example workflow:
```
1. Read package.json to find: "@electric-sql/pglite": "^0.3.14"
2. resolve-library-id("pglite electric-sql") → /electric-sql/pglite
3. get-library-docs("/electric-sql/pglite", topic="live queries")
```

### sequential-thinking MCP (Planning & Analysis)
**Use sequential-thinking MCP when planning implementations or analyzing complex problems.**

Use cases:
- Planning multi-step implementations
- Analyzing trade-offs between approaches
- Breaking down complex problems
- Designing architecture decisions

## Commands

- `bun dev` - Start Vite development server
- `bun run build` - TypeScript check and production build
- `bun run preview` - Preview production build

## Architecture

Local-first Vite + TypeScript application using PGlite (in-browser PostgreSQL) with multi-tab support and repository pattern.

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

### Key Technologies

| Technology | Purpose |
|------------|---------|
| **PGlite** (`@electric-sql/pglite`) | PostgreSQL in WASM, runs in browser |
| **PGliteWorker** | Multi-tab leader election and worker management |
| **Drizzle ORM** | Type-safe schema definitions |
| **Vite** (rolldown-vite) | Build tool with worker support |

### Database Layer (`src/db/`)

| File | Purpose |
|------|---------|
| `schema.ts` | Drizzle table definitions + TypeScript types |
| `client.ts` | DatabaseClient with query/liveQuery methods |
| `index.ts` | Main exports |
| `repositories/*.ts` | Domain-specific repository classes |

### Workers (`src/workers/`)

| File | Purpose |
|------|---------|
| `pglite.worker.ts` | PGlite worker with leader election |

### Key Patterns

**Repository Pattern**: Domain logic encapsulated in repository classes:

```typescript
import { db, todos } from './db'

await db.init()
const unsubscribe = await todos.subscribe(renderTodos)
await todos.add('New todo')
```

**Live Queries**: Reactive queries that sync across ALL tabs:

```typescript
const unsubscribe = await todos.subscribe((todoList) => {
  renderTodos(todoList)  // Called in ALL tabs when data changes
})
```

**Multi-Tab**: Automatic leader election handled by PGliteWorker.

## Documentation

See `docs/` for detailed documentation:
- `WORKER_ARCHITECTURE.md` - Repository pattern and worker setup
- `DRIZZLE_PGLITE_LIVE_QUERIES.md` - Why Drizzle lacks native live query support
- `ADVANCED_PGLITE_PATTERNS.md` - Live queries, sync, GPU acceleration
- `ULTIMATE_LOCAL_FIRST_STACK.md` - Full stack architecture vision

## Known Limitations

### Drizzle + PGlite Live Queries
Drizzle ORM does **not** have native live query integration with PGlite. Repositories use raw SQL for live subscriptions. See `docs/DRIZZLE_PGLITE_LIVE_QUERIES.md` for alternatives.

### Optimistic Updates
Not needed for local-only PGlite with live queries. The live query subscription automatically updates the UI when data changes (~50ms latency).
