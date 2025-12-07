# Drizzle ORM + PGlite Live Queries: The Truth

## TL;DR

**Drizzle ORM does NOT have native live query integration with PGlite.** You must use a hybrid approach where Drizzle handles CRUD operations and raw SQL handles live subscriptions.

However, **Kysely (an alternative TypeScript query builder) DOES have native live query support** via the `kysely-pglite` package.

## The Current State (December 2024)

### Drizzle + PGlite: No Native Live Query Support

After extensive research through official documentation:

**Source 1: Drizzle ORM Official Docs**
- URL: https://orm.drizzle.team/docs/connect-pglite
- Drizzle supports PGlite as a database driver via `drizzle-orm/pglite`
- The documentation only shows basic query operations:
  ```typescript
  import { PGlite } from '@electric-sql/pglite';
  import { drizzle } from 'drizzle-orm/pglite';
  
  const client = new PGlite();
  const db = drizzle({ client });
  
  await db.select().from(users); // Standard query - NOT reactive
  ```
- **No mention of live query integration**

**Source 2: Drizzle's useLiveQuery Hook**
- URL: https://orm.drizzle.team/docs/connect-expo-sqlite
- Drizzle DOES have a `useLiveQuery` hook, but **only for Expo SQLite**, not PGlite:
  ```typescript
  // This ONLY works with Expo SQLite, NOT PGlite!
  import { useLiveQuery, drizzle } from 'drizzle-orm/expo-sqlite';
  const { data } = useLiveQuery(db.select().from(schema.users));
  ```
- This hook is specifically tied to Expo SQLite's `enableChangeListener` feature

**Source 3: PGlite Live Extension Documentation**
- URL: https://github.com/electric-sql/pglite/blob/main/docs/docs/live-queries.md
- PGlite's live extension works at the raw SQL level:
  ```typescript
  pg.live.query('SELECT * FROM test;', [], (res) => {
    console.log(res.rows); // Raw SQL, not Drizzle
  });
  ```
- Framework hooks (`@electric-sql/pglite-react`, `@electric-sql/pglite-vue`) all take SQL strings, not Drizzle query builders

### Why This Is Frustrating (The Hybrid Problem)

With the current setup, you're forced into this pattern:

```typescript
// CRUD operations use Drizzle (type-safe, great DX)
await db.insert(todosTable).values({ description: 'Learn PGlite' });
await db.update(todosTable).set({ completed: true }).where(eq(todosTable.id, 1));
await db.delete(todosTable).where(eq(todosTable.id, 1));

// But live queries require RAW SQL (loses type safety)
pglite.live.query(
  'SELECT * FROM todos ORDER BY id DESC', // Raw SQL string
  [],
  (results) => callback(results.rows)
);
```

This means:
- Your CRUD operations are type-safe with Drizzle
- Your live subscriptions use raw SQL strings with no type safety
- Schema changes require updating both Drizzle schema AND raw SQL queries
- Two different "sources of truth" for your queries

## The Alternative: Kysely + kysely-pglite

There IS a TypeScript-first query builder with **native PGlite live query support**: Kysely with `kysely-pglite`.

**Source**: https://github.com/dnlsandiego/kysely-pglite

```typescript
import { Kysely } from 'kysely'
import { KyselyPGlite, KyselyLive } from 'kysely-pglite'
import { live } from '@electric-sql/pglite/live'

interface DB {
  user: { id: number; name: string }
}

// Setup
const { dialect, client } = new KyselyPGlite({ extensions: { live } })
const db = new Kysely<DB>({ dialect })
const pglive = new KyselyLive(client)

// Type-safe live query!
const usersQuery = db.selectFrom('user').selectAll().orderBy('id asc')
const liveQuery = pglive.query(usersQuery)

// `data` is FULLY TYPED as User[]
for await (const data of liveQuery.subscribe) {
  console.log(data[0].id, data[0].name) // Type-safe!
}
```

This provides:
- Type-safe query building (like Drizzle)
- Native integration with PGlite's live extension
- Single source of truth for queries
- Full TypeScript inference on subscription results

## Workaround: Using Drizzle's toSQL()

If you want to stick with Drizzle, there's a partial workaround using `toSQL()`:

```typescript
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const pgDialect = new PgDialect();

// Build query with Drizzle
const query = db.select().from(todosTable).orderBy(desc(todosTable.id));

// Extract SQL string
const { sql: sqlString, params } = pgDialect.sqlToQuery(query.toSQL());

// Use with PGlite live extension
pglite.live.query(sqlString, params, (results) => {
  // results.rows is still untyped at runtime, but at least
  // your query logic is centralized in Drizzle
  callback(results.rows as Todo[]);
});
```

**Pros:**
- Query logic stays in Drizzle
- Single source of truth for query structure
- Type-safe query building

**Cons:**
- Still requires manual type casting on results
- Extra boilerplate to extract SQL
- Not truly integrated - it's a workaround

## Optimistic Updates: Clarification

The previous documentation incorrectly mentioned optimistic updates in the context of local live queries. Let me clarify:

### When Optimistic Updates Are NOT Needed

For **local-only** PGlite with live queries:

```
User Action → Local DB Write (1-5ms) → Live Query Fires → UI Updates
```

The entire flow is ~50ms or less. There's no need for optimistic updates because:
- No network latency
- Write operation is effectively instant
- Live subscription handles UI automatically

### When Optimistic Updates ARE Needed

Only when **syncing to a remote server** (e.g., with Electric SQL):

```
User Action → Local DB Write → UI Updates (optimistic)
                           ↓
                    Sync to Server (100-1000ms+)
                           ↓
                    Confirm or Rollback
```

With remote sync:
- Network latency introduces delay
- Sync might fail (conflict, network error)
- You want UI to feel instant while waiting for confirmation
- You need rollback logic if sync fails

**Bottom Line:** If you're using PGlite as a local-only database with live queries, you don't need optimistic updates. The live query pattern handles everything. Optimistic updates become relevant when you add Electric SQL or another sync layer.

## Recommendations

### If Starting Fresh
Consider using **Kysely + kysely-pglite** if native live query support with full type safety is important to you. It provides exactly what Drizzle + PGlite lacks.

### If Already Using Drizzle
1. **Accept the hybrid approach** - Use Drizzle for CRUD, raw SQL for live queries
2. **Create type-safe wrappers** - Build utility functions that encapsulate the raw SQL
3. **Use the toSQL() workaround** - Centralizes query logic in Drizzle
4. **Watch for updates** - Drizzle is actively developed; native PGlite live support may come

### Feature Request
If you want native Drizzle + PGlite live query support, consider opening a feature request on the Drizzle GitHub repository: https://github.com/drizzle-team/drizzle-orm

## Sources

1. **Drizzle ORM PGlite Connection**: https://orm.drizzle.team/docs/connect-pglite
2. **Drizzle ORM Expo SQLite (useLiveQuery)**: https://orm.drizzle.team/docs/connect-expo-sqlite
3. **PGlite Live Queries**: https://github.com/electric-sql/pglite/blob/main/docs/docs/live-queries.md
4. **PGlite ORM Support**: https://github.com/electric-sql/pglite/blob/main/docs/docs/orm-support.md
5. **Kysely-PGlite**: https://github.com/dnlsandiego/kysely-pglite
6. **PGlite React Hooks**: https://github.com/electric-sql/pglite/blob/main/docs/docs/framework-hooks/react.md
