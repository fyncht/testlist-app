
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const N = 1_000_000; // total items

app.use(morgan('dev'));
app.use(cookieParser());
app.use(bodyParser.json());

const DEV = process.env.NODE_ENV !== 'production';

// CORS for dev
if (DEV) {
  app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true
  }));
}

// in-memory store keyed by session id
const store = new Map();

function randomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

app.use((req, res, next) => {
  let sid = req.cookies.sid;
  if (!sid) {
    sid = randomId();
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax' });
  }
  if (!store.has(sid)) {
    store.set(sid, {
      selected: new Set(),
      priorities: new Map(), // default priority is id
      reorderEpoch: 0
    });
  }
  req.session = store.get(sid);
  next();
});

function getPriorityFor(session, id) {
  const v = session.priorities.get(id);
  return (v === undefined) ? id : v;
}

function getPage({ session, offset=0, limit=20, q=null }) {
  offset = Math.max(0, +offset|0);
  limit = Math.max(1, Math.min(100, +limit|0 || 20));
  const qstr = (q ?? '').toString().trim();
  const hasQ = qstr.length > 0;

  // prepare prioritized entries, sorted by p then id
  const prioEntries = Array.from(session.priorities.entries())
    .map(([id, p]) => ({ id: Number(id), p: Number(p) }))
    .filter(e => Number.isFinite(e.id) && e.id >= 1 && e.id <= N)
    .sort((a, b) => (a.p - b.p) || (a.id - b.id));

  const prioSet = new Set(prioEntries.map(e => e.id));

  let i = 1;
  let pi = 0;
  let taken = 0;
  const out = [];

  const matches = (id) => {
    if (!hasQ) return true;
    return ('' + id).includes(qstr);
  };

  while (out.length < limit + 1 && (i <= N || pi < prioEntries.length)) {
    let candId;
    if (pi < prioEntries.length && (i > N || prioEntries[pi].p <= i)) {
      candId = prioEntries[pi].id;
      pi++;
    } else {
      if (prioSet.has(i)) { i++; continue; } // skip prioritized id in natural stream
      candId = i;
      i++;
    }
    if (!matches(candId)) continue;
    if (taken < offset) { taken++; continue; }
    out.push(candId);
  }

  const hasMore = out.length > limit;
  if (hasMore) out.pop();

  return {
    items: out.map(id => ({ id, selected: session.selected.has(id) })),
    hasMore,
    nextOffset: offset + out.length
  };
}

// API
app.get('/api/items', (req, res) => {
  try {
    const { offset = '0', limit = '20', q = '' } = req.query;
    const page = getPage({ session: req.session, offset, limit, q });
    res.json(page);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/select', (req, res) => {
  try {
    const { ids, selected } = req.body || {};
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    const want = !!selected;
    let changed = 0;
    for (const raw of ids) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id < 1 || id > N) continue;
      if (want) {
        if (!req.session.selected.has(id)) { req.session.selected.add(id); changed++; }
      } else {
        if (req.session.selected.delete(id)) { changed++; }
      }
    }
    res.json({ ok: true, changed, selectedCount: req.session.selected.size });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/reorder', (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });

    req.session.reorderEpoch = (req.session.reorderEpoch ?? 0) - 1;
    const base = req.session.reorderEpoch;
    const step = 1e-6;

    let i = 0;
    for (const raw of orderedIds) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id < 1 || id > N) continue;
      req.session.priorities.set(id, base + i * step);
      i++;
    }
    res.json({ ok: true, applied: i });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// вставка одного элемента между соседями 
app.post('/api/reorderSingle', (req, res) => {
  try {
    const { id, beforeId = null, afterId = null } = req.body || {};
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId < 1 || numId > N) {
      return res.status(400).json({ error: 'bad id' });
    }
    const b = (beforeId != null) ? Number(beforeId) : null;
    const a = (afterId != null) ? Number(afterId) : null;

    const pB = (b && b >= 1 && b <= N) ? getPriorityFor(req.session, b) : null;
    const pA = (a && a >= 1 && a <= N) ? getPriorityFor(req.session, a) : null;

    const EPS = 1e-6;
    let newP;

    if (pB != null && pA != null) {
      newP = (pB + pA) / 2;
    } else if (pB == null && pA != null) {
      newP = pA - EPS; // в самый верх относительно after
    } else if (pB != null && pA == null) {
      newP = pB + EPS; // сразу после before
    } else {
      newP = getPriorityFor(req.session, numId); // ни до, ни после 
    }

    req.session.priorities.set(numId, newP);
    res.json({ ok: true, id: numId, priority: newP });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});


// clear state
app.post('/api/reset', (req, res) => {
  req.session.selected.clear();
  req.session.priorities.clear();
  req.session.reorderEpoch = 0;
  res.json({ ok: true });
});

// serve built client
if (!DEV) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
