import { BookOpen, RefreshCw, Sparkles } from 'lucide-react'
import type { StudyFilter, StudyScope } from '@/lib/studyAvailability'
import type { LegacyCard } from './MedReviewLegacyLayout'

type Props = {
  title: string
  scope?: StudyScope
  getCards: (filter: StudyFilter, scope?: StudyScope) => LegacyCard[]
  onStudy: (cards: LegacyCard[], title: string, scope?: StudyScope) => void
}

export function StudyAvailability({ title, scope, getCards, onStudy }: Props) {
  const choices = [
    { filter: 'new' as const, label: 'Novos', Icon: Sparkles, hint: 'Cartões ainda não estudados' },
    {
      filter: 'review' as const,
      label: 'Revisão',
      Icon: RefreshCw,
      hint: 'Cartões com revisão disponível agora',
    },
    {
      filter: 'all' as const,
      label: 'Total',
      Icon: BookOpen,
      hint: 'Novos + revisões disponíveis agora',
    },
  ]
  return (
    <div
      className="mr-study-availability"
      aria-label={`Cartões disponíveis em ${title}`}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span className="mr-availability-caption">Prontos para estudar</span>
      <div className="mr-availability-grid">
        {choices.map(({ filter, label, Icon, hint }) => {
          const count = getCards(filter, scope).length
          return (
            <button
              key={filter}
              type="button"
              className={`mr-availability-option mr-availability-${filter}`}
              disabled={count === 0}
              aria-label={`Estudar ${label.toLowerCase()} em ${title}: ${count} cartões`}
              title={hint}
              onClick={(event) => {
                event.stopPropagation()
                // Resolve again at click time so the session agrees with current progress.
                const cards = getCards(filter, scope)
                if (cards.length) onStudy(cards, `${title} · ${label}`, scope)
              }}
            >
              <span>
                <Icon size={14} aria-hidden="true" /> {label}
              </span>
              <strong>{count}</strong>
            </button>
          )
        })}
      </div>
    </div>
  )
}
