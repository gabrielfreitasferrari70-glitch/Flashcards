import { useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function StudyToolsMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="mr-legacy-control mr-study-tools-trigger">
          <SlidersHorizontal size={16} aria-hidden="true" /> Ferramentas
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="mr-study-tools-popover"
        aria-label="Ferramentas de estudo"
      >
        <p className="mr-tools-title">Personalize sua sessão</p>
        <div
          className="mr-study-tools-grid"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[data-close-tools]')) setOpen(false)
          }}
        >
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )
}
