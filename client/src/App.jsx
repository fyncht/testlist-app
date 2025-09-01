
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchPage, toggleSelect, applyReorder, reorderSingle } from './api.js'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSensors, useSensor, PointerSensor } from '@dnd-kit/core'
import SortableItem from './components/SortableItem.jsx'

const PAGE_LIMIT = 20
const DEBOUNCE_MS = 300

export default function App() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([]) // {id, selected}
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const listEndRef = useRef(null)
  const observerRef = useRef(null)
  const debounceRef = useRef(null)

  const load = useCallback(async (reset=false, query=null) => {
    if (loading) return
    try {
      setLoading(true)
      setError(null)
      const _q = (query !== null ? query : q)
      const page = await fetchPage({ offset: reset ? 0 : offset, limit: PAGE_LIMIT, q: _q })
      if (reset) {
        setItems(page.items)
        setOffset(page.nextOffset)
      } else {
        setItems(prev => [...prev, ...page.items])
        setOffset(page.nextOffset)
      }
      setHasMore(page.hasMore)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }, [loading, offset, q])

  // initial
  useEffect(() => { load(true) }, [])

  // infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!listEndRef.current) return
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && hasMore && !loading) {
          load(false)
        }
      })
    }, { root: null, rootMargin: '200px', threshold: 0 })
    observerRef.current.observe(listEndRef.current)
    return () => observerRef.current?.disconnect()
  }, [listEndRef.current, hasMore, loading, load])

  const onSearchChange = (e) => {
    const val = e.target.value
    setQ(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setOffset(0)
      setHasMore(true)
      load(true, val)
    }, DEBOUNCE_MS)
  }

  const selectedCount = useMemo(() => items.filter(i => i.selected).length, [items])

  const onToggleOne = async (id, selected) => {
    await toggleSelect([id], selected)
    setItems(prev => prev.map(it => it.id === id ? { ...it, selected } : it))
  }

  const onSelectVisible = async (want) => {
    const visibles = items.map(i => i.id)
    await toggleSelect(visibles, want)
    setItems(prev => prev.map(it => ({ ...it, selected: want })))
  }

  // drag & Drop
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [activeId, setActiveId] = useState(null)

  const ids = items.map(i => i.id)

  const handleDragStart = (event) => {
    setActiveId(event.active.id)
  }
  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = ids.indexOf(active.id)
    const newIndex = ids.indexOf(over.id)

    // локально двигаем 
    const newOrder = arrayMove(items, oldIndex, newIndex)
    setItems(newOrder)

    const selectedIds = newOrder.filter(i => i.selected).map(i => i.id)

    try {
      if (selectedIds.length > 0) {
        // если есть отмеченные — сохраняем порядок только их
        const onlySelectedInNewOrder = newOrder.filter(i => i.selected).map(i => i.id)
        await applyReorder(onlySelectedInNewOrder)
      } else {
        // иначе сохраняем только перетаскиваемый элемент как вставку между соседями
        const beforeId = newOrder[newIndex - 1]?.id ?? null
        const afterId  = newOrder[newIndex + 1]?.id ?? null
        await reorderSingle(active.id, beforeId, afterId)
      }
    } catch (e) {
      console.error(e)
    }
  }


  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Million List • Demo</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          placeholder="Поиск по ID (введите цифры)…"
          value={q}
          onChange={onSearchChange}
          style={{ flex: 1, padding: '8px 10px', fontSize: 16, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <button onClick={() => onSelectVisible(true)} style={btnStyle}>Выбрать видимые</button>
        <button onClick={() => onSelectVisible(false)} style={btnStyle}>Снять выбор</button>
      </div>

      <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
        Загружено: <b>{items.length}</b> • Выбрано среди загруженных: <b>{selectedCount}</b>{q ? <> • Поиск: <code>{q}</code></> : null}
      </div>

      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>Ошибка: {error}</div>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map(item => (
              <SortableItem key={item.id} id={item.id}>
                <Row item={item} onToggle={onToggleOne} active={activeId === item.id} />
              </SortableItem>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div ref={listEndRef} style={{ height: 1 }} />
      {loading && <div style={{ padding: 12, color: '#666' }}>Загрузка…</div>}
      {!hasMore && <div style={{ padding: 12, color: '#666' }}>Конец списка</div>}
    </div>
  )
}

const btnStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#f8f8f8', cursor: 'pointer' }

function Row({ item, onToggle, active }) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        border: '1px solid #eee',
        borderRadius: 12,
        marginBottom: 8,
        boxShadow: active ? '0 0 0 2px #9ecbff inset' : 'none',
        background: 'white'
      }}
    >
      <input type="checkbox" checked={item.selected} onChange={(e) => onToggle(item.id, e.target.checked)} />
      <div style={{ width: 36, textAlign: 'right', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>#{item.id}</div>
      <div style={{ flex: 1 }}>Элемент <b>{item.id}</b></div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>тяните ⋮⋮</div>
    </li>
  )
}
