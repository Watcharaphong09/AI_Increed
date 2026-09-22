import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, AlertTriangle, Lightbulb, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { sendMessage, getMessages } from '../api/planner'
import type { Message, Question, QuestionPriority } from '../types'

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

interface QuestionCardProps {
  question: Question
  onClick: (text: string) => void
}

function QuestionCard({ question, onClick }: QuestionCardProps) {
  return (
    <button
      onClick={() => onClick(question.text)}
      className={clsx(
        'w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all hover:opacity-80',
        questionBorderClass(question.priority)
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={clsx(
            'shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium',
            questionLabelClass(question.priority)
          )}
        >
          {priorityLabel(question.priority)}
        </span>
        <span className="text-gray-200 leading-relaxed">{question.text}</span>
      </div>
      {question.category && (
        <p className="text-gray-500 mt-1 text-xs pl-14">หมวด: {question.category}</p>
      )}
    </button>
  )
}

interface MessageBubbleProps {
  message: Message
  questions?: Question[]
  suggestions?: string[]
  conflicts?: string[]
  onQuestionClick: (text: string) => void
  onSuggestionClick: (text: string) => void
}

function MessageBubble({
  message,
  questions = [],
  suggestions = [],
  conflicts = [],
  onQuestionClick,
  onSuggestionClick,
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
              {conflicts.map((c, i) => (
                <li key={i} className="text-xs text-orange-200 leading-relaxed">
                  • {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions */}
        {!isUser && suggestions.length > 0 && (
          <div className="w-full rounded-lg border border-purple-500/40 bg-purple-950/20 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-xs font-medium text-purple-400">
                ระบบแนะนำ Requirement ที่อาจลืม:
              </span>
            </div>
            <ul className="space-y-1.5">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => onSuggestionClick(s)}
                    className="w-full text-left text-xs text-purple-200 hover:text-purple-100 leading-relaxed transition-colors flex items-start gap-2"
                  >
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded border border-purple-500/50 flex items-center justify-center text-purple-400">
                      +
                    </span>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Questions */}
        {!isUser && questions.length > 0 && (
          <div className="w-full space-y-2">
            <p className="text-xs text-gray-500 font-medium">คำถามจาก Planner:</p>
            {questions.map((q, i) => (
              <QuestionCard key={i} question={q} onClick={onQuestionClick} />
            ))}
          </div>
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
    if (fetchedMessages) setMessages(fetchedMessages)
  }, [fetchedMessages, setMessages])

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
    mutationFn: ({ projectId, message }: { projectId: string; message: string }) =>
      sendMessage(projectId, message),
    onSuccess: (response) => {
      clearLoadingTimeout()
      const plannerMessage: Message = {
        id: Date.now().toString(),
        role: 'planner',
        content: response.message,
        created_at: new Date().toISOString(),
      }
      addMessage(plannerMessage)

      // Normalize questions — backend returns {text, priority, category} objects
      const questions = (response.questions ?? []).map((q: any) =>
        typeof q === 'string' ? { text: q, priority: 'IMPORTANT', category: '' } : q
      )
      // Normalize suggestions — backend returns {content, ...} objects, extract string
      const suggestions = (response.suggestions ?? []).map((s: any) =>
        typeof s === 'string' ? s : (s.content ?? '')
      )
      // Normalize conflicts — extract description string
      const conflicts = (response.conflicts ?? []).map((c: any) =>
        typeof c === 'string' ? c : (c.description ?? `${c.requirement_a} vs ${c.requirement_b}`)
      )

      // Persist to Zustand + sessionStorage (fixes questions-disappear-on-refresh bug)
      mergeMessageMeta(plannerMessage.id, { questions, suggestions, conflicts })

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

    sendMutation.mutate({ projectId: currentProject.id, message: userMessage.content })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuestionClick = (text: string) => {
    setInput(text)
    textareaRef.current?.focus()
  }

  const handleSuggestionClick = (text: string) => {
    const prefixed = `เพิ่ม requirement: ${text}`
    setInput(prefixed)
    textareaRef.current?.focus()
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
          const meta = messageMeta[msg.id]
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              questions={meta?.questions ?? []}
              suggestions={meta?.suggestions ?? []}
              conflicts={meta?.conflicts ?? []}
              onQuestionClick={handleQuestionClick}
              onSuggestionClick={handleSuggestionClick}
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
