import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChatMessages, sendChatMessage, getProject, getUsers, getAssignments, markChatRead } from '@/lib/api'
import { getEmail, isAdmin } from '@/lib/auth'
import { getInitials, timeAgo } from '@/lib/utils'
import { ArrowLeft, Send, MessageCircle, Loader2, Users, AtSign } from 'lucide-react'

const MAX_LINES = 10

function renderMessageText(text: string) {
  // Highlight @mentions
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

export function ProjectChat() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [lineError, setLineError] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const currentEmail = getEmail()
  const admin = isAdmin()

  const { data: project } = useQuery({
    queryKey: ['project', projectKey],
    queryFn: () => getProject(projectKey!),
    enabled: !!projectKey,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['chat', projectKey],
    queryFn: () => getChatMessages(projectKey!, 200),
    enabled: !!projectKey,
    refetchInterval: 5000,
  })

  const { data: allUsers } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: assignments } = useQuery({ queryKey: ['assignments'], queryFn: () => getAssignments() })

  // Project members: admin + users assigned to this project
  const projectMembers = useMemo(() => {
    if (!allUsers) return []
    const assignedEmails = new Set(
      (assignments || [])
        .filter((a: any) => a.project_key === projectKey && !a.end_date)
        .map((a: any) => a.email)
    )
    return allUsers.filter((u: any) => u.role === 'Admin' || assignedEmails.has(u.emailAddress))
  }, [allUsers, assignments, projectKey])

  // Mark as read on mount and when new messages arrive
  const markReadMut = useMutation({
    mutationFn: () => markChatRead(projectKey!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unreadCounts'] }),
  })

  const messages = data?.messages || []
  const prevMsgCount = useRef(0)

  useEffect(() => {
    if (projectKey && messages.length > 0 && messages.length !== prevMsgCount.current) {
      markReadMut.mutate()
      prevMsgCount.current = messages.length
    }
  }, [messages.length, projectKey])

  // Also mark read on first mount
  useEffect(() => {
    if (projectKey) markReadMut.mutate()
  }, [projectKey])

  const sendMut = useMutation({
    mutationFn: (msg: string) => sendChatMessage(projectKey!, msg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat', projectKey] })
      setText('')
      setLineError('')
    },
    onError: (err: Error) => setLineError(err.message),
  })

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Filtered users for @mention dropdown
  const mentionUsers = useMemo(() => {
    const filter = mentionFilter.toLowerCase()
    return projectMembers.filter((u: any) =>
      u.displayName.toLowerCase().includes(filter) && u.emailAddress !== currentEmail
    )
  }, [projectMembers, mentionFilter, currentEmail])

  const handleTextChange = (val: string) => {
    const lineCount = val.split('\n').length
    if (lineCount > MAX_LINES) {
      setLineError(`Messages cannot exceed ${MAX_LINES} lines.`)
      return
    }
    setLineError('')
    setText(val)

    // Check for @mention trigger
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

  // Online users panel (project members)
  const onlineUsers = projectMembers

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          to={`/projects/${projectKey}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {project?.name || projectKey}
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
        <div className="flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Chat</span>
        </div>
      </div>

      {/* Main chat layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Chat area */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 flex flex-col overflow-hidden">
          {/* Chat header */}
          <div className="px-5 py-3 border-b dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-750">
            <h2 className="font-semibold">{project?.name || projectKey} Chat Room</h2>
            <p className="text-xs text-muted-foreground">{messages.length} messages</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <MessageCircle className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs">Be the first to start the conversation!</p>
              </div>
            )}

            {messages.map((msg: any) => {
              const isMe = msg.sender_email === currentEmail
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${
                      isMe
                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                        : 'bg-gradient-to-br from-slate-400 to-slate-600'
                    }`}
                    title={msg.sender_name}
                  >
                    {getInitials(msg.sender_name || '?')}
                  </div>
                  <div className={`max-w-[60%] ${isMe ? 'text-right' : ''}`}>
                    <div className={`flex items-center gap-2 mb-0.5 ${isMe ? 'justify-end' : ''}`}>
                      <span className="text-xs font-medium">
                        {isMe ? 'You' : msg.sender_name}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {timeAgo(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      className={`inline-block px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
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
          <div className="border-t dark:border-slate-700 px-4 py-3">
            {lineError && (
              <p className="text-xs text-destructive mb-2">{lineError}</p>
            )}
            <div className="relative">
              {/* @mention dropdown */}
              {showMentions && mentionUsers.length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 w-64 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                  {mentionUsers.map((u: any, i: number) => (
                    <button
                      key={u.accountId}
                      onClick={() => insertMention(u)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-left ${
                        i === mentionIndex ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                        {getInitials(u.displayName)}
                      </span>
                      <span className="truncate">{u.displayName}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... Use @ to mention someone. Shift+Enter for new line."
                  maxLength={2000}
                  rows={1}
                  className="flex-1 border dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300 resize-none"
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement
                    el.style.height = '40px'
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sendMut.isPending}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2 self-end"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {text.split('\n').length}/{MAX_LINES} lines
              </p>
            </div>
          </div>
        </div>

        {/* Members sidebar */}
        <div className="w-52 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b dark:border-slate-700">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Members ({onlineUsers.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {onlineUsers.map((u: any) => (
              <button
                key={u.accountId}
                onClick={() => {
                  const current = text
                  const cursorPos = inputRef.current?.selectionStart || current.length
                  const before = current.slice(0, cursorPos)
                  const after = current.slice(cursorPos)
                  setText(before + `@${firstName(u.displayName)} ` + after)
                  inputRef.current?.focus()
                }}
                className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title={`Click to mention @${firstName(u.displayName)}`}
              >
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                  {getInitials(u.displayName)}
                </span>
                <span className="text-xs truncate">{u.displayName}</span>
                {u.emailAddress === currentEmail && (
                  <span className="text-[9px] text-muted-foreground ml-auto">(you)</span>
                )}
              </button>
            ))}
            {onlineUsers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No members</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
