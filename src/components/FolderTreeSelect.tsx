import React, { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Folder, Search, Check, FolderOpen } from 'lucide-react'
import { compareDecks } from '@/lib/deckSort'

export interface DeckItem {
  id: string
  title: string
  kind?: string
  parent?: string
  deleted?: boolean
}

interface FolderTreeSelectProps {
  decks: DeckItem[]
  selectedDeckId: string
  onSelect: (deckId: string) => void
  darkMode?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function FolderTreeSelect({
  decks,
  selectedDeckId,
  onSelect,
  darkMode = false,
  placeholder = 'Selecione uma pasta...',
  disabled = false,
  style,
}: FolderTreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Map of deck by ID
  const deckMap = useMemo(() => {
    const map = new Map<string, DeckItem>()
    decks.forEach((d) => map.set(d.id, d))
    return map
  }, [decks])

  // Get path breadcrumb for a deck (e.g. "UC-2 > Tutoria > Tutoria 1")
  const getDeckPath = useMemo(() => {
    return (id: string): string[] => {
      const path: string[] = []
      let cur = deckMap.get(id)
      const visited = new Set<string>()
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id)
        path.unshift(cur.title)
        cur = cur.parent ? deckMap.get(cur.parent) : undefined
      }
      return path
    }
  }, [deckMap])

  // Currently selected deck
  const selectedDeck = deckMap.get(selectedDeckId)
  const selectedPath = selectedDeckId ? getDeckPath(selectedDeckId).join(' › ') : ''

  // Auto-expand ancestors of selected deck on open
  useEffect(() => {
    if (isOpen && selectedDeckId) {
      const newExpanded = { ...expanded }
      let cur = deckMap.get(selectedDeckId)
      while (cur && cur.parent) {
        newExpanded[cur.parent] = true
        cur = deckMap.get(cur.parent)
      }
      setExpanded(newExpanded)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen, selectedDeckId, deckMap])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Children helper
  const getChildren = (parentId?: string) => {
    return decks
      .filter((d) => (d.parent || undefined) === (parentId || undefined) && !d.deleted)
      .sort((a, b) => compareDecks(a, b))
  }

  // Filter logic: if search is present, match deck title or any ancestor/descendant
  const searchLower = search.trim().toLowerCase()
  const matchingDeckIds = useMemo(() => {
    if (!searchLower) return null
    const matched = new Set<string>()
    for (const d of decks) {
      if (d.title.toLowerCase().includes(searchLower)) {
        matched.add(d.id)
        // Add ancestors so hierarchy stays connected
        let pId = d.parent
        while (pId) {
          matched.add(pId)
          pId = deckMap.get(pId)?.parent
        }
      }
    }
    return matched
  }, [searchLower, decks, deckMap])

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSelect = (id: string) => {
    onSelect(id)
    setIsOpen(false)
  }

  // Theme palettes
  const bgMain = darkMode ? '#222222' : '#ffffff'
  const bgHover = darkMode ? '#2f2f2f' : '#f0fdf4'
  const bgSelected = darkMode ? '#1e3a29' : '#dcfce7'
  const borderColor = darkMode ? '#444444' : '#cbd5e1'
  const textMain = darkMode ? '#f3f4f6' : '#1e293b'
  const textSub = darkMode ? '#9ca3af' : '#64748b'
  const textSelected = darkMode ? '#4ade80' : '#15803d'
  const inputBg = darkMode ? '#181818' : '#f8fafc'

  // Recursive tree renderer
  const renderTree = (parentId?: string, depth = 0): React.ReactNode => {
    const items = getChildren(parentId)
    const filtered = matchingDeckIds
      ? items.filter((d) => matchingDeckIds.has(d.id))
      : items

    if (filtered.length === 0) return null

    return filtered.map((deck) => {
      const kids = getChildren(deck.id)
      const hasKids = kids.length > 0
      // Auto expand when searching
      const isExpanded = searchLower ? true : !!expanded[deck.id]
      const isSelected = deck.id === selectedDeckId

      return (
        <div key={deck.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            onClick={() => handleSelect(deck.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 8px 6px ' + (depth * 18 + 8) + 'px',
              borderRadius: 6,
              cursor: 'pointer',
              background: isSelected ? bgSelected : 'transparent',
              color: isSelected ? textSelected : textMain,
              fontWeight: isSelected ? 700 : 500,
              fontSize: '0.82rem',
              gap: 6,
              userSelect: 'none',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.background = bgHover
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'transparent'
            }}
          >
            {/* Expand / Collapse Button */}
            {hasKids ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(deck.id, e)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  border: 0,
                  background: 'transparent',
                  color: isSelected ? textSelected : textSub,
                  cursor: 'pointer',
                  padding: 0,
                  borderRadius: 4,
                }}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span style={{ width: 18, display: 'inline-block' }} />
            )}

            {/* Folder Icon */}
            {hasKids && isExpanded ? (
              <FolderOpen size={15} style={{ color: isSelected ? textSelected : '#3b82f6', flexShrink: 0 }} />
            ) : (
              <Folder size={15} style={{ color: isSelected ? textSelected : '#10b981', flexShrink: 0 }} />
            )}

            {/* Title */}
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={deck.title}
            >
              {deck.title}
            </span>

            {/* Kids count badge */}
            {hasKids && (
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: darkMode ? '#333333' : '#e2e8f0',
                  color: textSub,
                  fontWeight: 600,
                }}
              >
                {kids.length}
              </span>
            )}

            {/* Checkmark when selected */}
            {isSelected && <Check size={14} style={{ color: textSelected, flexShrink: 0, marginLeft: 4 }} />}
          </div>

          {/* Sublevel children (nested) */}
          {hasKids && isExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {renderTree(deck.id, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: 200,
        maxWidth: '100%',
        ...style,
      }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          width: '100%',
          padding: '6px 12px',
          background: bgMain,
          color: selectedDeck ? textMain : textSub,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', flex: 1 }}>
          <Folder size={15} style={{ color: selectedDeck ? textSelected : textSub, flexShrink: 0 }} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedDeck ? selectedPath || selectedDeck.title : placeholder}
          </span>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: textSub,
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            zIndex: 9999,
            width: 'max(100%, 320px)',
            maxWidth: '92vw',
            background: bgMain,
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            padding: 8,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {/* Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderRadius: 6,
              background: inputBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            <Search size={14} style={{ color: textSub, flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar pasta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                border: 0,
                outline: 'none',
                background: 'transparent',
                color: textMain,
                fontSize: '0.8rem',
                fontFamily: 'inherit',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  border: 0,
                  background: 'transparent',
                  color: textSub,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  padding: '0 4px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Breadcrumb Path Preview if selected */}
          {selectedPath && (
            <div
              style={{
                fontSize: '0.72rem',
                color: textSub,
                padding: '2px 6px',
                borderBottom: `1px dashed ${borderColor}`,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={selectedPath}
            >
              📍 Atual: <strong style={{ color: textSelected }}>{selectedPath}</strong>
            </div>
          )}

          {/* Tree Scroll Area */}
          <div
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {renderTree()}
            {decks.length === 0 && (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: textSub, fontSize: '0.8rem' }}>
                Nenhuma pasta encontrada.
              </div>
            )}
            {decks.length > 0 && searchLower && matchingDeckIds && matchingDeckIds.size === 0 && (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: textSub, fontSize: '0.8rem' }}>
                Nenhuma pasta coincide com &ldquo;{search}&rdquo;.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
