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

Example:
```
mcp__sequential-thinking__sequentialthinking({
  thought: "Analyzing the best approach for...",
  thoughtNumber: 1,
  totalThoughts: 4,
  nextThoughtNeeded: true
})
```

## Commands

- `bun dev` - Start Vite development server
- `bun run build` - TypeScript check and production build
- `bun run preview` - Preview production build

## Architecture

This is a local-first Vite + TypeScript application using PGlite (in-browser PostgreSQL) with Drizzle ORM, running in a Web Worker with Comlink for type-safe communication.

```
Main Thread                          Web Worker
┌─────────────────┐                 ┌─────────────────┐
│    main.ts      │                 │    worker.ts    │
│    (UI Logic)   │                 │    (Database)   │
│        │        │                 │        │        │
│        ▼        │   Comlink RPC   │        ▼        │
│    client.ts    │◄───────────────►│    PGlite +     │
│    (API Layer)  │                 │    Drizzle      │
└─────────────────┘                 └────────┬────────┘
                                             │
                                             ▼
                                       IndexedDB
```

### Key Technologies

| Technology | Purpose |
|------------|---------|
| **PGlite** (`@electric-sql/pglite`) | PostgreSQL in WASM, runs in browser |
| **Drizzle ORM** | Type-safe SQL queries and schema |
| **Comlink** | Type-safe RPC for Web Workers |
| **Vite** (rolldown-vite) | Build tool with worker support |

### Database Layer (`src/db/`)

| File | Purpose |
|------|---------|
| `schema.ts` | Drizzle table definitions + TypeScript types |
| `worker.ts` | Web Worker with PGlite + Drizzle + live queries |
| `client.ts` | Main thread API wrapper using Comlink |

### Key Patterns

**Live Queries**: The database supports reactive queries that automatically notify subscribers when data changes:

```typescript
const unsubscribe = await db.subscribe((todos) => {
  renderTodos(todos)  // Called automatically on any change
})
```

**Worker Communication**: All database calls go through Comlink for type safety:

```typescript
// client.ts wraps worker methods
await db.addTodo('New todo')  // Type-safe, runs in worker
```

**Persistence**: Data is stored in IndexedDB via `idb://` prefix and survives page refreshes.

## Documentation

See `docs/` for detailed documentation:
- `WORKER_ARCHITECTURE.md` - How the worker pattern works
- `PGLITE_DRIZZLE_PLAN.md` - Initial implementation plan
- `ADVANCED_PGLITE_PATTERNS.md` - Live queries, sync, GPU acceleration
- `ULTIMATE_LOCAL_FIRST_STACK.md` - Full stack architecture vision
- `DRIZZLE_PGLITE_LIVE_QUERIES.md` - Why Drizzle lacks native live query support (with sources)

## Known Limitations

### Drizzle + PGlite Live Queries
Drizzle ORM does **not** have native live query integration with PGlite. The current implementation uses a hybrid approach:
- Drizzle for CRUD operations (type-safe)
- Raw SQL for live subscriptions (loses type safety)

See `docs/DRIZZLE_PGLITE_LIVE_QUERIES.md` for full analysis and alternatives (including Kysely which does have native support).

### Optimistic Updates
Optimistic updates are **not needed** for local-only PGlite with live queries. The live query subscription automatically updates the UI when data changes (~50ms latency). Optimistic updates are only relevant when adding remote sync (e.g., Electric SQL).
