import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChatMessages, sendChatMessage, getUsers, getAssignments, markChatRead } from '@/lib/api'
import { getEmail } from '@/lib/auth'
import { getInitials, timeAgo } from '@/lib/utils'
import { X, Send, MessageCircle, Loader2, Users } from 'lucide-react'

const MAX_LINES = 10

function renderMessageText(text: string) {
  const parts = text.split(/(@\w[\w\s]*?)(?=\s@|\s|$)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded px-0.5 font-medium">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

interface Props {
  projectKey: string
  open: boolean
  onClose: () => void
}

export function ChatPanel({ projectKey, open, onClose }: Props) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [lineError, setLineError] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [showMembers, setShowMembers] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const currentEmail = getEmail()

  const { data, isLoading } = useQuery({
    queryKey: ['chat', projectKey],
    queryFn: () => getChatMessages(projectKey, 100),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  })

  const { data: allUsers } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: assignments } = useQuery({ queryKey: ['assignments'], queryFn: () => getAssignments() })

  const projectMembers = useMemo(() => {
    if (!allUsers) return []
    const assignedEmails = new Set(
      (assignments || [])
        .filter((a: any) => a.project_key === projectKey && !a.end_date)
        .map((a: any) => a.email)
    )
    return allUsers.filter((u: any) => u.role === 'Admin' || assignedEmails.has(u.emailAddress))
  }, [allUsers, assignments, projectKey])

  const markReadMut = useMutation({
    mutationFn: () => markChatRead(projectKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unreadCounts'] }),
  })

  const sendMut = useMutation({
    mutationFn: (msg: string) => sendChatMessage(projectKey, msg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat', projectKey] })
      setText('')
      setLineError('')
    },
    onError: (err: Error) => setLineError(err.message),
  })

  const messages = data?.messages || []
  const prevMsgCount = useRef(0)

  useEffect(() => {
    if (open && messages.length > 0 && messages.length !== prevMsgCount.current) {
      markReadMut.mutate()
      prevMsgCount.current = messages.length
    }
  }, [messages.length, open])

  useEffect(() => {
    if (open) markReadMut.mutate()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, open])

  if (!open) return null

  const mentionUsers = projectMembers.filter((u: any) =>
    u.displayName.toLowerCase().includes(mentionFilter.toLowerCase()) && u.emailAddress !== currentEmail
  )

  const handleTextChange = (val: string) => {
    const lineCount = val.split('\n').length
    if (lineCount > MAX_LINES) {
      setLineError(`Messages cannot exceed ${MAX_LINES} lines.`)
      return
    }
    setLineError('')
    setText(val)

    const cursorPos = inputRef.current?.selectionStart || val.length
    const textBefore = val.slice(0, cursorPos)
    const atMatch = textBefore.match(/@(\w*)$/)
    if (atMatch) {
      setShowMentions(true)
      setMentionFilter(atMatch[1])
      setMentionIndex(0)
    } else {
      setShowMentions(false)
    }
  }

  const firstName = (name: string) => name.split(' ')[0]

  const insertMention = (user: any) => {
    const cursorPos = inputRef.current?.selectionStart || text.length
    const textBefore = text.slice(0, cursorPos)
    const textAfter = text.slice(cursorPos)
    const newBefore = textBefore.replace(/@(\w*)$/, `@${firstName(user.displayName)} `)
    setText(newBefore + textAfter)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => Math.min(prev + 1, mentionUsers.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionUsers[mentionIndex])
        return
      } else if (e.key === 'Escape') {
        setShowMentions(false)
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const lineCount = trimmed.split('\n').length
    if (lineCount > MAX_LINES) {
      setLineError(`Messages cannot exceed ${MAX_LINES} lines.`)
      return
    }
    sendMut.mutate(trimmed)
  }

  return (
    <div className="fixed top-0 right-0 h-full w-[400px] bg-white dark:bg-slate-800 border-l dark:border-slate-700 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">{projectKey} Chat</h3>
            <p className="text-xs text-muted-foreground">{messages.length} messages</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowMembers(!showMembers)}
            className={`p-1.5 rounded transition-colors ${showMembers ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title="Show members"
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Members bar */}
      {showMembers && (
        <div className="px-4 py-2 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-750">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Members ({projectMembers.length})</p>
          <div className="flex flex-wrap gap-1">
            {projectMembers.map((u: any) => (
              <button
                key={u.accountId}
                onClick={() => {
                  setText((prev) => prev + `@${firstName(u.displayName)} `)
                  inputRef.current?.focus()
                  setShowMembers(false)
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 border dark:border-slate-600 text-[10px] hover:border-primary transition-colors"
                title={`Click to mention @${firstName(u.displayName)}`}
              >
                <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[7px] font-bold">
                  {getInitials(u.displayName)}
                </span>
                {u.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Start the conversation!</p>
          </div>
        )}

        {messages.map((msg: any) => {
          const isMe = msg.sender_email === currentEmail
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${
                  isMe
                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                    : 'bg-gradient-to-br from-slate-400 to-slate-600'
                }`}
                title={msg.sender_name}
              >
                {getInitials(msg.sender_name || '?')}
              </div>
              <div className={`max-w-[260px] ${isMe ? 'text-right' : ''}`}>
                <div className={`flex items-center gap-1.5 mb-0.5 ${isMe ? 'justify-end' : ''}`}>
                  <span className="text-xs font-medium">
                    {isMe ? 'You' : msg.sender_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(msg.timestamp)}
                  </span>
                </div>
                <div
                  className={`inline-block px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-slate-100 dark:bg-slate-700 text-foreground rounded-tl-sm'
                  }`}
                >
                  {renderMessageText(msg.text)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t dark:border-slate-700 px-3 py-3">
        {lineError && (
          <p className="text-xs text-destructive mb-2">{lineError}</p>
        )}
        <div className="relative">
          {showMentions && mentionUsers.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 w-56 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
              {mentionUsers.map((u: any, i: number) => (
                <button
                  key={u.accountId}
                  onClick={() => insertMention(u)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-left ${
                    i === mentionIndex ? 'bg-primary/10 text-primary' : ''
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                    {getInitials(u.displayName)}
                  </span>
                  {u.displayName}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message... Use @ to mention"
              maxLength={2000}
              rows={1}
              className="flex-1 border dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300 resize-none"
              style={{ minHeight: '36px', maxHeight: '80px' }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement
                el.style.height = '36px'
                el.style.height = Math.min(el.scrollHeight, 80) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sendMut.isPending}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
