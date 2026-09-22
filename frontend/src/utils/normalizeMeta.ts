import type { Question, QuestionPriority } from '../types'

export interface MessageMeta {
  questions: Question[]
  suggestions: string[]
  conflicts: string[]
}

/**
 * Normalizes raw metadata (from database metadata_json, SSE events, or API responses)
 * into strictly-typed and safe MessageMeta objects.
 * Prevents "Objects are not valid as a React child" rendering crashes.
 */
export function normalizeMessageMeta(raw: any): MessageMeta {
  if (!raw || typeof raw !== 'object') {
    return { questions: [], suggestions: [], conflicts: [] }
  }

  // 1. Normalize questions
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : []
  const questions: Question[] = rawQuestions
    .map((q: any) => {
      if (typeof q === 'string') {
        return { text: q.trim(), priority: 'IMPORTANT' as QuestionPriority, category: '' }
      }
      if (q && typeof q === 'object') {
        const text = (q.text || q.question || q.content || '').toString().trim()
        const rawPriority = (q.priority || '').toString().toUpperCase()
        const priority: QuestionPriority = ['BLOCKING', 'IMPORTANT', 'OPTIONAL'].includes(rawPriority)
          ? (rawPriority as QuestionPriority)
          : 'IMPORTANT'
        const category = (q.category || '').toString().trim()
        return { text, priority, category }
      }
      return null
    })
    .filter((q: Question | null): q is Question => Boolean(q && q.text))

  // 2. Normalize suggestions (always extract plain string for display & safety)
  const rawSuggestions = Array.isArray(raw.suggestions) ? raw.suggestions : []
  const suggestions: string[] = rawSuggestions
    .map((s: any) => {
      if (typeof s === 'string') return s.trim()
      if (s && typeof s === 'object') {
        return (s.content || s.text || s.title || s.suggestion || JSON.stringify(s)).toString().trim()
      }
      return String(s || '').trim()
    })
    .filter(Boolean)

  // 3. Normalize conflicts (always extract plain string description)
  const rawConflicts = Array.isArray(raw.conflicts) ? raw.conflicts : []
  const conflicts: string[] = rawConflicts
    .map((c: any) => {
      if (typeof c === 'string') return c.trim()
      if (c && typeof c === 'object') {
        if (c.description) return c.description.toString().trim()
        if (c.requirement_a && c.requirement_b) {
          const detail = c.suggestion ? `: ${c.suggestion}` : ''
          return `${c.requirement_a} vs ${c.requirement_b}${detail}`
        }
        return (c.text || JSON.stringify(c)).toString().trim()
      }
      return String(c || '').trim()
    })
    .filter(Boolean)

  return { questions, suggestions, conflicts }
}
