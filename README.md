# Test List App (1 → 1,000,000)

Full-stack demo for the assignment.

## What’s implemented
- 1,000,000 items (IDs 1..1_000_000)
- Multi-select with checkboxes
- Text search (filter) with debounced input
- Drag & Drop reordering (also works on search result subsets)
- Infinite scroll: loads 20 at a time (both normal and filtered view)
- Server-side persistence *in memory* (per session via cookie)
- On refresh, selection and ordering are preserved; only 20 are rendered first; the rest load as you scroll.

## Quick start (local)

**Requirements:** Node.js 18+

```bash
# 1) Install deps (server + client)
npm install

# 2) Start dev servers
# Terminal A:
npm --prefix server run dev
# Terminal B:
npm --prefix client run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173

The frontend talks to `/api` on http://localhost:3001 with credentials (cookies) enabled.

## Production build & single-service run

```bash
# Build static frontend
npm run build

# Start server (serves client/dist automatically)
npm start
# => http://localhost:3001
```

## Deploy (Render / Railway / Fly / Heroku)
- **Start command:** `npm start`
- **Build command:** `npm install && npm run build`
- The server will serve `client/dist` automatically in production (same origin).

## API Summary
- `GET /api/items?offset=0&limit=20&q=` — paginated (and filtered) items in custom order.
- `POST /api/select` `{ ids: number[], selected: boolean }` — toggle selection.
- `POST /api/reorder` `{ orderedIds: number[] }` — applies order of the currently loaded list to the global order.

## Notes on ordering model
We use *fractional indexing* with default priority = `id`. Reordered items get small *priority* values to place them ahead while keeping relative order stable. This avoids storing an array of 1e6 on the server and scales for incremental reorders.
