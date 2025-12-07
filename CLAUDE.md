# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun dev` - Start Vite development server
- `bun run build` - TypeScript check and production build
- `bun run preview` - Preview production build
- `bun run db:push` - Push Drizzle schema to database
- `bun run db:studio` - Open Drizzle Studio

## Architecture

This is a Vite + TypeScript frontend application using PGlite (in-browser PostgreSQL) with Drizzle ORM.

**Key technologies:**
- **PGlite** (`@electric-sql/pglite`) - Embedded PostgreSQL that runs entirely in the browser via WASM
- **Drizzle ORM** - Type-safe SQL query builder and schema definition
- **Vite** (via rolldown-vite) - Build tool and dev server

**Database layer (`src/db/`):**
- `schema.ts` - Drizzle table definitions (PostgreSQL dialect)
- `client.ts` - Drizzle client configured for PGlite

The database runs client-side with no external server connection.
