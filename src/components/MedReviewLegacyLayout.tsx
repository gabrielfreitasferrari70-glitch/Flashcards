import React, { useEffect, useState, useMemo } from 'react'
import { StudyHeatmap } from './StudyHeatmap'
import { launchConfetti } from '@/lib/confetti'
import {
  compareDecks,
  DECK_SORT_EVENT,
  DECK_SORT_OPTIONS,
  getDeckSort,
  setDeckSort,
  type DeckSortMode,
} from '@/lib/deckSort'
import { highlightMatch, normalizeSearchText } from '@/lib/searchUtils'

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
[data-theme="dark"],
.dark {
  --mr-green: #22c55e;
  --mr-dark: #15803d;
  --mr-ink: #4ade80;
  --mr-pale: #0f172a;
  --mr-mint: #1e293b;
  --mr-line: #334155;
  --mr-text: #f8fafc;
  --mr-muted: #94a3b8;
  color-scheme: dark;
}
[data-theme="dark"] body,
.dark body {
  background: #090d16 !important;
  color: #f1f5f9 !important;
}
[data-theme="dark"] .mr-legacy-shell,
[data-theme="dark"].mr-legacy-shell,
.dark .mr-legacy-shell,
.dark.mr-legacy-shell,
[data-theme="dark"] .mr-legacy-study-page,
[data-theme="dark"].mr-legacy-study-page,
.dark .mr-legacy-study-page,
.dark.mr-legacy-study-page {
  background: #090d16 !important;
  color: #f1f5f9 !important;
}

/* Header & Brand */
[data-theme="dark"] .mr-legacy-header,
.dark .mr-legacy-header {
  background: rgba(15, 23, 42, 0.95) !important;
  border-bottom-color: #1e293b !important;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.6) !important;
}
[data-theme="dark"] .mr-legacy-brand-main,
.dark .mr-legacy-brand-main {
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-brand-sub,
.dark .mr-legacy-brand-sub {
  color: #86efac !important;
}
[data-theme="dark"] .mr-legacy-brand-icon,
.dark .mr-legacy-brand-icon {
  background: #1e293b !important;
  box-shadow: inset 0 0 0 1px #334155 !important;
}

/* Hero & Metrics */
[data-theme="dark"] .mr-legacy-hero,
.dark .mr-legacy-hero {
  background: #111827 !important;
  border-color: #1f2937 !important;
  color: #f1f5f9 !important;
  box-shadow: 0 10px 32px -4px rgba(0, 0, 0, 0.4) !important;
}
[data-theme="dark"] .mr-legacy-hero h1,
.dark .mr-legacy-hero h1 {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-copy,
.dark .mr-legacy-copy {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-badge,
.dark .mr-legacy-badge {
  background: rgba(34, 197, 94, 0.15) !important;
  border-color: rgba(34, 197, 94, 0.3) !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-metrics,
.dark .mr-legacy-metrics {
  border-color: #1f2937 !important;
}
[data-theme="dark"] .mr-legacy-metric,
.dark .mr-legacy-metric {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #f1f5f9 !important;
}
[data-theme="dark"] .mr-legacy-metric:hover,
.dark .mr-legacy-metric:hover {
  border-color: #22c55e !important;
}
[data-theme="dark"] .mr-legacy-metric-icon,
.dark .mr-legacy-metric-icon {
  background: #0f172a !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-metric-value,
.dark .mr-legacy-metric-value {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-metric-label,
.dark .mr-legacy-metric-label {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-actions,
.dark .mr-legacy-actions {
  border-top-color: #1f2937 !important;
}

/* Buttons */
[data-theme="dark"] .mr-legacy-button,
.dark .mr-legacy-button {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #e2e8f0 !important;
}
[data-theme="dark"] .mr-legacy-button:hover,
.dark .mr-legacy-button:hover {
  background: #334155 !important;
  border-color: #475569 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-button.primary,
.dark .mr-legacy-button.primary {
  background: linear-gradient(135deg, #16a34a, #15803d) !important;
  border-color: #16a34a !important;
  color: #ffffff !important;
}
[data-theme="dark"] .mr-legacy-button.primary:hover,
.dark .mr-legacy-button.primary:hover {
  background: linear-gradient(135deg, #15803d, #14532d) !important;
}
[data-theme="dark"] .mr-legacy-button.amber,
.dark .mr-legacy-button.amber {
  background: rgba(245, 158, 11, 0.15) !important;
  border-color: rgba(245, 158, 11, 0.3) !important;
  color: #fbbf24 !important;
}
[data-theme="dark"] .mr-legacy-button.amber:hover,
.dark .mr-legacy-button.amber:hover {
  background: rgba(245, 158, 11, 0.25) !important;
  border-color: #f59e0b !important;
}
[data-theme="dark"] .mr-legacy-button.blue,
.dark .mr-legacy-button.blue {
  background: rgba(59, 130, 246, 0.15) !important;
  border-color: rgba(59, 130, 246, 0.3) !important;
  color: #60a5fa !important;
}
[data-theme="dark"] .mr-legacy-button.blue:hover,
.dark .mr-legacy-button.blue:hover {
  background: rgba(59, 130, 246, 0.25) !important;
  border-color: #3b82f6 !important;
}
[data-theme="dark"] .mr-legacy-button.sync,
.dark .mr-legacy-button.sync {
  background: rgba(14, 165, 233, 0.15) !important;
  border-color: rgba(14, 165, 233, 0.35) !important;
  color: #38bdf8 !important;
}
[data-theme="dark"] .mr-legacy-button.sync:hover,
.dark .mr-legacy-button.sync:hover {
  background: rgba(14, 165, 233, 0.28) !important;
  border-color: #0ea5e9 !important;
}
[data-theme="dark"] .mr-legacy-button.sync.is-success,
.dark .mr-legacy-button.sync.is-success {
  background: rgba(34, 197, 94, 0.18) !important;
  border-color: rgba(34, 197, 94, 0.4) !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-button.icon-only,
.dark .mr-legacy-button.icon-only {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-button.icon-only:hover,
.dark .mr-legacy-button.icon-only:hover {
  background: #334155 !important;
  color: #f8fafc !important;
}

/* Sections & Decks */
[data-theme="dark"] .mr-legacy-section-title,
.dark .mr-legacy-section-title {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-section-sub,
.dark .mr-legacy-section-sub {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-category,
.dark .mr-legacy-category,
[data-theme="dark"] .mr-legacy-subdeck,
.dark .mr-legacy-subdeck {
  background: #111827 !important;
  border-color: #1f2937 !important;
  color: #f1f5f9 !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25) !important;
}
[data-theme="dark"] .mr-legacy-category:hover,
.dark .mr-legacy-category:hover,
[data-theme="dark"] .mr-legacy-subdeck:hover,
.dark .mr-legacy-subdeck:hover {
  border-color: #22c55e !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45) !important;
}
[data-theme="dark"] .mr-card-icon,
.dark .mr-card-icon {
  background: #1e293b !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-tag,
.dark .mr-legacy-tag {
  background: rgba(34, 197, 94, 0.15) !important;
  border-color: rgba(34, 197, 94, 0.3) !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-card-body h3,
.dark .mr-card-body h3 {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-card-body p,
.dark .mr-card-body p {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-card-top,
.dark .mr-card-top,
[data-theme="dark"] .mr-card-foot,
.dark .mr-card-foot {
  background: transparent !important;
  border-color: #1f2937 !important;
}
[data-theme="dark"] .mr-card-count,
.dark .mr-card-count {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-card-arrow,
.dark .mr-card-arrow {
  background: #1e293b !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-card-foot-actions button,
.dark .mr-card-foot-actions button {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #e2e8f0 !important;
}
[data-theme="dark"] .mr-card-foot-actions button:hover,
.dark .mr-card-foot-actions button:hover {
  background: #334155 !important;
  border-color: #475569 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-subdeck-more-btn,
.dark .mr-legacy-subdeck-more-btn {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-subdeck-more-btn:hover,
.dark .mr-legacy-subdeck-more-btn:hover {
  background: #334155 !important;
  border-color: #475569 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-menu-popover,
.dark .mr-legacy-menu-popover {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #f8fafc !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
}
[data-theme="dark"] .mr-legacy-menu-popover button,
.dark .mr-legacy-menu-popover button {
  color: #e2e8f0 !important;
}
[data-theme="dark"] .mr-legacy-menu-popover button:hover,
.dark .mr-legacy-menu-popover button:hover {
  background: #334155 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-menu-divider,
.dark .mr-legacy-menu-divider {
  background: #334155 !important;
}

/* Breadcrumbs & Folder Header */
[data-theme="dark"] .mr-legacy-breadcrumb,
.dark .mr-legacy-breadcrumb {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-breadcrumb button,
.dark .mr-legacy-breadcrumb button {
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-breadcrumb strong,
.dark .mr-legacy-breadcrumb strong {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-folder-head h1,
.dark .mr-legacy-folder-head h1 {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-folder-head p,
.dark .mr-legacy-folder-head p {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-folder-manage,
.dark .mr-legacy-folder-manage {
  background: #111827 !important;
  border-color: #1f2937 !important;
}
[data-theme="dark"] .mr-legacy-folder-manage-label,
.dark .mr-legacy-folder-manage-label {
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-empty,
.dark .mr-legacy-empty {
  background: #111827 !important;
  border-color: #334155 !important;
  color: #94a3b8 !important;
}

/* Study View & Flashcards */
[data-theme="dark"] .mr-legacy-study-card,
.dark .mr-legacy-study-card {
  background: #111827 !important;
  border-color: #1f2937 !important;
  color: #f1f5f9 !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4) !important;
}
[data-theme="dark"] .mr-legacy-progress,
.dark .mr-legacy-progress {
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-control,
.dark .mr-legacy-control {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-control:hover,
.dark .mr-legacy-control:hover {
  background: #334155 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-control.exit,
.dark .mr-legacy-control.exit {
  border-color: #334155 !important;
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-control.exit:hover,
.dark .mr-legacy-control.exit:hover {
  background: #334155 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-question,
.dark .mr-legacy-question {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-answer,
.dark .mr-legacy-answer {
  border-top-color: #1f2937 !important;
  color: #f1f5f9 !important;
}
[data-theme="dark"] .mr-legacy-answer strong,
.dark .mr-legacy-answer strong {
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-answer-body,
.dark .mr-legacy-answer-body {
  color: #e2e8f0 !important;
}
[data-theme="dark"] .mr-legacy-hint,
.dark .mr-legacy-hint {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-mode-btn,
.dark .mr-legacy-mode-btn {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-mode-btn:hover,
.dark .mr-legacy-mode-btn:hover {
  background: #334155 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-mode-btn.active,
.dark .mr-legacy-mode-btn.active {
  background: linear-gradient(135deg, #16a34a, #22c55e) !important;
  border-color: #16a34a !important;
  color: #ffffff !important;
}

/* Card Images & Occlusion */
[data-theme="dark"] .mr-legacy-study-card img,
.dark .mr-legacy-study-card img {
  border-color: #334155 !important;
  background: #0f172a !important;
}

/* Cloze tags in Dark Mode */
[data-theme="dark"] .mr-legacy-question span[style*="background:#dcfce7"],
[data-theme="dark"] .mr-legacy-answer-body span[style*="background:#dcfce7"],
.dark .mr-legacy-question span[style*="background:#dcfce7"],
.dark .mr-legacy-answer-body span[style*="background:#dcfce7"] {
  background: rgba(34, 197, 94, 0.2) !important;
  color: #4ade80 !important;
  border-color: #16a34a !important;
}
[data-theme="dark"] .mr-legacy-question span[style*="background:#fef3c7"],
[data-theme="dark"] .mr-legacy-answer-body span[style*="background:#fef3c7"],
.dark .mr-legacy-question span[style*="background:#fef3c7"],
.dark .mr-legacy-answer-body span[style*="background:#fef3c7"] {
  background: rgba(245, 158, 11, 0.2) !important;
  color: #fbbf24 !important;
  border-color: #d97706 !important;
}

/* Dark Mode Overrides for Inlined Content */
[data-theme="dark"] .mr-legacy-answer-body [style*="color:#334155"],
[data-theme="dark"] .mr-legacy-answer-body [style*="color: #334155"],
[data-theme="dark"] .mr-legacy-answer-body [style*="color:#14532d"],
[data-theme="dark"] .mr-legacy-answer-body [style*="color: #14532d"],
[data-theme="dark"] .mr-legacy-answer-body [style*="color:#1e293b"],
[data-theme="dark"] .mr-legacy-answer-body [style*="color: #1e293b"],
.dark .mr-legacy-answer-body [style*="color:#334155"],
.dark .mr-legacy-answer-body [style*="color: #334155"],
.dark .mr-legacy-answer-body [style*="color:#14532d"],
.dark .mr-legacy-answer-body [style*="color: #14532d"],
.dark .mr-legacy-answer-body [style*="color:#1e293b"],
.dark .mr-legacy-answer-body [style*="color: #1e293b"] {
  color: #e2e8f0 !important;
}

/* Modals & Dialogs in Dark Mode */
[data-theme="dark"] .mr-legacy-modal-overlay,
.dark .mr-legacy-modal-overlay {
  background: rgba(0, 0, 0, 0.75) !important;
}
[data-theme="dark"] .mr-legacy-modal-box,
.dark .mr-legacy-modal-box {
  background: #111827 !important;
  border: 1px solid #1f2937 !important;
  color: #f1f5f9 !important;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7) !important;
}
[data-theme="dark"] .mr-legacy-modal-box h3,
[data-theme="dark"] .mr-legacy-modal-box h2,
.dark .mr-legacy-modal-box h3,
.dark .mr-legacy-modal-box h2 {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-modal-box p,
.dark .mr-legacy-modal-box p {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-modal-box label,
.dark .mr-legacy-modal-box label {
  color: #cbd5e1 !important;
}
[data-theme="dark"] .mr-legacy-modal-box input,
[data-theme="dark"] .mr-legacy-modal-box select,
[data-theme="dark"] .mr-legacy-modal-box textarea,
.dark .mr-legacy-modal-box input,
.dark .mr-legacy-modal-box select,
.dark .mr-legacy-modal-box textarea {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-modal-box section,
.dark .mr-legacy-modal-box section {
  background: #1e293b !important;
  border-color: #334155 !important;
}
[data-theme="dark"] .mr-legacy-modal-box strong,
.dark .mr-legacy-modal-box strong {
  color: #4ade80 !important;
}

/* Session Complete in Dark Mode */
[data-theme="dark"] .mr-legacy-session,
.dark .mr-legacy-session {
  background: #111827 !important;
  border-color: #1f2937 !important;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.4) !important;
}
[data-theme="dark"] .mr-legacy-session h1,
.dark .mr-legacy-session h1 {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-session-icon,
.dark .mr-legacy-session-icon {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #4ade80 !important;
  box-shadow: 0 7px 18px rgba(0, 0, 0, 0.3) !important;
}
[data-theme="dark"] .mr-legacy-session-sub,
.dark .mr-legacy-session-sub {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-session-stat,
.dark .mr-legacy-session-stat {
  background: #1e293b !important;
  border-color: #334155 !important;
}
[data-theme="dark"] .mr-legacy-session-stat span,
.dark .mr-legacy-session-stat span {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-session-stat strong,
.dark .mr-legacy-session-stat strong {
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-legacy-session-ratings,
.dark .mr-legacy-session-ratings {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #cbd5e1 !important;
}
[data-theme="dark"] .mr-legacy-session-note,
.dark .mr-legacy-session-note {
  color: #94a3b8 !important;
}

/* Study Heatmap in Dark Mode */
[data-theme="dark"] .mr-legacy-study-heatmap,
.dark .mr-legacy-study-heatmap {
  background: #111827 !important;
  border-color: #1f2937 !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
}
[data-theme="dark"] .mr-legacy-study-heatmap h3,
.dark .mr-legacy-study-heatmap h3 {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-study-heatmap p,
.dark .mr-legacy-study-heatmap p {
  color: #94a3b8 !important;
}
[data-theme="dark"] .mr-legacy-study-heatmap strong,
.dark .mr-legacy-study-heatmap strong {
  color: #4ade80 !important;
}

/* Card Preview in Folder View */
[data-theme="dark"] .mr-legacy-preview-card,
.dark .mr-legacy-preview-card {
  background: #111827 !important;
  border-color: #1f2937 !important;
}
[data-theme="dark"] .mr-legacy-preview-card > div:first-child,
.dark .mr-legacy-preview-card > div:first-child {
  color: #f8fafc !important;
}
[data-theme="dark"] .mr-legacy-preview-card > div:last-child,
.dark .mr-legacy-preview-card > div:last-child {
  background: #0f172a !important;
  color: #94a3b8 !important;
}

/* Multiple Choice & Written Study Mode */
[data-theme="dark"] .mr-legacy-mc-btn,
.dark .mr-legacy-mc-btn {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #f1f5f9 !important;
}
[data-theme="dark"] .mr-legacy-mc-btn:hover,
.dark .mr-legacy-mc-btn:hover {
  background: #334155 !important;
  border-color: #22c55e !important;
}
[data-theme="dark"] .mr-legacy-write-input,
.dark .mr-legacy-write-input {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #f8fafc !important;
}

/* Card Notes in Study Mode */
[data-theme="dark"] .mr-legacy-card-note-box,
.dark .mr-legacy-card-note-box {
  background: #1e293b !important;
  border-color: #334155 !important;
}
[data-theme="dark"] .mr-legacy-card-note-input,
.dark .mr-legacy-card-note-input {
  background: #0f172a !important;
  border-color: #334155 !important;
  color: #f8fafc !important;
}

/* Audio TTS Controls */
[data-theme="dark"] .mr-legacy-tts-btn,
.dark .mr-legacy-tts-btn {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #4ade80 !important;
}

/* Image Occlusion Gabarito & Actions */
[data-theme="dark"] .mr-occlusion-banner,
.dark .mr-occlusion-banner {
  background: rgba(34, 197, 94, 0.12) !important;
  border-color: rgba(34, 197, 94, 0.35) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3) !important;
}
[data-theme="dark"] .mr-occlusion-banner strong,
.dark .mr-occlusion-banner strong {
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-occlusion-banner span,
.dark .mr-occlusion-banner span {
  color: #86efac !important;
}
[data-theme="dark"] .mr-occlusion-btn,
.dark .mr-occlusion-btn {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #4ade80 !important;
}
[data-theme="dark"] .mr-occlusion-btn:hover,
.dark .mr-occlusion-btn:hover {
  background: #334155 !important;
  color: #f8fafc !important;
}

/* Cloze Badges */
.mr-cloze-revealed {
  background: #dcfce7;
  color: #14532d;
  font-weight: 800;
  border-radius: 6px;
  padding: 2px 8px;
  border: 1px solid #86efac;
  box-shadow: 0 1px 3px rgba(22, 163, 74, 0.15);
}
.mr-cloze-hidden {
  background: #fef3c7;
  color: #b45309;
  font-weight: 800;
  border-radius: 6px;
  padding: 2px 8px;
  border: 1.5px dashed #f59e0b;
  cursor: pointer;
  display: inline-block;
}
[data-theme="dark"] .mr-cloze-revealed,
.dark .mr-cloze-revealed {
  background: rgba(34, 197, 94, 0.22) !important;
  color: #4ade80 !important;
  border-color: rgba(34, 197, 94, 0.5) !important;
}
[data-theme="dark"] .mr-cloze-hidden,
.dark .mr-cloze-hidden {
  background: rgba(245, 158, 11, 0.22) !important;
  color: #fbbf24 !important;
  border-color: rgba(245, 158, 11, 0.5) !important;
}

/* Zero-Lag Click Responsiveness & Tactile Touch */
button, [role="button"], a, input, select, textarea, .mr-legacy-button, .mr-legacy-control, .mr-legacy-mode-btn, .mr-legacy-category, .mr-legacy-subdeck {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
button:active:not(:disabled), [role="button"]:active {
  transform: scale(0.97);
  transition: transform 0.05s ease;
}
.mr-legacy-button:active:not(:disabled) {
  transform: scale(0.96) !important;
}
.mr-legacy-control:active:not(:disabled) {
  transform: scale(0.94) !important;
}
.mr-legacy-mode-btn:active:not(:disabled) {
  transform: scale(0.94) !important;
}
.mr-legacy-category:active, .mr-legacy-subdeck:active {
  transform: scale(0.985) !important;
}
.mr-legacy-rating-row button:active:not(:disabled) {
  transform: scale(0.95) !important;
  filter: brightness(0.92) !important;
}
mark {
  color: #0f172a !important;
  font-weight: 600 !important;
}
[data-theme="dark"] mark, .dark mark {
  color: #020617 !important;
  font-weight: 700 !important;
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
  max-width: 1240px;
  min-height: 64px;
  margin: 0 auto;
  padding: 8px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.mr-legacy-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
  text-decoration: none;
  flex-shrink: 0;
}
.mr-legacy-brand-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #dcfce7, #bbf7d0);
  font-size: 20px;
  box-shadow: inset 0 0 0 1px #86efac;
}
.mr-legacy-brand-title {
  display: flex;
  flex-direction: column;
}
.mr-legacy-brand-main {
  font-size: 1.02rem;
  font-weight: 900;
  color: #14532d;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.mr-legacy-brand-sub {
  font-size: 0.66rem;
  font-weight: 700;
  color: #16a34a;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.mr-legacy-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-end;
}
.mr-legacy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 35px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  padding: 6px 11px;
  color: #334155;
  background: #ffffff;
  font: 700 0.8rem Inter, system-ui, sans-serif;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.16s ease;
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
.mr-legacy-button.sync {
  color: #0369a1;
  border-color: #7dd3fc;
  background: #f0f9ff;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}
.mr-legacy-button.sync:hover {
  background: #e0f2fe;
  border-color: #38bdf8;
  color: #0284c7;
}
.mr-legacy-button.sync.is-success {
  color: #15803d !important;
  border-color: #86efac !important;
  background: #f0fdf4 !important;
}
.mr-legacy-button.sync.is-syncing {
  opacity: 0.85;
  cursor: wait;
}
.mr-legacy-button.sync .sync-icon {
  display: inline-block;
  transition: transform 0.3s ease;
}
.mr-legacy-button.sync .sync-icon.spinning {
  animation: mrSpinSync 0.8s linear infinite;
}
@keyframes mrSpinSync {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
  align-items: stretch;
}
.mr-legacy-category, .mr-legacy-subdeck {
  display: flex;
  flex-direction: column;
  min-height: 220px;
  padding: 22px 20px 18px;
  border: 1.5px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  position: relative;
  box-sizing: border-box;
}
.mr-legacy-category::before, .mr-legacy-subdeck::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #16a34a, #22c55e, #4ade80);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
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
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  font-size: 22px;
}
.mr-card-top-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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
  margin: 14px 0 16px;
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
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  flex-wrap: wrap;
  box-sizing: border-box;
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
  white-space: nowrap;
  flex-shrink: 0;
}
.mr-card-foot-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
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
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.mr-card-foot-actions button:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}
.mr-card-arrow {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #f0fdf4;
  color: #15803d;
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
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
  padding: 10px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mr-legacy-back-link {
  border: none;
  background: transparent;
  color: #15803d;
  font-weight: 800;
  font-size: 0.88rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 8px;
  transition: all 0.15s ease;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mr-legacy-back-link:hover {
  background: #f0fdf4;
  color: #16a34a;
}
.mr-legacy-counter-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 999px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  font-size: 0.82rem;
  font-weight: 800;
}
.mr-legacy-study-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mr-legacy-control {
  border: 1px solid #bbf7d0;
  border-radius: 9px;
  padding: 6px 10px;
  background: #fff;
  color: #15803d;
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  transition: all 0.15s ease;
  user-select: none;
}
.mr-legacy-control:hover {
  background: #f0fdf4;
  border-color: #86efac;
}
.mr-legacy-control.exit {
  border-color: #e2e8f0;
  color: #64748b;
  background: #f8fafc;
}
.mr-legacy-control.exit:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}
.mr-legacy-control.order-btn {
  background: #f0fdf4;
  border-color: #86efac;
  color: #15803d;
  font-weight: 800;
}
.mr-legacy-font-stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.mr-legacy-font-stepper button {
  border: none;
  background: transparent;
  padding: 5px 7px;
  font-size: 0.74rem;
  font-weight: 800;
  color: #334155;
  cursor: pointer;
}
.mr-legacy-font-stepper button:first-child {
  border-right: 1px solid #e2e8f0;
}
.mr-legacy-study-main {
  max-width: 960px;
  margin: 0 auto;
  padding: 8px 18px 45px;
}
/* Barra integrada de comandos de estudo */
.mr-study-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 8px;
  flex-wrap: wrap;
}
.mr-study-modes {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 10px;
}
[data-theme="dark"] .mr-study-modes,
.dark .mr-study-modes {
  background: #1e293b;
}
.mr-study-modes button {
  border: none;
  background: transparent;
  color: #64748b;
  padding: 6px 11px;
  border-radius: 8px;
  font: 700 0.77rem Inter, system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.mr-study-modes button.active {
  background: #fff;
  color: #16a34a;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
[data-theme="dark"] .mr-study-modes button.active,
.dark .mr-study-modes button.active {
  background: #0f172a;
  color: #4ade80;
}
.mr-study-meta-cluster {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.mr-study-card-tag {
  color: #15803d;
  font-size: 0.8rem;
  font-weight: 800;
}
.mr-study-tool-pill {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  padding: 4px 9px;
  border-radius: 8px;
  font: 700 0.74rem Inter, system-ui, sans-serif;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.mr-study-tool-pill:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}
.mr-study-progress-container {
  width: 100%;
  height: 5px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 12px;
}
[data-theme="dark"] .mr-study-progress-container,
.dark .mr-study-progress-container {
  background: #334155;
}
.mr-study-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #16a34a, #22c55e);
  border-radius: 999px;
  transition: width 0.25s ease;
}
.mr-legacy-study-card {
  background: #fff;
  border: 1.5px solid #d1fae5;
  border-radius: 18px;
  padding: clamp(16px, 3vw, 32px);
  box-shadow: 0 8px 26px rgba(20, 83, 45, 0.06);
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.mr-legacy-study-card:hover {
  box-shadow: 0 12px 34px rgba(20, 83, 45, 0.09);
}
/* Cabeçalho interno compacto da carta */
.mr-card-internal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.mr-card-badges-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.mr-card-tools-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.mr-highlighter-cluster {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 3px 6px;
  border-radius: 8px;
}
.mr-highlighter-cluster button {
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  cursor: pointer;
  font-size: 0.75rem;
}
.mr-tts-btn {
  border: 1.5px solid #86efac;
  background: #f0fdf4;
  color: #15803d;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 0.74rem;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.mr-tts-btn:hover {
  background: #dcfce7;
}
.mr-legacy-question {
  margin: 10px 0 0;
  color: #1f2937;
  font-size: calc(clamp(1.15rem, 2.3vw, 1.5rem) * var(--mr-font-scale, 1));
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
  font-size: calc(1rem * var(--mr-font-scale, 1));
  line-height: 1.7;
}
/* Animação 3D de virar o cartão */
.mr-flip-scene {
  perspective: 1800px;
}
.mr-flip-inner {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
}
.mr-flip-inner.is-flipped {
  transform: rotateY(180deg);
}
.mr-flip-face {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.mr-flip-back {
  transform: rotateY(180deg);
}
/* A face oculta fica sobreposta (fora do fluxo) para não alterar a altura do cartão */
.mr-flip-inner:not(.is-flipped) .mr-flip-back {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.mr-flip-inner.is-flipped .mr-flip-front {
  position: absolute;
  inset: 0;
  width: 100%;
  pointer-events: none;
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

/* MODALS BASE */
.mr-legacy-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000 !important;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
  font-family: Inter, system-ui, sans-serif;
  box-sizing: border-box;
}
.mr-legacy-modal-box {
  background: #ffffff;
  border-radius: 20px;
  padding: 24px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.35);
  border: 1px solid #e2e8f0;
  position: relative;
  box-sizing: border-box;
}

/* PREVIEW CARDS */
.mr-legacy-preview-card {
  background: #ffffff;
  border: 1.5px solid #d1fae5;
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.mr-legacy-preview-card:hover {
  transform: translateY(-2px);
  border-color: #86efac;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .mr-legacy-category-grid, .mr-legacy-subdecks {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }
  .mr-legacy-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mr-legacy-header-inner {
    padding: 8px 14px;
    gap: 8px;
    min-height: 56px;
  }
  .mr-legacy-header-actions {
    gap: 4px;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    max-width: 100%;
    padding-bottom: 2px;
  }
  .mr-legacy-header-actions::-webkit-scrollbar {
    display: none;
  }
  .mr-legacy-button {
    min-height: 32px;
    padding: 5px 9px;
    font-size: 0.74rem;
  }
  .mr-legacy-button.icon-only {
    width: 32px;
    min-width: 32px;
  }
}
@media (max-width: 640px) {
  .mr-legacy-brand-main {
    font-size: 0.95rem;
  }
  .mr-legacy-main {
    padding: 16px 14px 40px;
  }
  .mr-legacy-hero {
    padding: 20px 16px;
    margin-bottom: 20px;
  }
  .mr-legacy-category-grid, .mr-legacy-subdecks {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .mr-legacy-metrics {
    grid-template-columns: 1fr;
  }
  .mr-legacy-actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .mr-legacy-actions .mr-legacy-button {
    width: 100%;
    box-sizing: border-box;
  }
  .mr-legacy-study-top {
    padding: 8px 12px;
    gap: 8px;
  }
  .mr-legacy-study-controls {
    gap: 4px;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    max-width: 70vw;
  }
  .mr-legacy-study-controls::-webkit-scrollbar {
    display: none;
  }
  .mr-legacy-study-main {
    padding: 6px 10px 30px;
  }
  .mr-legacy-study-card {
    padding: 16px 14px;
    border-radius: 16px;
  }
  .mr-legacy-control {
    padding: 5px 8px;
    font-size: 0.74rem;
  }
  .mr-legacy-back-link {
    font-size: 0.8rem;
    max-width: 140px;
  }
  .mr-study-header-bar {
    gap: 6px;
    margin: 4px 0 6px;
  }
  .mr-study-modes button {
    padding: 5px 8px;
    font-size: 0.72rem;
  }
  .mr-study-tool-pill {
    padding: 3px 7px;
    font-size: 0.7rem;
  }
  .mr-card-internal-header {
    gap: 6px;
    margin-bottom: 8px;
  }
  .mr-legacy-rating-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin-top: 12px;
  }
}
@media (max-width: 440px) {
  .mr-legacy-rating-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
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
  onNewFolder?: () => void
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
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
  onStudyLeeches?: () => void
  leechCount?: number
  isOnline?: boolean
  pendingOfflineReviews?: number
  canInstallPwa?: boolean
  onInstallPwa?: () => void
  onExportBackup?: () => void
  reviews?: any[]
  onStudyCards?: (cards: LegacyCard[], title: string) => void
  onSync?: () => Promise<void> | void
  isSyncing?: boolean
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
    theme = 'light',
    onToggleTheme,
    onStudyLeeches,
    leechCount = 0,
    isOnline = true,
    pendingOfflineReviews = 0,
    canInstallPwa = false,
    onInstallPwa,
    onExportBackup,
    onStudyCards,
    onSync,
    isSyncing: externalSyncing,
  } = props
  const isMaster = userEmail === 'gabrielfreitasferrari70@gmail.com'

  const [localSyncing, setLocalSyncing] = useState(false)
  const [syncSuccess, setSyncSuccess] = useState(false)
  const isSyncingActive = !!(externalSyncing || localSyncing)

  const handleSync = async () => {
    if (isSyncingActive) return
    setLocalSyncing(true)
    setSyncSuccess(false)
    try {
      if (onSync) {
        await onSync()
      }
      setSyncSuccess(true)
      setTimeout(() => setSyncSuccess(false), 2500)
    } catch (err) {
      console.warn('Erro ao sincronizar:', err)
    } finally {
      setLocalSyncing(false)
    }
  }

  const [sortMode, setSortMode] = useState<DeckSortMode>(getDeckSort)
  const [openMenuDeckId, setOpenMenuDeckId] = useState<string | null>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [masterMenuOpen, setMasterMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const handleDocClick = () => {
      setOpenMenuDeckId(null)
      setCreateMenuOpen(false)
      setMasterMenuOpen(false)
      setMoreMenuOpen(false)
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

  const [searchCardLimit, setSearchCardLimit] = useState(30)
  const [searchScopeTab, setSearchScopeTab] = useState<'all' | 'decks' | 'cards'>('all')

  const normalizedQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery])

  const matchingDecks = useMemo(() => {
    if (!normalizedQuery) return []
    return decks.filter(
      (d) =>
        !d.deleted &&
        (normalizeSearchText(d.title).includes(normalizedQuery) ||
          normalizeSearchText(d.description).includes(normalizedQuery)),
    )
  }, [decks, normalizedQuery])

  const matchingCards = useMemo(() => {
    if (!normalizedQuery) return []
    const deckMap = new Map(decks.map((d) => [d.id, d.title]))
    return cards.filter((c) => {
      if (c.deleted) return false
      const qNorm = normalizeSearchText(c.q)
      const aNorm = normalizeSearchText(c.a)
      const gNorm = normalizeSearchText(c.group)
      const dNorm = normalizeSearchText(deckMap.get(c.deck))
      return (
        qNorm.includes(normalizedQuery) ||
        aNorm.includes(normalizedQuery) ||
        gNorm.includes(normalizedQuery) ||
        dNorm.includes(normalizedQuery)
      )
    })
  }, [cards, decks, normalizedQuery])

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

            {onSync && (
              <button
                type="button"
                className={`mr-legacy-button sync ${syncSuccess ? 'is-success' : ''} ${isSyncingActive ? 'is-syncing' : ''}`}
                onClick={handleSync}
                disabled={isSyncingActive}
                title="Sincronizar baralhos com a nuvem e transmitir novos flashcards para todos os alunos"
                aria-label="Sincronizar flashcards"
              >
                <span className={`sync-icon ${isSyncingActive ? 'spinning' : ''}`}>
                  {syncSuccess ? '✓' : '🔄'}
                </span>
                <span>
                  {isSyncingActive ? 'Sincronizando...' : syncSuccess ? 'Sincronizado!' : 'Sincronizar'}
                </span>
              </button>
            )}

            <button
              type="button"
              className="mr-legacy-button amber"
              onClick={() => onOpenCramMode?.()}
              title="Revisão Intensiva de Véspera de Prova (Cram Mode)"
            >
              ⚡ Véspera
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

            <div className="mr-legacy-dropdown-wrap">
              <button
                type="button"
                className="mr-legacy-button"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                title="Mais ferramentas e importação"
              >
                🛠️ Mais ▾
              </button>
              {moreMenuOpen && (
                <div className="mr-legacy-menu-popover">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      onClinical()
                    }}
                  >
                    <span>📋</span> Modo Clínico
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      onOpenAnkiImport?.()
                    }}
                  >
                    <span>📥</span> Importar Baralho (.apkg)
                  </button>
                  {onExportBackup && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false)
                        onExportBackup()
                      }}
                    >
                      <span>💾</span> Fazer Backup (.json)
                    </button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2, flexShrink: 0 }}>
              {!isOnline && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: '#fef3c7',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                    fontSize: '.75rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                  title="Você está estudando offline. Suas revisões serão sincronizadas automaticamente ao reconectar."
                >
                  📡 Offline {pendingOfflineReviews > 0 ? `(${pendingOfflineReviews})` : ''}
                </span>
              )}
              {onInstallPwa && canInstallPwa && (
                <button
                  type="button"
                  className="mr-legacy-button"
                  onClick={onInstallPwa}
                  title="Instalar MedReview como aplicativo no celular ou computador"
                  style={{
                    background: '#f0fdf4',
                    borderColor: '#86efac',
                    color: '#15803d',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  📱 App
                </button>
              )}
              {onToggleTheme && (
                <button
                  type="button"
                  className="mr-legacy-button icon-only"
                  onClick={onToggleTheme}
                  title={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
                  aria-label="Alternar tema"
                >
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
              )}
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
                onClick={(e) => {
                  e.stopPropagation()
                  onSettings()
                }}
                title="Configurações"
                aria-label="Configurações"
              >
                ⚙️
              </button>
              <button
                type="button"
                className="mr-legacy-button"
                onClick={onLogout}
                style={{ color: '#64748b', borderColor: '#e2e8f0', padding: '6px 11px' }}
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
                          <div
                            style={{ position: 'relative', zIndex: openMenuDeckId === deck.id ? 70 : 1 }}
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
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--mr-text, #14532d)' }}>
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
                        className="mr-legacy-preview-card"
                      >
                        <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--mr-text, #1e293b)' }}>
                          {c.q.length > 90 ? c.q.slice(0, 90) + '…' : c.q}
                        </div>
                        <div
                          style={{
                            fontSize: '.8rem',
                            color: 'var(--mr-muted, #64748b)',
                            background: 'var(--mr-pale, #f8fafc)',
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

              <div style={{ marginTop: 22 }}>
                <StudyHeatmap reviews={reviews || []} cards={cards} />
              </div>

              <div className="mr-legacy-actions">
                <button className="mr-legacy-button primary" onClick={onStudyNow}>
                  ⚡ Estudar Agora
                </button>
                <button className="mr-legacy-button" onClick={onSessionBuilder}>
                  🎛️ Montar Sessão
                </button>
                {onSync && (
                  <button
                    type="button"
                    className={`mr-legacy-button sync ${syncSuccess ? 'is-success' : ''} ${isSyncingActive ? 'is-syncing' : ''}`}
                    onClick={handleSync}
                    disabled={isSyncingActive}
                    title="Forçar sincronização com a nuvem e transmitir novidades para todos os alunos"
                  >
                    <span className={`sync-icon ${isSyncingActive ? 'spinning' : ''}`}>
                      {syncSuccess ? '✓' : '🔄'}
                    </span>
                    <span>
                      {isSyncingActive ? 'Sincronizando...' : syncSuccess ? 'Sincronizado!' : 'Sincronizar'}
                    </span>
                  </button>
                )}
                {onStudyLeeches && (
                  <button
                    type="button"
                    className="mr-legacy-button"
                    onClick={onStudyLeeches}
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      color: '#ef4444',
                      fontWeight: 800,
                    }}
                    title="Revisar cartas em que você mais errou"
                  >
                    🩸 Cartas Críticas {leechCount > 0 ? `(${leechCount})` : ''}
                  </button>
                )}
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
                {onExportBackup && (
                  <button className="mr-legacy-button" onClick={onExportBackup} title="Exportar Backup Completo">
                    💾 Fazer Backup
                  </button>
                )}
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

              <div style={{ margin: '14px 0 20px', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Buscar pasta médica, tema ou disciplina (ex: Músculos, Neuro, Cardiorrespiratório)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 18px 12px 42px',
                    borderRadius: 14,
                    border: '1.5px solid #cbd5e1',
                    background: 'var(--mr-pale, #fff)',
                    fontSize: '.95rem',
                    color: 'var(--mr-text, #1e293b)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '1.05rem',
                    pointerEvents: 'none',
                  }}
                >
                  🔍
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'none',
                      color: '#94a3b8',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                    title="Limpar busca"
                  >
                    ✕
                  </button>
                )}
              </div>

              {searchQuery.trim() && (
                <div style={{ marginBottom: 32 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '.95rem', color: 'var(--mr-text, #1e293b)', fontWeight: 800 }}>
                        Resultados para &ldquo;{searchQuery}&rdquo;
                      </div>
                      <div style={{ fontSize: '.8rem', color: 'var(--mr-muted, #64748b)', marginTop: 2 }}>
                        {matchingDecks.length} {matchingDecks.length === 1 ? 'pasta' : 'pastas'} · {matchingCards.length} {matchingCards.length === 1 ? 'flashcard' : 'flashcards'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setSearchScopeTab('all')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 8,
                          fontSize: '.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: searchScopeTab === 'all' ? '1.5px solid var(--mr-green, #16a34a)' : '1px solid #cbd5e1',
                          background: searchScopeTab === 'all' ? 'var(--mr-pale, #f0fdf4)' : 'transparent',
                          color: searchScopeTab === 'all' ? 'var(--mr-ink, #15803d)' : 'var(--mr-muted, #64748b)',
                        }}
                      >
                        Tudo ({matchingDecks.length + matchingCards.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSearchScopeTab('decks')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 8,
                          fontSize: '.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: searchScopeTab === 'decks' ? '1.5px solid var(--mr-green, #16a34a)' : '1px solid #cbd5e1',
                          background: searchScopeTab === 'decks' ? 'var(--mr-pale, #f0fdf4)' : 'transparent',
                          color: searchScopeTab === 'decks' ? 'var(--mr-ink, #15803d)' : 'var(--mr-muted, #64748b)',
                        }}
                      >
                        Pastas ({matchingDecks.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSearchScopeTab('cards')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 8,
                          fontSize: '.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: searchScopeTab === 'cards' ? '1.5px solid var(--mr-green, #16a34a)' : '1px solid #cbd5e1',
                          background: searchScopeTab === 'cards' ? 'var(--mr-pale, #f0fdf4)' : 'transparent',
                          color: searchScopeTab === 'cards' ? 'var(--mr-ink, #15803d)' : 'var(--mr-muted, #64748b)',
                        }}
                      >
                        Flashcards ({matchingCards.length})
                      </button>
                    </div>
                  </div>

                  {matchingCards.length > 0 && onStudyCards && (
                    <div
                      style={{
                        padding: '12px 16px',
                        background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                        borderRadius: 14,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                        marginBottom: 18,
                        boxShadow: '0 4px 14px rgba(22,163,74,0.25)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '.92rem' }}>
                          ⚡ Estudo Focado com o Resultado da Busca
                        </div>
                        <div style={{ fontSize: '.78rem', opacity: 0.9, marginTop: 2 }}>
                          Pratique instantaneamente todos os {matchingCards.length} flashcards contendo &ldquo;{searchQuery}&rdquo;.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onStudyCards(matchingCards, `Busca: "${searchQuery}"`)}
                        style={{
                          background: '#fff',
                          color: '#15803d',
                          border: 'none',
                          borderRadius: 9,
                          padding: '8px 16px',
                          fontSize: '.82rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                        }}
                      >
                        ▶ Iniciar Estudo ({matchingCards.length})
                      </button>
                    </div>
                  )}

                  {matchingDecks.length === 0 && matchingCards.length === 0 ? (
                    <div className="mr-legacy-empty" style={{ padding: '36px 16px', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '.95rem' }}>
                        Nenhum resultado encontrado para &ldquo;{searchQuery}&rdquo;.
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: '.84rem', color: 'var(--mr-muted, #64748b)' }}>
                        Verifique a digitação ou tente termos mais amplos (ex: &ldquo;músculo&rdquo;, &ldquo;neuro&rdquo;, &ldquo;fármaco&rdquo;).
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Pastas correspondentes */}
                      {(searchScopeTab === 'all' || searchScopeTab === 'decks') && matchingDecks.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                          <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--mr-ink, #15803d)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
                            📁 Pastas Médicas ({matchingDecks.length})
                          </div>
                          <div className="mr-legacy-category-grid">
                            {matchingDecks.map((deck) => {
                              const total = cardsInSubtree(deck.id)
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
                                    <span className="mr-card-icon">📂</span>
                                    <div className="mr-card-top-right">
                                      <span className="mr-legacy-tag">Pasta</span>
                                    </div>
                                  </div>
                                  <div className="mr-card-body">
                                    <h3>{highlightMatch(deck.title, searchQuery)}</h3>
                                    <p>{deck.description ? highlightMatch(deck.description, searchQuery) : 'Pasta do acervo médico MedReview.'}</p>
                                  </div>
                                  <div className="mr-card-foot">
                                    <span className="mr-card-count">📚 {total} cartas</span>
                                    <div className="mr-card-foot-actions">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (onStudyDeck) onStudyDeck(deck.id)
                                          else onDeckClick(deck.id)
                                        }}
                                        style={{ background: '#16a34a', color: '#fff', border: 'none', fontWeight: 800 }}
                                      >
                                        ⚡ Estudar
                                      </button>
                                      <span className="mr-card-arrow">→</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Flashcards correspondentes */}
                      {(searchScopeTab === 'all' || searchScopeTab === 'cards') && matchingCards.length > 0 && (
                        <div>
                          <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--mr-ink, #15803d)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
                            🃏 Flashcards Médicos ({matchingCards.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {matchingCards.slice(0, searchCardLimit).map((card) => {
                              const deckObj = decks.find((d) => d.id === card.deck)
                              return (
                                <div
                                  key={card.id}
                                  style={{
                                    border: '1px solid var(--mr-line, #e2e8f0)',
                                    borderRadius: 14,
                                    padding: '12px 16px',
                                    background: 'var(--mr-pale, #fff)',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 14,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 240 }}>
                                    {deckObj && (
                                      <div style={{ marginBottom: 6 }}>
                                        <span
                                          onClick={() => onDeckClick(deckObj.id)}
                                          role="button"
                                          tabIndex={0}
                                          style={{
                                            background: 'var(--mr-mint, #f1f5f9)',
                                            color: 'var(--mr-text, #334155)',
                                            border: '1px solid var(--mr-line, #e2e8f0)',
                                            padding: '2px 8px',
                                            borderRadius: 6,
                                            fontSize: '.72rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                          }}
                                          title="Clique para ir até esta pasta"
                                        >
                                          📁 {deckObj.title}
                                        </span>
                                      </div>
                                    )}
                                    <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--mr-text, #1e293b)', lineHeight: 1.4 }}>
                                      {highlightMatch(card.q, searchQuery)}
                                    </div>
                                    {card.a && (
                                      <div style={{ fontSize: '.82rem', color: 'var(--mr-muted, #64748b)', marginTop: 4, lineHeight: 1.4 }}>
                                        <strong style={{ color: 'var(--mr-ink, #15803d)' }}>R: </strong>
                                        {highlightMatch(card.a.length > 200 ? card.a.slice(0, 200) + '…' : card.a, searchQuery)}
                                      </div>
                                    )}
                                    {card.group && (
                                      <div style={{ marginTop: 6 }}>
                                        <span
                                          style={{
                                            background: 'rgba(22,163,74,0.1)',
                                            color: 'var(--mr-ink, #15803d)',
                                            padding: '2px 8px',
                                            borderRadius: 999,
                                            fontSize: '.7rem',
                                            fontWeight: 700,
                                          }}
                                        >
                                          {highlightMatch(card.group, searchQuery)}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                    {onStudyCards && (
                                      <button
                                        type="button"
                                        onClick={() => onStudyCards([card], `Card: ${card.q.slice(0, 30)}`)}
                                        style={{
                                          background: 'var(--mr-green, #16a34a)',
                                          color: '#fff',
                                          border: 'none',
                                          borderRadius: 8,
                                          padding: '6px 12px',
                                          fontSize: '.75rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        ⚡ Praticar
                                      </button>
                                    )}
                                    {deckObj && (
                                      <button
                                        type="button"
                                        onClick={() => onDeckClick(deckObj.id)}
                                        style={{
                                          background: 'transparent',
                                          color: 'var(--mr-muted, #64748b)',
                                          border: '1px solid var(--mr-line, #cbd5e1)',
                                          borderRadius: 8,
                                          padding: '6px 10px',
                                          fontSize: '.75rem',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        Abrir pasta
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {matchingCards.length > searchCardLimit && (
                            <div style={{ textAlign: 'center', marginTop: 14 }}>
                              <button
                                type="button"
                                onClick={() => setSearchCardLimit((l) => l + 30)}
                                style={{
                                  background: 'transparent',
                                  border: '1.5px solid var(--mr-line, #cbd5e1)',
                                  borderRadius: 10,
                                  padding: '8px 18px',
                                  fontSize: '.82rem',
                                  fontWeight: 700,
                                  color: 'var(--mr-ink, #15803d)',
                                  cursor: 'pointer',
                                }}
                              >
                                Exibir mais ({matchingCards.length - searchCardLimit} restantes)
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

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
                            style={{ position: 'relative', zIndex: openMenuDeckId === deck.id ? 70 : 1 }}
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
  useEffect(() => {
    launchConfetti()
  }, [])

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
