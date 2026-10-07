import React, { useState } from 'react'
import type { OcclusionData, OcclusionMask } from '@/services/imageOcclusion'

interface Props {
  data: OcclusionData
  revealed: boolean
  onToggleReveal?: () => void
}

export const ImageOcclusionViewer: React.FC<Props> = ({ data, revealed }) => {
  const [manuallyRevealed, setManuallyRevealed] = useState<Record<string, boolean>>({})

  const toggleMask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setManuallyRevealed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const activeMask = data.masks.find((m) => m.id === data.activeMaskId) || data.masks[0]

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {data.imageTitle && (
        <span style={{ fontSize: '.82rem', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>
          {data.imageTitle}
        </span>
      )}
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
          background: '#0f172a',
        }}
      >
        <img
          src={data.imageUrl}
          alt={data.imageTitle || 'Oclusão de Imagem'}
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: '440px',
            objectFit: 'contain',
          }}
        />

        {/* Overlays */}
        {data.masks.map((mask: OcclusionMask) => {
          const isActive = mask.id === activeMask?.id
          const isShown = revealed ? true : !!manuallyRevealed[mask.id]

          return (
            <div
              key={mask.id}
              onClick={(e) => toggleMask(mask.id, e)}
              title={isShown ? mask.label : 'Clique para revelar este rótulo'}
              style={{
                position: 'absolute',
                left: `${mask.x}%`,
                top: `${mask.y}%`,
                width: `${mask.width}%`,
                height: `${mask.height}%`,
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                border: isActive
                  ? isShown
                    ? '2px solid #22c55e'
                    : '2.5px solid #f59e0b'
                  : '1.5px solid #94a3b8',
                background: isShown
                  ? 'rgba(240, 253, 244, 0.95)'
                  : isActive
                    ? 'rgba(245, 158, 11, 0.92)'
                    : 'rgba(51, 65, 85, 0.88)',
                color: isShown ? '#15803d' : '#ffffff',
                fontWeight: 800,
                fontSize: 'clamp(0.65rem, 1.4vw, 0.9rem)',
                padding: '2px 4px',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none',
                boxShadow: isActive ? '0 0 10px rgba(245, 158, 11, 0.5)' : 'none',
              }}
            >
              {isShown ? (
                <span>{mask.label || '✓'}</span>
              ) : isActive ? (
                <span>?</span>
              ) : (
                <span style={{ opacity: 0.6 }}>•••</span>
              )}
            </div>
          )
        })}
      </div>
      <span style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 6 }}>
        💡 Dica: Toque em qualquer tarja para espiar ou ocultar individualmente.
      </span>
    </div>
  )
}
