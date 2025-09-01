
const base = (import.meta.env.PROD ? '' : 'http://localhost:3001');

export async function fetchPage({ offset=0, limit=20, q='' }) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit), q });
  const res = await fetch(`${base}/api/items?` + params.toString(), { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export async function toggleSelect(ids, selected) {
  const res = await fetch(`${base}/api/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids, selected })
  });
  if (!res.ok) throw new Error('Failed to select');
  return res.json();
}

export async function applyReorder(orderedIds) {
  const res = await fetch(`${base}/api/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderedIds })
  });
  if (!res.ok) throw new Error('Failed to reorder');
  return res.json();
}
