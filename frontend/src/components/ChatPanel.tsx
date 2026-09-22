import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, AlertTriangle, Lightbulb, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { sendMessage, getMessages, createRequirement } from '../api/planner'
import type { Message, Question, QuestionPriority } from '../types'
import { Check, Plus } from 'lucide-react'
import { normalizeMessageMeta } from '../utils/normalizeMeta'

// GODKILLER-ZERO Loop Breaker: ถ้า loading นานเกิน 45 วินาที auto-reset
const CHAT_TIMEOUT_MS = 45_000

// Typing indicator component
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400" />
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400" />
      <span className="typing-dot w-2 h-2 rounded-full bg-gray-400" />
    </div>
  )
}

// Question priority styling
function questionBorderClass(priority: QuestionPriority): string {
  switch (priority) {
    case 'BLOCKING':
      return 'border-red-500/60 bg-red-950/30'
    case 'IMPORTANT':
      return 'border-yellow-500/60 bg-yellow-950/20'
    case 'OPTIONAL':
      return 'border-gray-600/60 bg-gray-800/30'
  }
}

function questionLabelClass(priority: QuestionPriority): string {
  switch (priority) {
    case 'BLOCKING':
      return 'text-red-400 bg-red-900/40'
    case 'IMPORTANT':
      return 'text-yellow-400 bg-yellow-900/40'
    case 'OPTIONAL':
      return 'text-gray-400 bg-gray-800'
  }
}

function priorityLabel(priority: QuestionPriority): string {
  switch (priority) {
    case 'BLOCKING':
      return 'จำเป็น'
    case 'IMPORTANT':
      return 'สำคัญ'
    case 'OPTIONAL':
      return 'เพิ่มเติม'
  }
}

/**
 * Suggested Requirements with Two-Step Confirmation
 */
interface SuggestedRequirementsProps {
  projectId: string
  suggestions: string[]
}

function SuggestedRequirementsList({
  projectId,
  suggestions,
}: SuggestedRequirementsProps) {
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null)
  const [addedSet, setAddedSet] = useState<Set<number>>(new Set())
  const [isAdding, setIsAdding] = useState(false)
  const { showToast } = useAppStore()
  const queryClient = useQueryClient()

  const handleConfirm = async (text: string, index: number) => {
    if (!projectId) return
    setIsAdding(true)
    try {
      await createRequirement(projectId, {
        content: text,
        category: 'Feature',
        status: 'CONFIRMED',
        priority: 'IMPORTANT',
      })
      queryClient.invalidateQueries({ queryKey: ['requirements', projectId] })
      setAddedSet((prev) => new Set(prev).add(index))
      setConfirmingIndex(null)
      showToast(`เพิ่ม Requirement: "${text.slice(0, 35)}..." แล้ว!`, 'success')
    } catch (err: any) {
      showToast(err.message || 'ไม่สามารถเพิ่ม Requirement ได้', 'error')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="w-full rounded-xl border border-purple-500/40 bg-purple-950/20 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-xs font-semibold text-purple-300">
          ระบบแนะนำ Requirement ที่อาจลืม:
        </span>
      </div>

      <ul className="space-y-2">
        {suggestions.map((rawS, i) => {
          const s = typeof rawS === 'string'
            ? rawS
            : ((rawS as any)?.content || (rawS as any)?.text || JSON.stringify(rawS))
          const isConfirming = confirmingIndex === i
          const isAdded = addedSet.has(i)

          if (isAdded) {
            return (
              <li
                key={i}
                className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-lg px-2.5 py-1.5"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="line-through opacity-80">{s}</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-emerald-900/80 text-emerald-200 px-1.5 py-0.5 rounded border border-emerald-700/60">
                  เพิ่มแล้ว
                </span>
              </li>
            )
          }

          if (isConfirming) {
            return (
              <li
                key={i}
                className="p-2.5 rounded-lg bg-purple-900/40 border border-purple-500/60 space-y-2 animate-fadeIn"
              >
                <p className="text-xs text-purple-200 font-medium">
                  ยืนยันต้องการเพิ่ม Requirement นี้ใช่ไหม?
                </p>
                <p className="text-xs text-gray-300 italic pl-2 border-l-2 border-purple-400">
                  "{s}"
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    disabled={isAdding}
                    onClick={() => handleConfirm(s, i)}
                    className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" />
                    ยืนยันเพิ่ม
                  </button>
                  <button
                    disabled={isAdding}
                    onClick={() => setConfirmingIndex(null)}
                    className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md transition-colors"
                  >
                    ยกเลิก
                  </button>
                </div>
              </li>
            )
          }

          return (
            <li
              key={i}
              className="flex items-start justify-between gap-2.5 p-2 rounded-lg bg-gray-900/60 border border-purple-900/40 hover:border-purple-700/60 transition-all group"
            >
              <span className="text-xs text-purple-200 leading-relaxed pt-0.5">
                • {s}
              </span>
              <button
                type="button"
                onClick={() => setConfirmingIndex(i)}
                title="คลิกเพื่อเพิ่ม Requirement นี้"
                className="shrink-0 text-xs px-2.5 py-1 rounded-md border border-purple-500/50 bg-purple-900/40 hover:bg-purple-800 text-purple-200 hover:text-white transition-all flex items-center gap-1 shadow-sm font-medium"
              >
                <Plus className="w-3.5 h-3.5 text-purple-300" />
                <span>เพิ่ม</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Interactive Form for Questions (Batch Submit)
 */
interface QuestionsInteractiveFormProps {
  questions: Question[]
  onSubmitAnswers: (combinedText: string) => void
  isSubmitting?: boolean
}

function QuestionsInteractiveForm({
  questions,
  onSubmitAnswers,
  isSubmitting = false,
}: QuestionsInteractiveFormProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const answeredCount = Object.values(answers).filter((a) => a.trim().length > 0).length

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (answeredCount === 0 || isSubmitting) return

    const lines: string[] = ['[คำตอบสำหรับข้อซักถามจาก Planner]']
    questions.forEach((rawQ, i) => {
      const qText = typeof rawQ === 'string' ? rawQ : (rawQ?.text || (rawQ as any)?.question || `คำถามข้อที่ ${i + 1}`)
      const ans = answers[i]?.trim()
      if (ans) {
        lines.push(`${i + 1}. ${qText}`)
        lines.push(`👉 ${ans}\n`)
      }
    })

    onSubmitAnswers(lines.join('\n'))
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="w-full rounded-xl border border-blue-900/60 bg-blue-950/20 p-3 text-xs text-blue-300 flex items-center gap-2">
        <Check className="w-4 h-4 text-blue-400 shrink-0" />
        <span>ส่งคำตอบทั้งหมดเรียบร้อยแล้ว</span>
      </div>
    )
  }

  return (
    <div className="w-full space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-semibold flex items-center gap-1.5">
          <span>คำถามจาก Planner:</span>
          <span className="text-[11px] text-gray-500 font-normal">
            (พิมพ์ตอบในการ์ดแล้วกดส่งพร้อมกันได้เลย)
          </span>
        </p>
      </div>

      <div className="space-y-2">
        {questions.map((rawQ, i) => {
          const qText = typeof rawQ === 'string' ? rawQ : (rawQ?.text || (rawQ as any)?.question || '')
          const qPriority: QuestionPriority = (typeof rawQ === 'object' && rawQ?.priority) || 'IMPORTANT'
          const qCategory = typeof rawQ === 'object' ? rawQ?.category : ''
          return (
            <div
              key={i}
              className={clsx(
                'w-full px-3.5 py-2.5 rounded-xl border text-xs transition-all space-y-1.5',
                questionBorderClass(qPriority)
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={clsx(
                    'shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium',
                    questionLabelClass(qPriority)
                  )}
                >
                  {priorityLabel(qPriority)}
                </span>
                <span className="text-gray-200 font-medium leading-relaxed">
                  {qText}
                </span>
              </div>
              {qCategory && (
                <p className="text-gray-500 text-[11px] pl-14">
                  หมวด: {qCategory}
                </p>
              )}
              <input
                type="text"
                value={answers[i] || ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="พิมพ์คำตอบข้อนี้... (เว้นว่างได้ถ้ายังไม่ต้องการตอบ)"
                className="w-full bg-gray-950/80 border border-gray-700/80 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500 placeholder-gray-600 transition-colors"
              />
            </div>
          )
        })}
      </div>

      {/* Batch Submit Bar */}
      <div className="flex items-center justify-between pt-1 px-1">
        <span className="text-[11px] text-gray-400">
          กรอกแล้ว {answeredCount}/{questions.length} ข้อ
        </span>
        <button
          type="button"
          disabled={answeredCount === 0 || isSubmitting}
          onClick={() => handleSubmit()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-950/40"
        >
          <Send className="w-3.5 h-3.5" />
          <span>ส่งคำตอบทั้งหมดพร้อมกัน</span>
        </button>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  projectId?: string
  questions?: Question[]
  suggestions?: string[]
  conflicts?: string[]
  onSubmitBatchAnswers: (combinedText: string) => void
  isChatLoading?: boolean
}

function MessageBubble({
  message,
  projectId = '',
  questions = [],
  suggestions = [],
  conflicts = [],
  onSubmitBatchAnswers,
  isChatLoading = false,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[85%] space-y-3',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Role label */}
        <p className={clsx('text-xs text-gray-500', isUser ? 'text-right' : 'text-left')}>
          {isUser ? 'คุณ' : 'Planner AI'}
        </p>

        {/* Message bubble */}
        <div
          className={clsx(
            'rounded-xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-dark text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Conflicts */}
        {!isUser && conflicts.length > 0 && (
          <div className="w-full rounded-lg border border-orange-500/50 bg-orange-950/30 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-xs font-medium text-orange-400">ข้อขัดแย้งที่พบ</span>
            </div>
            <ul className="space-y-1">
              {conflicts.map((rawC, i) => {
                const c = typeof rawC === 'string' ? rawC : ((rawC as any)?.description || JSON.stringify(rawC))
                return (
                  <li key={i} className="text-xs text-orange-200 leading-relaxed">
                    • {c}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Suggestions with Confirmation */}
        {!isUser && suggestions.length > 0 && (
          <SuggestedRequirementsList projectId={projectId} suggestions={suggestions} />
        )}

        {/* Questions Interactive Form */}
        {!isUser && questions.length > 0 && (
          <QuestionsInteractiveForm
            questions={questions}
            onSubmitAnswers={onSubmitBatchAnswers}
            isSubmitting={isChatLoading}
          />
        )}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const {
    currentProject,
    messages,
    setMessages,
    addMessage,
    isChatLoading,
    setIsChatLoading,
    setIsReadyToBuild,
    showToast,
    messageMeta,
    mergeMessageMeta,
  } = useAppStore()
  const [input, setInput] = useState('')
  const [timeoutWarning, setTimeoutWarning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // GODKILLER Loop Breaker ref
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load messages when project changes
  const { data: fetchedMessages } = useQuery({
    queryKey: ['messages', currentProject?.id],
    queryFn: () => getMessages(currentProject!.id),
    enabled: !!currentProject,
  })

  useEffect(() => {
    if (fetchedMessages) {
      setMessages(fetchedMessages)
      fetchedMessages.forEach((m) => {
        if (m.metadata_json) {
          try {
            const parsed = JSON.parse(m.metadata_json)
            mergeMessageMeta(m.id, normalizeMessageMeta(parsed))
          } catch {
            // ignore JSON parse error
          }
        }
      })
    }
  }, [fetchedMessages, setMessages, mergeMessageMeta])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isChatLoading])

  // GODKILLER Loop Breaker: clear loading state after CHAT_TIMEOUT_MS
  const startLoadingTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setTimeoutWarning(false)
    timeoutRef.current = setTimeout(() => {
      setIsChatLoading(false)
      setTimeoutWarning(true)
      showToast('การเชื่อมต่อ AI หมดเวลา — กรุณาลองใหม่', 'error')
    }, CHAT_TIMEOUT_MS)
  }

  const clearLoadingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setTimeoutWarning(false)
  }

  // Cleanup on unmount
  useEffect(() => () => { clearLoadingTimeout() }, [])

  const sendMutation = useMutation({
    mutationFn: ({
      projectId,
      message,
      planningMode,
    }: {
      projectId: string
      message: string
      planningMode?: string
    }) => sendMessage(projectId, message, planningMode),
    onSuccess: (response) => {
      clearLoadingTimeout()
      const plannerMessage: Message = {
        id: response.id || Date.now().toString(),
        role: 'planner',
        content: response.message,
        created_at: new Date().toISOString(),
      }
      addMessage(plannerMessage)

      // Normalize questions/suggestions/conflicts safely
      const safeMeta = normalizeMessageMeta({
        questions: response.questions,
        suggestions: response.suggestions,
        conflicts: response.conflicts,
      })

      // Persist to Zustand + sessionStorage (fixes questions-disappear-on-refresh bug)
      mergeMessageMeta(plannerMessage.id, safeMeta)

      setIsReadyToBuild(response.is_ready_to_build ?? false)
      setIsChatLoading(false)
    },
    onError: (err: Error) => {
      clearLoadingTimeout()
      setIsChatLoading(false)
      showToast(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
    },
  })

  const handleSend = () => {
    if (!input.trim() || !currentProject || isChatLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    }
    addMessage(userMessage)
    setInput('')
    setIsChatLoading(true)
    startLoadingTimeout()

    sendMutation.mutate({
      projectId: currentProject.id,
      message: userMessage.content,
      planningMode: currentProject.planning_mode,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleBatchAnswersSubmit = (combinedText: string) => {
    if (!currentProject || !combinedText.trim() || isChatLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: combinedText.trim(),
      created_at: new Date().toISOString(),
    }
    addMessage(userMessage)
    setIsChatLoading(true)
    startLoadingTimeout()

    sendMutation.mutate({
      projectId: currentProject.id,
      message: userMessage.content,
      planningMode: currentProject.planning_mode,
    })
  }

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center">
          <span className="text-3xl">⚡</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-300 mb-1">
            เลือกหรือสร้างโปรเจกต์
          </h2>
          <p className="text-sm text-gray-600">
            เลือกโปรเจกต์จากแถบด้านซ้าย หรือสร้างโปรเจกต์ใหม่เพื่อเริ่มต้น
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Timeout warning banner */}
      {timeoutWarning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-950/60 border-b border-red-800/60 text-xs text-red-300 shrink-0">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>การเชื่อมต่อ AI หมดเวลา — ตรวจสอบว่า Backend ทำงานอยู่และลองส่งข้อความใหม่</span>
          <button
            onClick={() => setTimeoutWarning(false)}
            className="ml-auto text-red-400 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Planning Mode Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800/80 text-xs text-gray-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">โหมดวิเคราะห์:</span>
          <span
            className={clsx(
              'font-semibold px-2 py-0.5 rounded text-[11px] uppercase tracking-wider',
              currentProject.planning_mode === 'QUICK'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : currentProject.planning_mode === 'ARCHITECT'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            )}
          >
            {currentProject.planning_mode || 'STANDARD'}
          </span>
          <span className="text-gray-500 text-[11px] hidden sm:inline">
            {currentProject.planning_mode === 'QUICK' &&
              '• ถาม 1-2 ข้อเฉพาะจุดสำคัญ แล้วสรุปค่าเริ่มต้นพร้อมสร้างทันที'}
            {currentProject.planning_mode === 'STANDARD' &&
              '• ถามฟีเจอร์หลักและสถาปัตยกรรม ไม่เกิน 2 รอบ'}
            {currentProject.planning_mode === 'DETAILED' &&
              '• ถามครอบคลุม data validation และ edge cases ไม่เกิน 3 รอบ'}
            {currentProject.planning_mode === 'DEEP' &&
              '• เจาะลึก Database Schema และ API ไม่เกิน 4 รอบ'}
            {currentProject.planning_mode === 'ARCHITECT' &&
              '• วิเคราะห์ System Architecture และ Scaling ไม่เกิน 5 รอบ'}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {messages.length === 0 && !isChatLoading && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-600">
              เริ่มต้นบอก AI ว่าคุณต้องการสร้างอะไร...
            </p>
            <p className="text-xs text-gray-700 mt-1">
              เช่น "อยากสร้างระบบจัดการคลังสินค้า สำหรับร้านค้าออนไลน์"
            </p>
          </div>
        )}

        {messages.map((msg) => {
          let meta = messageMeta[msg.id]
          if (!meta && msg.metadata_json) {
            try {
              meta = normalizeMessageMeta(JSON.parse(msg.metadata_json))
            } catch {
              // ignore
            }
          }
          const safeMeta = normalizeMessageMeta(meta)
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              projectId={currentProject?.id}
              questions={safeMeta.questions}
              suggestions={safeMeta.suggestions}
              conflicts={safeMeta.conflicts}
              onSubmitBatchAnswers={handleBatchAnswersSubmit}
              isChatLoading={isChatLoading}
            />
          )
        })}

        {/* Typing indicator */}
        {isChatLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 rounded-xl rounded-tl-sm px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Planner AI</p>
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์ข้อความ... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
            className="flex-1 input-field text-sm resize-none min-h-[44px] max-h-[160px]"
            rows={1}
            disabled={isChatLoading}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 160) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isChatLoading}
            className="btn-primary h-[44px] w-[44px] flex items-center justify-center shrink-0 rounded-lg p-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-700 mt-1.5 text-right">
          กด Enter เพื่อส่ง · Shift+Enter เพื่อขึ้นบรรทัดใหม่
        </p>
      </div>
    </div>
  )
}
