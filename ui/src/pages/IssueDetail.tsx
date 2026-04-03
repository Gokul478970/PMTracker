import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getIssue, getTransitions, transitionIssue, addComment, editComment, updateIssue, getUsers,
  createIssueLink, deleteIssueLink, deleteIssue, searchIssues, getBoards, getBoardSprints,
  getChildIssues, createIssue,
} from '@/lib/api'
import { STATUS_COLORS, PRIORITY_CONFIG, ISSUE_TYPE_ICONS, getInitials, timeAgo } from '@/lib/utils'
import { isDemo } from '@/lib/auth'
import { Loader2, ArrowLeft, Send, Clock, MessageSquare, History, Link2, Plus, X, Ban, ArrowRight, Trash2, Pencil, Check } from 'lucide-react'

const ISSUE_TYPES = ['Epic', 'Feature', 'Story', 'Task', 'Bug', 'Sub-task']
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest']

export function IssueDetail() {
  const { issueKey } = useParams<{ issueKey: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const readOnly = isDemo()
  const [commentText, setCommentText] = useState('')
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkType, setLinkType] = useState('Blocks')
  const [linkTarget, setLinkTarget] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskSummary, setNewTaskSummary] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskHours, setNewTaskHours] = useState('')

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', issueKey],
    queryFn: () => getIssue(issueKey!),
    enabled: !!issueKey,
  })

  const { data: transitions } = useQuery({
    queryKey: ['transitions', issueKey],
    queryFn: () => getTransitions(issueKey!),
    enabled: !!issueKey,
  })

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  const projectKey = issue?.fields?.project?.key || ''

  const { data: boards } = useQuery({
    queryKey: ['boards', projectKey],
    queryFn: () => getBoards(projectKey),
    enabled: !!projectKey,
  })
  const boardId = boards?.[0]?.id

  const { data: sprints } = useQuery({
    queryKey: ['sprints', boardId],
    queryFn: () => getBoardSprints(boardId!),
    enabled: !!boardId,
  })

  const { data: childIssues } = useQuery({
    queryKey: ['childIssues', issueKey],
    queryFn: () => getChildIssues(issueKey!),
    enabled: !!issueKey,
  })

  const createTaskMut = useMutation({
    mutationFn: (data: any) => createIssue(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', issueKey] })
      qc.invalidateQueries({ queryKey: ['childIssues', issueKey] })
      qc.invalidateQueries({ queryKey: ['sprintIssues'] })
      qc.invalidateQueries({ queryKey: ['projectIssues'] })
      setShowAddTask(false)
      setNewTaskSummary('')
      setNewTaskAssignee('')
      setNewTaskHours('')
    },
  })

  const transitionMut = useMutation({
    mutationFn: (name: string) => transitionIssue(issueKey!, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', issueKey] })
      qc.invalidateQueries({ queryKey: ['transitions', issueKey] })
    },
  })

  const commentMut = useMutation({
    mutationFn: (body: string) => addComment(issueKey!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', issueKey] })
      setCommentText('')
    },
  })

  const editCommentMut = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      editComment(issueKey!, commentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', issueKey] })
      setEditingCommentId(null)
      setEditingCommentText('')
    },
  })

  const updateMut = useMutation({
    mutationFn: (data: any) => updateIssue(issueKey!, data),
    onSuccess: (result) => {
      qc.setQueryData(['issue', issueKey], result)
      qc.invalidateQueries({ queryKey: ['issue', issueKey] })
      setEditing(null)
    },
  })

  const linkMut = useMutation({
    mutationFn: () => createIssueLink(issueKey!, linkType, linkTarget),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', issueKey] })
      qc.invalidateQueries({ queryKey: ['issue', linkTarget] })
      setShowLinkForm(false)
      setLinkTarget('')
    },
  })

  const unlinkMut = useMutation({
    mutationFn: (linkId: string) => deleteIssueLink(issueKey!, linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', issueKey] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteIssue(issueKey!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectIssues'] })
      navigate(-1)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!issue) {
    return <p className="text-center py-12 text-muted-foreground">Issue not found.</p>
  }

  const f = issue.fields
  const statusName = f.status?.name || 'To Do'
  const priorityName = f.priority?.name || 'Medium'
  const typeName = f.issuetype?.name || 'Task'
  const comments = f.comment?.comments || []
  const history = f.transitions_history || []
  const issueLinks = f.issueLinks || []
  const subtasks = f.subtasks || []
  const fixVersions = f.fixVersions || []
  const isBlocked = issueLinks.some(
    (l: any) => l.direction === 'inward' && l.type?.name === 'Blocks'
  )

  const startEdit = (field: string, value: string) => {
    if (readOnly) return
    setEditing(field)
    setEditValue(value)
  }

  const saveField = (apiData: any) => {
    updateMut.mutate(apiData)
  }

  const handleKeyDown = (e: React.KeyboardEvent, apiData: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveField(apiData)
    } else if (e.key === 'Escape') {
      setEditing(null)
    }
  }

  const activeSprints = (sprints || []).filter((s: any) => s.state !== 'closed')

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <Link to={`/projects/${projectKey}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" />
          {projectKey}
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{issueKey}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Title */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span>{ISSUE_TYPE_ICONS[typeName] || '\u{1F4CB}'}</span>
              <span className="text-sm font-medium text-muted-foreground">{issueKey}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[statusName] || 'bg-slate-100'}`}>
                {statusName}
              </span>
              {isBlocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                  <Ban className="w-3 h-3" /> Blocked
                </span>
              )}
            </div>
            {/* Editable Summary */}
            {editing === 'summary' ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, { summary: editValue })}
                  onBlur={() => saveField({ summary: editValue })}
                  className="flex-1 text-xl font-bold border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:border-slate-600"
                />
                <button
                  onMouseDown={(e) => { e.preventDefault(); saveField({ summary: editValue }) }}
                  className="text-primary hover:text-primary/80"
                >
                  <Check className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <h1
                className={`text-xl font-bold transition-colors ${readOnly ? '' : 'cursor-pointer hover:text-primary/80 group'}`}
                onClick={() => startEdit('summary', f.summary || '')}
              >
                {f.summary}
                {!readOnly && <Pencil className="w-3.5 h-3.5 inline ml-2 opacity-0 group-hover:opacity-50" />}
              </h1>
            )}
            {/* Editable Description */}
            {editing === 'description' ? (
              <div className="mt-3">
                <textarea
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  rows={4}
                  className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:border-slate-600"
                />
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => saveField({ description: editValue })}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1 border rounded text-xs dark:border-slate-600">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`mt-3 text-sm text-muted-foreground whitespace-pre-wrap rounded p-1 -m-1 transition-colors min-h-[2rem] ${readOnly ? '' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 group'}`}
                onClick={() => startEdit('description', f.description || '')}
              >
                {f.description || (readOnly ? <span className="italic">No description</span> : <span className="italic">Click to add description...</span>)}
                {!readOnly && <Pencil className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-50" />}
              </div>
            )}
          </div>

          {/* Child Tasks */}
          {(childIssues && childIssues.length > 0 || ['Epic', 'Feature', 'Story', 'Bug'].includes(typeName)) && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {['Epic', 'Feature'].includes(typeName) ? 'Child Issues' : 'Child Tasks'} ({childIssues?.length || 0})
                </h3>
                {!readOnly && ['Story', 'Bug'].includes(typeName) && (
                  <button
                    onClick={() => setShowAddTask(!showAddTask)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Task
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {childIssues && childIssues.length > 0 && (() => {
                const doneCount = childIssues.filter((c: any) => c.fields?.status?.name === 'Done').length
                const totalHours = childIssues.reduce((sum: number, c: any) => sum + (c.fields?.estimate_hours || 0), 0)
                const doneHours = childIssues.filter((c: any) => c.fields?.status?.name === 'Done').reduce((sum: number, c: any) => sum + (c.fields?.estimate_hours || 0), 0)
                const totalPoints = childIssues.reduce((sum: number, c: any) => sum + (c.fields?.customfield_10001 || 0), 0)
                const donePoints = childIssues.filter((c: any) => c.fields?.status?.name === 'Done').reduce((sum: number, c: any) => sum + (c.fields?.customfield_10001 || 0), 0)
                const pct = childIssues.length > 0 ? Math.round((doneCount / childIssues.length) * 100) : 0
                return (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{doneCount}/{childIssues.length} done</span>
                      {totalPoints > 0 && <span className="text-[10px] text-muted-foreground">{donePoints}/{totalPoints}pt</span>}
                      {totalHours > 0 && <span className="text-[10px] text-muted-foreground">{doneHours}/{totalHours}h</span>}
                    </div>
                  </div>
                )
              })()}

              {/* Task rows */}
              <div className="space-y-1">
                {(childIssues || []).map((child: any) => {
                  const cf = child.fields
                  const isDone = cf?.status?.name === 'Done'
                  return (
                    <div key={child.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm ${isDone ? 'opacity-50' : ''}`}>
                      <span className="text-xs shrink-0">{ISSUE_TYPE_ICONS[cf?.issuetype?.name] || '\u{2705}'}</span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_COLORS[cf?.status?.name] || 'bg-slate-100 text-slate-600'}`}>
                        {cf?.status?.name || 'To Do'}
                      </span>
                      <Link to={`/issues/${child.key}`} className="text-xs font-medium text-muted-foreground w-20 shrink-0 hover:text-primary">
                        {child.key}
                      </Link>
                      <Link to={`/issues/${child.key}`} className={`flex-1 text-sm truncate hover:text-primary ${isDone ? 'line-through' : ''}`}>
                        {cf?.summary}
                      </Link>
                      {cf?.customfield_10001 != null && (
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded shrink-0">
                          {cf.customfield_10001}pt
                        </span>
                      )}
                      {cf?.estimate_hours != null && (
                        <span className="text-[10px] bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded shrink-0">
                          {cf.estimate_hours}h
                        </span>
                      )}
                      {cf?.assignee && (
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[8px] font-bold shrink-0" title={cf.assignee.displayName}>
                          {getInitials(cf.assignee.displayName)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Inline Add Task form */}
              {showAddTask && (
                <form
                  className="mt-3 pt-3 border-t dark:border-slate-700 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!newTaskSummary.trim()) return
                    createTaskMut.mutate({
                      project_key: projectKey,
                      summary: newTaskSummary,
                      issue_type: 'Task',
                      parent_key: issueKey,
                      sprint_id: f.sprint || undefined,
                      assignee: newTaskAssignee || undefined,
                      estimate_hours: newTaskHours ? parseFloat(newTaskHours) : undefined,
                    })
                  }}
                >
                  <input
                    autoFocus
                    value={newTaskSummary}
                    onChange={(e) => setNewTaskSummary(e.target.value)}
                    placeholder="Task summary..."
                    className="w-full border dark:border-slate-600 rounded px-2 py-1.5 text-sm dark:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value)}
                      className="flex-1 border dark:border-slate-600 rounded px-2 py-1.5 text-xs dark:bg-slate-700"
                    >
                      <option value="">Unassigned</option>
                      {(users || []).map((u: any) => (
                        <option key={u.accountId} value={u.accountId}>{u.displayName}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={newTaskHours}
                      onChange={(e) => setNewTaskHours(e.target.value)}
                      placeholder="Hours"
                      className="w-20 border dark:border-slate-600 rounded px-2 py-1.5 text-xs dark:bg-slate-700"
                    />
                    <button
                      type="submit"
                      disabled={createTaskMut.isPending || !newTaskSummary.trim()}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {createTaskMut.isPending ? '...' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddTask(false)}
                      className="px-2 py-1.5 border dark:border-slate-600 rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                  {createTaskMut.isError && (
                    <p className="text-xs text-destructive">{(createTaskMut.error as Error).message}</p>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Issue Links */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Links ({issueLinks.length})
              </h3>
              {!readOnly && (
                <button
                  onClick={() => setShowLinkForm(!showLinkForm)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Link
                </button>
              )}
            </div>

            {showLinkForm && (
              <div className="flex gap-2 mb-3 items-end">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Type</label>
                  <select
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value)}
                    className="border rounded px-2 py-1.5 text-xs dark:bg-slate-700 dark:border-slate-600"
                  >
                    <option>Blocks</option>
                    <option>Relates</option>
                    <option>Duplicate</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground mb-1">Issue Key</label>
                  <input
                    value={linkTarget}
                    onChange={(e) => setLinkTarget(e.target.value.toUpperCase())}
                    placeholder="e.g. PROJ-5"
                    className="w-full border rounded px-2 py-1.5 text-xs dark:bg-slate-700 dark:border-slate-600"
                  />
                </div>
                <button
                  onClick={() => linkMut.mutate()}
                  disabled={!linkTarget.trim() || linkMut.isPending}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 disabled:opacity-50"
                >
                  {linkMut.isPending ? '...' : 'Link'}
                </button>
              </div>
            )}
            {linkMut.isError && (
              <p className="text-xs text-destructive mb-2">{(linkMut.error as Error).message}</p>
            )}

            {issueLinks.length === 0 && !showLinkForm && (
              <p className="text-sm text-muted-foreground text-center py-3">No links</p>
            )}
            <div className="space-y-1.5">
              {issueLinks.map((link: any) => {
                const linkedKey = link.direction === 'outward'
                  ? link.outwardIssue?.key
                  : link.inwardIssue?.key
                const linkedSummary = link.direction === 'outward'
                  ? link.outwardIssue?.fields?.summary
                  : link.inwardIssue?.fields?.summary
                const label = link.direction === 'outward'
                  ? link.type?.outward || link.type?.name
                  : link.type?.inward || link.type?.name
                const isBlock = link.type?.name === 'Blocks'

                return (
                  <div key={link.id} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${isBlock ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-slate-700/50'}`}>
                    <Link2 className={`w-3.5 h-3.5 shrink-0 ${isBlock ? 'text-red-500' : 'text-muted-foreground'}`} />
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Link to={`/issues/${linkedKey}`} className="text-primary hover:underline font-medium">
                      {linkedKey}
                    </Link>
                    {linkedSummary && (
                      <span className="text-xs text-muted-foreground truncate">{linkedSummary}</span>
                    )}
                    <button
                      onClick={() => unlinkMut.mutate(link.id)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700">
            <div className="flex border-b dark:border-slate-700">
              <button
                onClick={() => setActiveTab('comments')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'comments'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Comments ({comments.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <History className="w-4 h-4" />
                History ({history.length})
              </button>
            </div>

            <div className="p-4">
              {activeTab === 'comments' && (
                <div className="space-y-4">
                  {comments.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>
                  )}
                  {comments.map((c: any) => (
                    <div key={c.id} className="flex gap-3 group/comment">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {c.author ? getInitials(c.author.displayName) : '?'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{c.author?.displayName || 'Anonymous'}</span>
                          <span className="text-xs text-muted-foreground">{timeAgo(c.created)}</span>
                          {editingCommentId !== c.id && (
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.body) }}
                              className="opacity-0 group-hover/comment:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="mt-1">
                            <textarea
                              autoFocus
                              value={editingCommentText}
                              onChange={(e) => setEditingCommentText(e.target.value)}
                              rows={2}
                              className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:border-slate-600"
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                onClick={() => editCommentMut.mutate({ commentId: c.id, body: editingCommentText })}
                                disabled={!editingCommentText.trim() || editCommentMut.isPending}
                                className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 disabled:opacity-50"
                              >
                                {editCommentMut.isPending ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setEditingCommentId(null); setEditingCommentText('') }}
                                className="px-3 py-1 border rounded text-xs dark:border-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-0.5">{c.body}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Add comment */}
                  {!readOnly && (
                    <form
                      className="flex gap-2 pt-2 border-t dark:border-slate-700"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (commentText.trim()) commentMut.mutate(commentText)
                      }}
                    >
                      <input
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:border-slate-600"
                      />
                      <button
                        type="submit"
                        disabled={!commentText.trim() || commentMut.isPending}
                        className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-3">
                  {history.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No transitions yet</p>
                  )}
                  {history.map((h: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[h.from_status] || 'bg-slate-100'}`}>
                          {h.from_status}
                        </span>
                        <span className="mx-2 text-muted-foreground">&rarr;</span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[h.to_status] || 'bg-slate-100'}`}>
                          {h.to_status}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">{timeAgo(h.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status Actions */}
          {!readOnly && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Transition
            </h3>
            <div className="flex flex-wrap gap-2">
              {(transitions || []).map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => transitionMut.mutate(t.name)}
                  disabled={transitionMut.isPending}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:shadow-sm ${STATUS_COLORS[t.name] || 'bg-slate-100'}`}
                >
                  {t.name}
                </button>
              ))}
              {(!transitions || transitions.length === 0) && (
                <p className="text-xs text-muted-foreground">No transitions available</p>
              )}
            </div>
          </div>
          )}

          {/* Details */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Details
            </h3>
            <div className="space-y-3 text-sm">
              {/* Status */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[statusName] || 'bg-slate-100'}`}>
                  {statusName}
                </span>
              </div>

              {/* Type - editable */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Type</span>
                {editing === 'type' ? (
                  <select
                    autoFocus
                    value={editValue}
                    onChange={(e) => {
                      saveField({ issue_type: e.target.value })
                    }}
                    onBlur={() => setEditing(null)}
                    className="border rounded px-2 py-0.5 text-xs dark:bg-slate-700 dark:border-slate-600"
                  >
                    {ISSUE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => startEdit('type', typeName)}
                    className="hover:text-primary transition-colors flex items-center gap-1 group"
                  >
                    <span>{ISSUE_TYPE_ICONS[typeName]} {typeName}</span>
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  </button>
                )}
              </div>

              {/* Priority - editable */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Priority</span>
                {editing === 'priority' ? (
                  <select
                    autoFocus
                    value={editValue}
                    onChange={(e) => {
                      saveField({ priority: e.target.value })
                    }}
                    onBlur={() => setEditing(null)}
                    className="border rounded px-2 py-0.5 text-xs dark:bg-slate-700 dark:border-slate-600"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => startEdit('priority', priorityName)}
                    className="hover:text-primary transition-colors flex items-center gap-1 group"
                  >
                    <span className={PRIORITY_CONFIG[priorityName]?.color}>{priorityName}</span>
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  </button>
                )}
              </div>

              {/* Assignee - editable */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Assignee</span>
                {editing === 'assignee' ? (
                  <select
                    autoFocus
                    value={editValue}
                    onChange={(e) => {
                      saveField({ assignee: e.target.value })
                    }}
                    onBlur={() => setEditing(null)}
                    className="border rounded px-2 py-0.5 text-xs dark:bg-slate-700 dark:border-slate-600"
                  >
                    <option value="">Unassigned</option>
                    {(users || []).map((u: any) => (
                      <option key={u.accountId} value={u.accountId}>{u.displayName}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => startEdit('assignee', f.assignee?.accountId || '')}
                    className="text-right hover:text-primary transition-colors flex items-center gap-1 group"
                  >
                    {f.assignee ? (
                      <span className="flex items-center gap-1">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[8px] font-bold">
                          {getInitials(f.assignee.displayName)}
                        </span>
                        {f.assignee.displayName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  </button>
                )}
              </div>

              {/* Reporter */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reporter</span>
                <span>{f.reporter?.displayName || 'None'}</span>
              </div>

              {/* Story Points (for Epic/Story/Bug) or Estimate Hours (for Task/Sub-task) */}
              {['Task', 'Sub-task'].includes(typeName) ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Estimate (Hours)</span>
                  {editing === 'estimateHours' ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.5"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, { estimate_hours: parseFloat(editValue) || 0 })}
                      onBlur={() => saveField({ estimate_hours: parseFloat(editValue) || 0 })}
                      className="w-16 border rounded px-2 py-0.5 text-xs text-right dark:bg-slate-700 dark:border-slate-600"
                    />
                  ) : (
                    <button
                      onClick={() => startEdit('estimateHours', String(f.estimate_hours ?? ''))}
                      className="hover:text-primary transition-colors flex items-center gap-1 group"
                    >
                      <span>{f.estimate_hours != null ? `${f.estimate_hours}h` : '-'}</span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Story Points</span>
                  {editing === 'storyPoints' ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      max="99"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, { story_points: parseInt(editValue) || 0 })}
                      onBlur={() => saveField({ story_points: parseInt(editValue) || 0 })}
                      className="w-16 border rounded px-2 py-0.5 text-xs text-right dark:bg-slate-700 dark:border-slate-600"
                    />
                  ) : (
                    <button
                      onClick={() => startEdit('storyPoints', String(f.customfield_10001 ?? ''))}
                      className="hover:text-primary transition-colors flex items-center gap-1 group"
                    >
                      <span>{f.customfield_10001 ?? '-'}</span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                    </button>
                  )}
                </div>
              )}

              {/* Sprint - editable */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Sprint</span>
                {editing === 'sprint' ? (
                  <select
                    autoFocus
                    value={editValue}
                    onChange={(e) => {
                      saveField({ sprint_id: e.target.value })
                    }}
                    onBlur={() => setEditing(null)}
                    className="border rounded px-2 py-0.5 text-xs dark:bg-slate-700 dark:border-slate-600"
                  >
                    <option value="">None</option>
                    {activeSprints.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => startEdit('sprint', f.sprint || '')}
                    className="hover:text-primary transition-colors flex items-center gap-1 group"
                  >
                    <span>{f.sprint ? `Sprint ${f.sprint}` : '-'}</span>
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  </button>
                )}
              </div>

              {/* Parent - editable */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Parent</span>
                {editing === 'parent' ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                    onKeyDown={(e) => handleKeyDown(e, { parent_key: editValue })}
                    onBlur={() => saveField({ parent_key: editValue })}
                    placeholder="e.g. PROJ-1"
                    className="w-24 border rounded px-2 py-0.5 text-xs dark:bg-slate-700 dark:border-slate-600"
                  />
                ) : (
                  <button
                    onClick={() => startEdit('parent', f.parent || '')}
                    className="hover:text-primary transition-colors flex items-center gap-1 group"
                  >
                    {f.parent ? (
                      <Link to={`/issues/${f.parent}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {f.parent}
                      </Link>
                    ) : (
                      <span>-</span>
                    )}
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  </button>
                )}
              </div>

              {/* Labels - editable */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-muted-foreground">Labels</span>
                  <button
                    onClick={() => startEdit('labels', (f.labels || []).join(', '))}
                    className="text-muted-foreground hover:text-primary group"
                  >
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                  </button>
                </div>
                {editing === 'labels' ? (
                  <div>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, { labels: editValue.split(',').map(s => s.trim()).filter(Boolean) })}
                      onBlur={() => saveField({ labels: editValue.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="label1, label2"
                      className="w-full border rounded px-2 py-1 text-xs dark:bg-slate-700 dark:border-slate-600"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated. Press Enter to save.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(f.labels || []).length > 0 ? (
                      f.labels.map((l: string) => (
                        <span key={l} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">{l}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground cursor-pointer" onClick={() => startEdit('labels', '')}>Add labels...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Components - editable */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-muted-foreground">Components</span>
                  <button
                    onClick={() => startEdit('components', (f.components || []).map((c: any) => c.name).join(', '))}
                    className="text-muted-foreground hover:text-primary group"
                  >
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                  </button>
                </div>
                {editing === 'components' ? (
                  <div>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, { components: editValue.split(',').map(s => s.trim()).filter(Boolean) })}
                      onBlur={() => saveField({ components: editValue.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="Frontend, Backend"
                      className="w-full border rounded px-2 py-1 text-xs dark:bg-slate-700 dark:border-slate-600"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated. Press Enter to save.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(f.components || []).length > 0 ? (
                      f.components.map((c: any) => (
                        <span key={c.name} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">{c.name}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground cursor-pointer" onClick={() => startEdit('components', '')}>Add components...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Fix Versions - editable */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-muted-foreground">Release</span>
                  <button
                    onClick={() => startEdit('fixVersions', fixVersions.map((v: any) => v.name).join(', '))}
                    className="text-muted-foreground hover:text-primary group"
                  >
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                  </button>
                </div>
                {editing === 'fixVersions' ? (
                  <div>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, { fix_versions: editValue.split(',').map(s => s.trim()).filter(Boolean) })}
                      onBlur={() => saveField({ fix_versions: editValue.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="v1.0, v1.1"
                      className="w-full border rounded px-2 py-1 text-xs dark:bg-slate-700 dark:border-slate-600"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated. Press Enter to save.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {fixVersions.length > 0 ? (
                      fixVersions.map((v: any) => (
                        <span key={v.name} className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">{v.name}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground cursor-pointer" onClick={() => startEdit('fixVersions', '')}>Add versions...</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Dates
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-xs">{f.created ? new Date(f.created).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-xs">{f.updated ? timeAgo(f.updated) : 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Delete */}
          {!readOnly && (
            <button
              onClick={() => {
                if (confirm(`Delete issue ${issueKey}? This cannot be undone.`)) {
                  deleteMut.mutate()
                }
              }}
              disabled={deleteMut.isPending}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleteMut.isPending ? 'Deleting...' : 'Delete Issue'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
