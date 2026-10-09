import React, { useEffect, useState, useMemo } from 'react'
import { StudyHeatmap } from './StudyHeatmap'
import {
  compareDecks,
  DECK_SORT_EVENT,
  DECK_SORT_OPTIONS,
  getDeckSort,
  setDeckSort,
  type DeckSortMode,
} from '@/lib/deckSort'

export type LegacyDeck = {
  id: string
  title: string
  kind: string
  order?: number
  parent?: string
  description?: string
  mode?: string
  deleted?: boolean
}
export type LegacyCard = {
  id: string
  deck: string
  q: string
  a: string
  group?: string
  suspended?: boolean
  deleted?: boolean
}
export type SessionTally = {
  startMs: number
  again: number
  hard: number
  good: number
  easy: number
}

const legacyCss = `
:root {
  --mr-green: #16a34a;
  --mr-dark: #14532d;
  --mr-ink: #15803d;
  --mr-pale: #f0fdf4;
  --mr-mint: #d1fae5;
  --mr-line: #e2e8f0;
  --mr-text: #1e293b;
  --mr-muted: #64748b;
}
.mr-legacy-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fafc 320px);
  color: var(--mr-text);
  font-family: Inter, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.mr-legacy-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 4px 20px -2px rgba(20, 83, 45, 0.05);
}
.mr-legacy-header-inner {
  max-width: 1200px;
  min-height: 70px;
  margin: 0 auto;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.mr-legacy-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  cursor: pointer;
  text-decoration: none;
}
.mr-legacy-brand-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #dcfce7, #bbf7d0);
  font-size: 22px;
  box-shadow: inset 0 0 0 1px #86efac;
}
.mr-legacy-brand-title {
  display: flex;
  flex-direction: column;
}
.mr-legacy-brand-main {
  font-size: 1.05rem;
  font-weight: 900;
  color: #14532d;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.mr-legacy-brand-sub {
  font-size: 0.68rem;
  font-weight: 700;
  color: #16a34a;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.mr-legacy-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mr-legacy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 14px;
  color: #334155;
  background: #ffffff;
  font: 700 0.82rem Inter, system-ui, sans-serif;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s ease;
}
.mr-legacy-button:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  transform: translateY(-1px);
}
.mr-legacy-button.primary {
  color: #ffffff;
  border-color: #16a34a;
  background: linear-gradient(135deg, #16a34a, #15803d);
  box-shadow: 0 3px 10px rgba(22, 163, 74, 0.22);
}
.mr-legacy-button.primary:hover {
  background: linear-gradient(135deg, #15803d, #14532d);
  box-shadow: 0 5px 14px rgba(22, 163, 74, 0.3);
}
.mr-legacy-button.amber {
  color: #b45309;
  border-color: #fde68a;
  background: #fffbeb;
}
.mr-legacy-button.amber:hover {
  background: #fef3c7;
  border-color: #fcd34d;
}
.mr-legacy-button.blue {
  color: #1d4ed8;
  border-color: #bfdbfe;
  background: #eff6ff;
}
.mr-legacy-button.blue:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}
.mr-legacy-button.icon-only {
  width: 38px;
  min-width: 38px;
  padding: 0;
  border-color: #e2e8f0;
  color: #64748b;
  font-size: 1rem;
}
.mr-legacy-button.icon-only:hover {
  color: #1e293b;
  background: #f1f5f9;
}
.mr-legacy-dropdown-wrap {
  position: relative;
  display: inline-block;
}

.mr-legacy-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 24px 60px;
}

/* HERO SECTION */
.mr-legacy-hero {
  position: relative;
  overflow: hidden;
  padding: 32px 36px 28px;
  margin: 0 0 32px;
  border: 1.5px solid #d1fae5;
  border-radius: 24px;
  background: linear-gradient(135deg, #ffffff 40%, #f0fdf4 100%);
  box-shadow: 0 10px 32px -4px rgba(22, 163, 74, 0.08);
}
.mr-legacy-hero::after {
  content: '🩺';
  position: absolute;
  right: 32px;
  top: 24px;
  font-size: 80px;
  opacity: 0.07;
  pointer-events: none;
}
.mr-legacy-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  background: #ecfdf5;
  color: #15803d;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.mr-legacy-hero h1 {
  position: relative;
  z-index: 1;
  margin: 12px 0 6px;
  color: #14532d;
  font-size: clamp(1.6rem, 2.8vw, 2.1rem);
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.03em;
}
.mr-legacy-copy {
  max-width: 720px;
  margin: 0;
  color: #64748b;
  font-size: 0.95rem;
  line-height: 1.55;
}
.mr-legacy-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 24px;
}
.mr-legacy-metric {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 12px 16px;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.mr-legacy-metric:hover {
  border-color: #86efac;
  transform: translateY(-2px);
}
.mr-legacy-metric-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: #f0fdf4;
  font-size: 18px;
}
.mr-legacy-metric-label {
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.2;
}
.mr-legacy-metric-value {
  display: block;
  margin-top: 3px;
  color: #14532d;
  font-size: 1.15rem;
  font-weight: 900;
}
.mr-legacy-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 20px;
  margin-top: 22px;
  border-top: 1px solid #d1fae5;
}

/* SECTION HEADER */
.mr-legacy-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 8px 0 18px;
}
.mr-legacy-section-title {
  margin: 0;
  color: #14532d;
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: -0.025em;
}
.mr-legacy-section-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.86rem;
}

/* CARDS & GRID */
.mr-legacy-category-grid, .mr-legacy-subdecks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.mr-legacy-category, .mr-legacy-subdeck {
  display: flex;
  flex-direction: column;
  min-height: 220px;
  padding: 22px;
  border: 1.5px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}
.mr-legacy-category:hover, .mr-legacy-subdeck:hover {
  transform: translateY(-3px);
  border-color: #86efac;
  box-shadow: 0 12px 28px rgba(22, 163, 74, 0.1);
}
.mr-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.mr-card-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  font-size: 24px;
}
.mr-card-top-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mr-legacy-tag {
  padding: 4px 10px;
  border-radius: 999px;
  background: #f0fdf4;
  border: 1px solid #d1fae5;
  color: #15803d;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
}
.mr-card-body {
  margin: 14px 0;
  flex: 1;
}
.mr-card-body h3 {
  margin: 0 0 6px;
  color: #14532d;
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.35;
}
.mr-card-body p {
  margin: 0;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mr-card-foot {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.mr-card-count {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
  font-size: 0.74rem;
  font-weight: 800;
}
.mr-card-foot-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mr-card-foot-actions button {
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  padding: 4px 8px;
  background: #fff;
  color: #334155;
  font: 700 0.72rem Inter, system-ui, sans-serif;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.mr-card-foot-actions button:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}
.mr-card-arrow {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #f0fdf4;
  color: #15803d;
  font-size: 15px;
  font-weight: bold;
  transition: transform 0.15s ease, background 0.15s ease;
}
.mr-legacy-category:hover .mr-card-arrow,
.mr-legacy-subdeck:hover .mr-card-arrow {
  transform: translateX(3px);
  background: #dcfce7;
}

/* POPOVER MENU */
.mr-legacy-subdeck-more-btn {
  width: 28px !important;
  height: 28px !important;
  display: grid !important;
  place-items: center !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 8px !important;
  background: #fff !important;
  color: #475569 !important;
  font-size: 1rem !important;
  font-weight: 800 !important;
  cursor: pointer !important;
  transition: all 0.15s ease;
  padding: 0 !important;
}
.mr-legacy-subdeck-more-btn:hover {
  background: #f1f5f9 !important;
  border-color: #94a3b8 !important;
  color: #0f172a !important;
}
.mr-legacy-menu-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 100;
  min-width: 180px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.14), 0 2px 8px rgba(15, 23, 42, 0.06);
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mr-legacy-menu-popover button {
  display: flex !important;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px !important;
  border: 0 !important;
  border-radius: 7px !important;
  background: none !important;
  color: #334155 !important;
  font: 650 0.78rem Inter, system-ui, sans-serif !important;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}
.mr-legacy-menu-popover button:hover {
  background: #f1f5f9 !important;
  color: #0f172a !important;
}
.mr-legacy-menu-popover button.danger {
  color: #dc2626 !important;
}
.mr-legacy-menu-popover button.danger:hover {
  background: #fef2f2 !important;
  color: #b91c1c !important;
}
.mr-legacy-menu-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 3px 0;
}

/* FOLDER HEAD & BREADCRUMBS */
.mr-legacy-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: #64748b;
  font-size: 0.86rem;
}
.mr-legacy-breadcrumb button {
  border: 0;
  padding: 0;
  background: none;
  color: #15803d;
  font: 700 0.86rem Inter, system-ui, sans-serif;
  cursor: pointer;
}
.mr-legacy-breadcrumb button:hover {
  text-decoration: underline;
}
.mr-legacy-breadcrumb strong {
  color: #14532d;
}
.mr-legacy-folder-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 14px;
  margin: 24px 0 16px;
}
.mr-legacy-folder-head h1 {
  margin: 7px 0 4px;
  color: #14532d;
  font-size: 1.8rem;
  letter-spacing: -0.03em;
}
.mr-legacy-folder-head p {
  margin: 0;
  color: #64748b;
}
.mr-legacy-folder-head-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.mr-legacy-folder-manage {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid #bbf7d0;
  border-radius: 14px;
  background: #f0fdf4;
}
.mr-legacy-folder-manage-label {
  flex-basis: 100%;
  color: #14532d;
  font-size: 0.78rem;
  font-weight: 900;
}

.mr-legacy-empty {
  padding: 36px 20px;
  border: 1.5px dashed #86efac;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.8);
  color: #64748b;
  text-align: center;
  font-size: 0.92rem;
}

/* STUDY COMPLETE & STUDY PAGE */
.mr-legacy-study-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4, #f8fafc 310px);
  font-family: Inter, system-ui, sans-serif;
}
.mr-legacy-study-top {
  max-width: 1120px;
  margin: 0 auto;
  padding: 14px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.mr-legacy-study-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mr-legacy-control {
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 9px 12px;
  background: #fff;
  color: #15803d;
  font-weight: 800;
  cursor: pointer;
}
.mr-legacy-control.exit {
  border-color: #e5e7eb;
  color: #475569;
}
.mr-legacy-study-main {
  max-width: 960px;
  margin: 0 auto;
  padding: 12px 22px 55px;
}
.mr-legacy-study-card {
  background: #fff;
  border: 1.5px solid #d1fae5;
  border-radius: 21px;
  padding: clamp(20px, 3.5vw, 36px);
  box-shadow: 0 10px 30px rgba(20, 83, 45, 0.07);
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.mr-legacy-study-card:hover {
  box-shadow: 0 14px 38px rgba(20, 83, 45, 0.11);
}
.mr-legacy-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 0 16px;
  color: #15803d;
  font-size: 0.83rem;
  font-weight: 800;
}
.mr-legacy-question {
  margin: 12px 0 0;
  color: #1f2937;
  font-size: clamp(1.2rem, 2.5vw, 1.6rem);
  line-height: 1.45;
  font-weight: 800;
}
.mr-legacy-question img,
.mr-legacy-answer-body img,
.mr-legacy-answer img,
.mr-legacy-study-card img {
  display: block;
  max-width: 100%;
  max-height: 440px;
  width: auto;
  height: auto;
  margin: 16px auto;
  border-radius: 12px;
  object-fit: contain;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  cursor: zoom-in;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.mr-legacy-question img:hover,
.mr-legacy-answer-body img:hover,
.mr-legacy-answer img:hover,
.mr-legacy-study-card img:hover {
  transform: scale(1.015);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.mr-legacy-answer {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid #d1fae5;
  color: #334155;
  font-size: 1rem;
  line-height: 1.7;
}
.mr-legacy-mode-row {
  display: flex;
  gap: 7px;
  margin: 14px 0 4px;
  flex-wrap: wrap;
}
.mr-legacy-mode-btn {
  border: 1px solid #bbf7d0;
  border-radius: 9px;
  padding: 7px 12px;
  background: #fff;
  color: #15803d;
  font: 700 0.78rem Inter, system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
}
.mr-legacy-mode-btn:hover {
  background: #f0fdf4;
  border-color: #86efac;
}
.mr-legacy-mode-btn.active {
  background: linear-gradient(135deg, #16a34a, #22c55e);
  color: #fff;
  border-color: #16a34a;
  box-shadow: 0 3px 9px rgba(22, 163, 74, 0.2);
}
.mr-legacy-hint {
  margin-top: 18px;
  color: #94a3b8;
  text-align: center;
  font-size: 0.84rem;
}
.mr-legacy-rating-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.mr-legacy-session {
  max-width: 820px;
  margin: 18px auto 0;
  padding: clamp(24px, 5vw, 50px);
  border: 1.5px solid #d1fae5;
  border-radius: 24px;
  background: linear-gradient(145deg, #fff, #f0fdf4);
  box-shadow: 0 14px 38px rgba(22, 163, 74, 0.09);
  text-align: center;
}
.mr-legacy-session-icon {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  margin: 0 auto 14px;
  border: 1px solid #bbf7d0;
  border-radius: 23px;
  background: #fff;
  color: #16a34a;
  font-size: 37px;
  box-shadow: 0 7px 18px rgba(22, 163, 74, 0.1);
}
.mr-legacy-session h1 {
  margin: 0;
  color: #166534;
  font-size: clamp(1.7rem, 3.2vw, 2.15rem);
  font-weight: 900;
  letter-spacing: -0.035em;
}
.mr-legacy-session-sub {
  margin: 8px auto 0;
  color: #6b7280;
  line-height: 1.55;
}
.mr-legacy-session-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin: 24px 0 13px;
}
.mr-legacy-session-stat {
  padding: 15px 10px;
  border: 1px solid #d1fae5;
  border-radius: 15px;
  background: #fff;
}
.mr-legacy-session-stat span {
  display: block;
  color: #6b7280;
  font-size: 0.78rem;
}
.mr-legacy-session-stat strong {
  display: block;
  margin-top: 5px;
  color: #14532d;
  font-size: 1.25rem;
}
.mr-legacy-session-ratings {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin: 5px 0 18px;
  padding: 9px 13px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #d1fae5;
  color: #475569;
  font-size: 0.83rem;
  font-weight: 800;
}
.mr-legacy-session-note {
  max-width: 560px;
  margin: 0 auto 25px;
  color: #475569;
  line-height: 1.65;
}
.mr-legacy-session-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .mr-legacy-category-grid, .mr-legacy-subdecks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mr-legacy-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .mr-legacy-header-inner {
    padding: 8px 14px;
    gap: 8px;
  }
  .mr-legacy-brand-main {
    font-size: 0.95rem;
  }
  .mr-legacy-main {
    padding: 16px 14px 40px;
  }
  .mr-legacy-hero {
    padding: 22px 18px;
    margin-bottom: 22px;
  }
  .mr-legacy-category-grid, .mr-legacy-subdecks {
    grid-template-columns: 1fr;
  }
  .mr-legacy-metrics {
    grid-template-columns: 1fr;
  }
  .mr-legacy-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .mr-legacy-button, .mr-legacy-actions .mr-legacy-button {
    width: 100%;
    box-sizing: border-box;
  }
}
`

export function MedReviewLegacyStyles() {
  return <style>{legacyCss}</style>
}

type CategoryItem = {
  icon: string
  tag: string
  title: string
  description: string
  count: number
  onClick: () => void
  deckId?: string
  sectionKind?: string
}
type HomeProps = {
  userEmail?: string
  totalCards: number
  reviewTodayCount: number
  masteredPercent: number
  streakDays: number
  categories: CategoryItem[]
  decks: LegacyDeck[]
  cards: LegacyCard[]
  folderKind?: 'tutoria' | 'prova' | 'custom'
  onOpenGroup: (kind: 'tutoria' | 'prova') => void
  onHome: () => void
  onOpenDeck: (deckId: string) => void
  onLibrary: () => void
  onClinical: () => void
  onStudyNow: () => void
  onSessionBuilder: () => void
  onQuiz: () => void
  onNewFolder: () => void
  onLogout: () => void
  onSettings: () => void
  onDashboard: () => void
  onDeckAddCard?: (deckId: string) => void
  onDeckAddSubfolder?: (deckId: string) => void
  onDeckRename?: (deckId: string) => void
  onDeckDelete?: (deckId: string) => void
  onDeckReset?: (deckId: string) => void
  onDeckMove?: (deckId: string) => void
  onDeckClick: (deckId: string) => void | boolean | Promise<void | boolean>
  userDecks: LegacyDeck[]
  onNewFolderIn: (kind: 'tutoria' | 'prova' | 'custom') => void
  onNewFrontlineFolder: () => void
  onSectionMove?: (kind: 'tutoria' | 'prova' | 'custom') => void
  openDeckId?: string
  onOpenAiGenerator?: () => void
  onOpenImageOcclusion?: () => void
  onOpenExamPlan?: (deckId: string, deckTitle: string) => void
  onOpenMasterReports?: () => void
  onOpenMasterAnalytics?: () => void
  onOpenCramMode?: (deckId?: string) => void
  onOpenAnkiImport?: () => void
  onStudyDeck?: (deckId: string) => void
}

export const MedReviewLegacyHome = React.memo(function MedReviewLegacyHome(props: HomeProps) {
  const {
    userEmail,
    totalCards,
    reviewTodayCount,
    masteredPercent,
    streakDays,
    categories,
    decks,
    cards,
    folderKind,
    onHome,
    onOpenDeck,
    onStudyDeck,
    onClinical,
    onStudyNow,
    onSessionBuilder,
    onQuiz,
    onLibrary,
    onLogout,
    onSettings,
    onDashboard,
    onDeckAddCard,
    onDeckAddSubfolder,
    onDeckRename,
    onDeckDelete,
    onDeckMove,
    onDeckClick,
    userDecks,
    onNewFolderIn,
    onNewFrontlineFolder,
    openDeckId,
    onOpenAiGenerator,
    onOpenImageOcclusion,
    onOpenExamPlan,
    onOpenMasterReports,
    onOpenMasterAnalytics,
    reviews,
    onOpenCramMode,
    onOpenAnkiImport,
  } = props
  const isMaster = userEmail === 'gabrielfreitasferrari70@gmail.com'

  const [sortMode, setSortMode] = useState<DeckSortMode>(getDeckSort)
  const [openMenuDeckId, setOpenMenuDeckId] = useState<string | null>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [masterMenuOpen, setMasterMenuOpen] = useState(false)

  useEffect(() => {
    const handleDocClick = () => {
      setOpenMenuDeckId(null)
      setCreateMenuOpen(false)
      setMasterMenuOpen(false)
    }
    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  }, [])

  useEffect(() => {
    const sync = () => setSortMode(getDeckSort())
    window.addEventListener(DECK_SORT_EVENT, sync)
    return () => window.removeEventListener(DECK_SORT_EVENT, sync)
  }, [])

  const folderDecks = (
    openDeckId
      ? decks.filter((d) => d.parent === openDeckId && !d.deleted)
      : folderKind
        ? decks.filter((d) => d.kind === folderKind && !d.parent && !d.deleted)
        : []
  ).sort((a, b) => compareDecks(a, b, sortMode))

  const openDeck = openDeckId ? decks.find((d) => d.id === openDeckId) : null

  // Contador O(N) memoizado por subárvore
  const cardsInSubtree = useMemo(() => {
    const directCounts = new Map<string, number>()
    for (const c of cards) {
      const dId = c.deck || (c as any).deck_id
      if (!c.deleted && dId) {
        directCounts.set(dId, (directCounts.get(dId) || 0) + 1)
      }
    }
    const childrenMap = new Map<string, string[]>()
    for (const d of decks) {
      if (!d.deleted && d.parent) {
        const arr = childrenMap.get(d.parent)
        if (arr) arr.push(d.id)
        else childrenMap.set(d.parent, [d.id])
      }
    }
    const memo = new Map<string, number>()
    const getCount = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!
      let total = directCounts.get(id) || 0
      const kids = childrenMap.get(id) || []
      for (const kid of kids) {
        total += getCount(kid)
      }
      memo.set(id, total)
      return total
    }
    return getCount
  }, [cards, decks])

  const title = openDeck
    ? openDeck.title
    : folderKind === 'prova'
      ? 'Prova de Módulo'
      : folderKind === 'custom'
        ? 'Minhas Pastas'
        : 'Tutoria'
  const description =
    folderKind === 'prova'
      ? 'Bancos de revisão focados para os módulos do curso.'
      : folderKind === 'custom'
        ? 'Suas pastas livres — organização personalizada com subpastas ilimitadas.'
        : 'Casos clínicos integrados e tutorias organizadas com FSRS-5.'

  return (
    <div className="mr-legacy-shell">
      <MedReviewLegacyStyles />
      <header className="mr-legacy-header">
        <div className="mr-legacy-header-inner">
          <div className="mr-legacy-brand" onClick={onHome} role="button" tabIndex={0}>
            <span className="mr-legacy-brand-icon">🩺</span>
            <div className="mr-legacy-brand-title">
              <span className="mr-legacy-brand-main">MedReview</span>
              <span className="mr-legacy-brand-sub">FSRS-5 · Medicina</span>
            </div>
          </div>

          <div className="mr-legacy-header-actions" onClick={(e) => e.stopPropagation()}>
            {isMaster && (
              <div className="mr-legacy-dropdown-wrap">
                <button
                  type="button"
                  className="mr-legacy-button blue"
                  onClick={() => setMasterMenuOpen(!masterMenuOpen)}
                  title="Ferramentas do Docente"
                >
                  🎓 Docente ▾
                </button>
                {masterMenuOpen && (
                  <div className="mr-legacy-menu-popover">
                    <button
                      type="button"
                      onClick={() => {
                        setMasterMenuOpen(false)
                        onOpenMasterAnalytics?.()
                      }}
                    >
                      <span>📊</span> Painel da Turma
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMasterMenuOpen(false)
                        onOpenMasterReports?.()
                      }}
                    >
                      <span>⚠️</span> Erros Reportados
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="mr-legacy-button"
              onClick={onClinical}
              title="Treino de Casos Clínicos"
            >
              📋 Modo Clínico
            </button>

            <button
              type="button"
              className="mr-legacy-button amber"
              onClick={() => onOpenCramMode?.()}
              title="Revisão Intensiva de Véspera de Prova (Cram Mode)"
            >
              ⚡ Véspera
            </button>

            <button
              type="button"
              className="mr-legacy-button"
              onClick={onOpenAnkiImport}
              title="Importar baralhos (.apkg, .colpkg, CSV, JSON)"
            >
              📥 Importar
            </button>

            <div className="mr-legacy-dropdown-wrap">
              <button
                type="button"
                className="mr-legacy-button primary"
                onClick={() => setCreateMenuOpen(!createMenuOpen)}
                title="Criar nova pasta ou cartas"
              >
                ＋ Criar ▾
              </button>
              {createMenuOpen && (
                <div className="mr-legacy-menu-popover">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      onNewFrontlineFolder()
                    }}
                  >
                    <span>📁</span> Nova Pasta
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      onOpenAiGenerator?.()
                    }}
                  >
                    <span>🤖</span> Criar Cartas com IA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false)
                      onOpenImageOcclusion?.()
                    }}
                  >
                    <span>🖼️</span> Oclusão de Imagem
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2 }}>
              <button
                type="button"
                className="mr-legacy-button icon-only"
                onClick={onDashboard}
                title="Dashboard FSRS — estatísticas e heatmap"
                aria-label="Dashboard"
              >
                📈
              </button>
              <button
                type="button"
                className="mr-legacy-button icon-only"
                onClick={onSettings}
                title="Configurações"
                aria-label="Configurações"
              >
                ⚙️
              </button>
              <button
                type="button"
                className="mr-legacy-button"
                onClick={onLogout}
                style={{ color: '#64748b', borderColor: '#e2e8f0', padding: '8px 12px' }}
                title={`Sair de ${userEmail || 'sua conta'}`}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mr-legacy-main">
        {folderKind ? (
          <>
            <nav className="mr-legacy-breadcrumb">
              <button onClick={onHome}>Início</button>
              {(openDeckId
                ? (() => {
                    const chain: { id: string; title: string }[] = []
                    let cur: LegacyDeck | undefined = decks.find((d) => d.id === openDeckId)
                    while (cur) {
                      chain.unshift({ id: cur.id, title: cur.title })
                      const pid = cur.parent
                      cur = pid ? decks.find((d) => d.id === pid) : undefined
                    }
                    return chain
                  })()
                : [{ id: 'section', title }]
              ).map((d, i, arr) => (
                <span key={d.id} style={{ display: 'contents' }}>
                  <span>/</span>
                  {i === arr.length - 1 ? (
                    <strong>{d.title}</strong>
                  ) : (
                    <button onClick={() => onOpenDeck(d.id)}>{d.title}</button>
                  )}
                </span>
              ))}
            </nav>

            <div className="mr-legacy-folder-head">
              <div>
                <h1>
                  {folderKind === 'prova' ? '📝' : folderKind === 'custom' ? '📁' : '🩺'} {title}
                </h1>
                <p>{description}</p>
              </div>
              <div className="mr-legacy-folder-head-actions">
                <select
                  className="mr-legacy-button"
                  value={sortMode}
                  onChange={(e) => setDeckSort(e.target.value as DeckSortMode)}
                  aria-label="Ordenar pastas"
                  title="Ordenar pastas"
                >
                  {DECK_SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      ↕️ {o.label}
                    </option>
                  ))}
                </select>
                <button
                  className="mr-legacy-button primary"
                  onClick={() =>
                    openDeckId ? onDeckAddSubfolder?.(openDeckId) : onNewFolderIn(folderKind)
                  }
                >
                  ＋ Nova Pasta
                </button>
              </div>
            </div>

            {openDeckId && (
              <div className="mr-legacy-folder-manage" aria-label="Gerenciar a pasta aberta">
                <span className="mr-legacy-folder-manage-label">Gerenciar esta pasta</span>
                {cardsInSubtree(openDeckId) > 0 && (
                  <button
                    className="mr-legacy-button primary"
                    onClick={() => (onStudyDeck ? onStudyDeck(openDeckId) : onOpenDeck(openDeckId))}
                    style={{ background: '#16a34a', color: '#fff', fontWeight: 800 }}
                  >
                    ⚡ Estudar ({cardsInSubtree(openDeckId)} cartas)
                  </button>
                )}
                <button
                  className="mr-legacy-button"
                  onClick={() => onOpenExamPlan?.(openDeckId, title)}
                  style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}
                >
                  🎯 Modo Prova (Data-Alvo)
                </button>
                <button className="mr-legacy-button" onClick={() => onDeckRename?.(openDeckId)}>
                  ✏️ Renomear pasta
                </button>
                <button className="mr-legacy-button" onClick={() => onDeckMove?.(openDeckId)}>
                  ➡️ Mover pasta
                </button>
                <button
                  className="mr-legacy-button"
                  style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff' }}
                  onClick={() => onDeckDelete?.(openDeckId)}
                >
                  🗑️ Excluir pasta
                </button>
              </div>
            )}

            {folderDecks.length ? (
              <div className="mr-legacy-subdecks">
                {folderDecks.map((deck) => {
                  const total = cardsInSubtree(deck.id)
                  return (
                    <div
                      key={deck.id}
                      className="mr-legacy-subdeck"
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenDeck(deck.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onOpenDeck(deck.id)
                      }}
                    >
                      <div className="mr-card-top">
                        <span className="mr-card-icon">
                          {folderKind === 'prova' ? '📝' : folderKind === 'custom' ? '📁' : '🩺'}
                        </span>
                        <div className="mr-card-top-right">
                          <span className="mr-legacy-tag">
                            {deck.parent
                              ? 'Subpasta'
                              : folderKind === 'prova'
                                ? 'Módulos'
                                : folderKind === 'custom'
                                  ? 'Pasta livre'
                                  : 'PBL / Tutoria'}
                          </span>
                          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="mr-legacy-subdeck-more-btn"
                              title="Opções da pasta"
                              onClick={() =>
                                setOpenMenuDeckId(openMenuDeckId === deck.id ? null : deck.id)
                              }
                            >
                              ⋯
                            </button>
                            {openMenuDeckId === deck.id && (
                              <div className="mr-legacy-menu-popover">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckAddSubfolder?.(deck.id)
                                  }}
                                >
                                  <span>🗂️</span> Nova subpasta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckRename?.(deck.id)
                                  }}
                                >
                                  <span>✏️</span> Renomear pasta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckMove?.(deck.id)
                                  }}
                                >
                                  <span>➡️</span> Mover pasta
                                </button>
                                <div className="mr-legacy-menu-divider" />
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckDelete?.(deck.id)
                                  }}
                                >
                                  <span>🗑️</span> Excluir pasta
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mr-card-body">
                        <h3>{deck.title}</h3>
                        <p>
                          {deck.mode === 'organizer'
                            ? 'Pasta organizadora — abre e mostra as pastas dentro.'
                            : 'Pasta de estudo — clica e revisa os flashcards com FSRS-5.'}
                        </p>
                      </div>

                      <div className="mr-card-foot">
                        <span className="mr-card-count">📚 {total} cartas</span>
                        <div className="mr-card-foot-actions">
                          <button
                            type="button"
                            title="Revisão intensiva de véspera nesta pasta"
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenCramMode?.(deck.id)
                            }}
                            style={{
                              color: '#b45309',
                              fontWeight: 800,
                              borderColor: '#fde68a',
                              background: '#fffbeb',
                            }}
                          >
                            ⚡ Véspera
                          </button>
                          <button
                            type="button"
                            title="Criar carta nesta pasta"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeckAddCard?.(deck.id)
                            }}
                          >
                            ＋ Carta
                          </button>
                          <span className="mr-card-arrow">→</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {openDeckId && (() => {
              const directCards = cards.filter(
                (c) => (c.deck === openDeckId || (c as any).deck_id === openDeckId) && !c.deleted,
              )
              if (directCards.length === 0) return null
              return (
                <div style={{ marginTop: 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#14532d' }}>
                      📚 Cartas nesta pasta ({directCards.length})
                    </h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="mr-legacy-button primary"
                        onClick={() => (onStudyDeck ? onStudyDeck(openDeckId) : onOpenDeck(openDeckId))}
                        style={{ fontSize: '.82rem', padding: '6px 14px' }}
                      >
                        ⚡ Estudar estas cartas
                      </button>
                      <button
                        className="mr-legacy-button"
                        onClick={() => onDeckAddCard?.(openDeckId)}
                        style={{ fontSize: '.82rem', padding: '6px 14px' }}
                      >
                        ＋ Nova carta
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {directCards.slice(0, 30).map((c, idx) => (
                      <div
                        key={c.id || idx}
                        style={{
                          background: '#fff',
                          border: '1.5px solid #d1fae5',
                          borderRadius: 12,
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1e293b' }}>
                          {c.q.length > 90 ? c.q.slice(0, 90) + '…' : c.q}
                        </div>
                        <div
                          style={{
                            fontSize: '.8rem',
                            color: '#64748b',
                            background: '#f8fafc',
                            padding: '6px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {c.a.length > 100 ? c.a.slice(0, 100) + '…' : c.a}
                        </div>
                      </div>
                    ))}
                  </div>
                  {directCards.length > 30 && (
                    <p
                      style={{
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: '.82rem',
                        marginTop: 10,
                      }}
                    >
                      Mostrando 30 de {directCards.length} cartas. Para gerenciar todas em detalhes,
                      use “Gerenciar pastas”.
                    </p>
                  )}
                </div>
              )
            })()}

            {!folderDecks.length &&
              (!openDeckId ||
                !cards.some(
                  (c) => (c.deck === openDeckId || (c as any).deck_id === openDeckId) && !c.deleted,
                )) && (
                <div className="mr-legacy-empty">
                  {openDeckId
                    ? 'Nenhuma pasta ou carta dentro desta ainda — use "＋ Nova Pasta" ou "＋ Carta" para começar.'
                    : 'Nenhuma pasta nesta seção ainda. Crie uma pasta para começar.'}
                </div>
              )}
          </>
        ) : (
          <>
            <section className="mr-legacy-hero">
              <span className="mr-legacy-badge">✦ Plataforma de Fixação Médica · FSRS-5</span>
              <h1>Bom estudo, futuro colega! 🩺</h1>
              <p className="mr-legacy-copy">
                Revisão médica ativa e repetição espaçada de alta retenção para a faculdade e residência.
              </p>
              <div className="mr-legacy-metrics">
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">⚡</span>
                  <div>
                    <span className="mr-legacy-metric-label">Para revisar hoje</span>
                    <strong className="mr-legacy-metric-value">{reviewTodayCount}</strong>
                  </div>
                </div>
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">📚</span>
                  <div>
                    <span className="mr-legacy-metric-label">Total de cartas</span>
                    <strong className="mr-legacy-metric-value">{totalCards}</strong>
                  </div>
                </div>
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">🎯</span>
                  <div>
                    <span className="mr-legacy-metric-label">Domínio geral</span>
                    <strong className="mr-legacy-metric-value">{masteredPercent}%</strong>
                  </div>
                </div>
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">🗓️</span>
                  <div>
                    <span className="mr-legacy-metric-label">Sequência</span>
                    <strong className="mr-legacy-metric-value">
                      {streakDays} {streakDays === 1 ? 'dia' : 'dias'}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="mr-legacy-actions">
                <button className="mr-legacy-button primary" onClick={onStudyNow}>
                  ⚡ Estudar Agora
                </button>
                <button className="mr-legacy-button" onClick={onSessionBuilder}>
                  🎛️ Montar Sessão
                </button>
                <button className="mr-legacy-button" onClick={onQuiz}>
                  ⏱️ Quiz Rápido
                </button>
                <button className="mr-legacy-button" onClick={onClinical}>
                  📋 Modo Caso Clínico
                </button>
                <button
                  className="mr-legacy-button amber"
                  onClick={() => onOpenCramMode?.()}
                  title="Revisão Intensiva Pré-Prova"
                >
                  ⚡ Véspera de Prova
                </button>
                <button className="mr-legacy-button" onClick={onOpenAnkiImport}>
                  📥 Importar Baralho
                </button>
              </div>
            </section>

            <section>
              <header className="mr-legacy-section-head">
                <div>
                  <h2 className="mr-legacy-section-title">📁 Pastas de Estudo</h2>
                  <p className="mr-legacy-section-sub">
                    Navegue pelas disciplinas, casos clínicos e bancos de revisão
                  </p>
                </div>
                <div className="mr-legacy-folder-head-actions">
                  <button className="mr-legacy-button" onClick={() => onNewFolderIn('custom')}>
                    ＋ Nova Pasta
                  </button>
                  <button className="mr-legacy-button" onClick={onLibrary}>
                    📚 Gerenciar pastas
                  </button>
                </div>
              </header>

              <div className="mr-legacy-category-grid">
                {categories.map((item) => (
                  <div
                    key={item.title}
                    className="mr-legacy-category"
                    role="button"
                    tabIndex={0}
                    onClick={item.onClick}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') item.onClick()
                    }}
                  >
                    <div className="mr-card-top">
                      <span className="mr-card-icon">{item.icon}</span>
                      <div className="mr-card-top-right">
                        <span className="mr-legacy-tag">{item.tag}</span>
                      </div>
                    </div>
                    <div className="mr-card-body">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                    <div className="mr-card-foot">
                      <span className="mr-card-count">📚 {item.count} cartas</span>
                      <div className="mr-card-foot-actions">
                        {item.deckId && (
                          <button
                            type="button"
                            title="Criar carta nesta pasta"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeckAddCard?.(item.deckId!)
                            }}
                          >
                            ＋ Carta
                          </button>
                        )}
                        <span className="mr-card-arrow">→</span>
                      </div>
                    </div>
                  </div>
                ))}

                {userDecks.map((deck) => {
                  const total = cardsInSubtree(deck.id)
                  const icon = deck.kind === 'prova' ? '📝' : '📁'
                  const tag =
                    deck.kind === 'prova'
                      ? 'Módulos'
                      : deck.kind === 'custom'
                        ? 'Pasta livre'
                        : 'PBL / Tutoria'
                  return (
                    <div
                      key={deck.id}
                      className="mr-legacy-category"
                      role="button"
                      tabIndex={0}
                      onClick={() => onDeckClick(deck.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onDeckClick(deck.id)
                      }}
                    >
                      <div className="mr-card-top">
                        <span className="mr-card-icon">{icon}</span>
                        <div className="mr-card-top-right">
                          <span className="mr-legacy-tag">{tag}</span>
                          <div
                            style={{ position: 'relative' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="mr-legacy-subdeck-more-btn"
                              title="Opções da pasta"
                              onClick={() =>
                                setOpenMenuDeckId(openMenuDeckId === deck.id ? null : deck.id)
                              }
                            >
                              ⋯
                            </button>
                            {openMenuDeckId === deck.id && (
                              <div className="mr-legacy-menu-popover">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckAddSubfolder?.(deck.id)
                                  }}
                                >
                                  <span>🗂️</span> Nova subpasta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckRename?.(deck.id)
                                  }}
                                >
                                  <span>✏️</span> Renomear pasta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckMove?.(deck.id)
                                  }}
                                >
                                  <span>➡️</span> Mover pasta
                                </button>
                                <div className="mr-legacy-menu-divider" />
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => {
                                    setOpenMenuDeckId(null)
                                    onDeckDelete?.(deck.id)
                                  }}
                                >
                                  <span>🗑️</span> Excluir pasta
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mr-card-body">
                        <h3>{deck.title}</h3>
                        <p>
                          {deck.description ||
                            'Pasta de revisão médica com repetição espaçada FSRS-5.'}
                        </p>
                      </div>

                      <div className="mr-card-foot">
                        <span className="mr-card-count">📚 {total} cartas</span>
                        <div className="mr-card-foot-actions">
                          <button
                            type="button"
                            title="Criar carta nesta pasta"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeckAddCard?.(deck.id)
                            }}
                          >
                            ＋ Carta
                          </button>
                          <span className="mr-card-arrow">→</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <div style={{ marginTop: 28 }}>
              <StudyHeatmap reviews={reviews || []} cards={cards} />
            </div>
          </>
        )}
      </main>
    </div>
  )
})

type SessionCompleteProps = {
  title: string
  tally: SessionTally
  retention: number
  onRestart: () => void
  onExit: () => void
}
export function MedReviewLegacySessionComplete({
  title,
  tally,
  retention,
  onRestart,
  onExit,
}: SessionCompleteProps) {
  const total = tally.again + tally.hard + tally.good + tally.easy
  const recall = total ? Math.round(((tally.good + tally.easy) * 100) / total) : 0
  const minutes = Math.max(1, Math.round((Date.now() - tally.startMs) / 60000))
  const note =
    total === 0
      ? 'Sessão encerrada antes de avaliar cartas. O FSRS-5 preservou seu progresso.'
      : recall >= 85
        ? 'Excelente evocação ativa! 🔥'
        : recall >= 60
          ? 'Bom trabalho — revise os pontos cegos. 💪'
          : 'Sessão difícil: vale revisitar o conteúdo-fonte. 📖'
  return (
    <div className="mr-legacy-study-page">
      <MedReviewLegacyStyles />
      <header className="mr-legacy-header">
        <div className="mr-legacy-study-top">
          <nav className="mr-legacy-breadcrumb">
            <button onClick={onExit}>Início</button>
            <span>/</span>
            <button onClick={onExit}>Tutoria</button>
            <span>/</span>
            <strong>{title}</strong>
          </nav>
          <div className="mr-legacy-study-controls">
            <button className="mr-legacy-control" onClick={onExit}>
              ✓ Concluído
            </button>
            <button className="mr-legacy-control exit" onClick={onExit}>
              ✕ Sair da sessão
            </button>
          </div>
        </div>
      </header>
      <main className="mr-legacy-study-main">
        <article className="mr-legacy-session">
          <div className="mr-legacy-session-icon">🎉</div>
          <h1>Sessão Concluída!</h1>
          <p className="mr-legacy-session-sub">{title}</p>
          <div className="mr-legacy-session-stats">
            <div className="mr-legacy-session-stat">
              <span>📚 Cartas</span>
              <strong>{total}</strong>
            </div>
            <div className="mr-legacy-session-stat">
              <span>⏱️ Tempo de estudo</span>
              <strong>{minutes} min</strong>
            </div>
            <div className="mr-legacy-session-stat">
              <span>🎯 Evocação</span>
              <strong
                style={{
                  color: recall >= 85 ? '#166534' : recall >= 60 ? '#b45309' : '#b91c1c',
                }}
              >
                {recall}%
              </strong>
            </div>
          </div>
          <div className="mr-legacy-session-ratings" title="Errei · Difícil · Bom · Fácil">
            ❌ {tally.again} · ⚠️ {tally.hard} · ✅ {tally.good} · ⭐ {tally.easy}
          </div>
          <p className="mr-legacy-session-note">
            {note}{' '}
            {total > 0 && (
              <>
                O FSRS-5 recalculou S, D e os próximos intervalos com base na sua retenção alvo (
                {Math.round(retention * 100)}%).
              </>
            )}
          </p>
          <div className="mr-legacy-session-actions">
            <button className="mr-legacy-button primary" onClick={onRestart}>
              🔄 Revisar Novamente
            </button>
            <button className="mr-legacy-button" onClick={onExit}>
              Voltar para Pastas
            </button>
          </div>
        </article>
      </main>
    </div>
  )
}
