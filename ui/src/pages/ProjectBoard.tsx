import { useState, type DragEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProject, getProjectIssues, transitionIssue, deleteProject, updateIssue } from '@/lib/api'
import { IssueCard } from '@/components/IssueCard'
import { CreateIssueDialog } from '@/components/CreateIssueDialog'
import { ChatPanel } from '@/components/ChatPanel'
import { isAdmin } from '@/lib/auth'
import { Loader2, Plus, List, Columns3, MessageCircle, Trash2 } from 'lucide-react'
import { STATUS_COLORS, ISSUE_TYPE_ICONS, PRIORITY_CONFIG, getInitials } from '@/lib/utils'

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done'] as const

export function ProjectBoard() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [filterType, setFilterType] = useState('')
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: project } = useQuery({
    queryKey: ['project', projectKey],
    queryFn: () => getProject(projectKey!),
    enabled: !!projectKey,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['projectIssues', projectKey],
    queryFn: () => getProjectIssues(projectKey!, { limit: '100' }),
    enabled: !!projectKey,
  })

  const transitionMut = useMutation({
    mutationFn: ({ key, status }: { key: string; status: string }) => updateIssue(key, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projectIssues', projectKey] }),
  })

  const deleteProjectMut = useMutation({
    mutationFn: () => deleteProject(projectKey!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/')
    },
  })

  const allIssues = data?.issues || []
  const issues = filterType
    ? allIssues.filter((i: any) => i.fields?.issuetype?.name === filterType)
    : allIssues

  const grouped: Record<string, any[]> = { 'To Do': [], 'In Progress': [], 'In Review': [], Done: [] }
  for (const i of issues) {
    const s = i.fields?.status?.name || 'To Do'
    if (grouped[s]) grouped[s].push(i)
    else grouped['To Do'].push(i)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const issueTypes = [...new Set(allIssues.map((i: any) => i.fields?.issuetype?.name))].filter(Boolean)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              Projects
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">{project?.name || projectKey}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{project?.name || projectKey}</h1>
          {project?.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border dark:border-slate-600 rounded-md overflow-hidden">
            <button
              onClick={() => setView('board')}
              className={`px-3 py-1.5 text-sm ${view === 'board' ? 'bg-primary text-primary-foreground' : 'bg-white dark:bg-slate-800 text-muted-foreground hover:bg-muted'}`}
            >
              <Columns3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm ${view === 'list' ? 'bg-primary text-primary-foreground' : 'bg-white dark:bg-slate-800 text-muted-foreground hover:bg-muted'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {/* Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border dark:border-slate-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-800"
          >
            <option value="">All Types</option>
            {issueTypes.map((t: any) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button
            onClick={() => setShowChat(!showChat)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border dark:border-slate-600 transition-colors ${
              showChat
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-white dark:bg-slate-800 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Chat
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Issue
          </button>
          {isAdmin() && (
            <button
              onClick={() => {
                if (confirm(`Delete project ${projectKey} and all its issues? This cannot be undone.`)) {
                  deleteProjectMut.mutate()
                }
              }}
              disabled={deleteProjectMut.isPending}
              className="inline-flex items-center gap-1 px-3 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-md text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
              title="Delete Project (Admin)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {view === 'board' ? (
        /* Kanban Board with Drag & Drop */
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div key={col} className="flex flex-col">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[col]}`}>
                  {col}
                </span>
                <span className="text-xs text-muted-foreground">{grouped[col].length}</span>
              </div>
              <div
                className={`space-y-2.5 min-h-[200px] rounded-lg p-2 transition-colors ${
                  dragOverCol === col ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-slate-50/50 dark:bg-slate-800/50'
                }`}
                onDragOver={(e: DragEvent) => { e.preventDefault(); setDragOverCol(col) }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e: DragEvent) => {
                  e.preventDefault()
                  setDragOverCol(null)
                  const issueKey = e.dataTransfer.getData('text/plain')
                  if (issueKey) transitionMut.mutate({ key: issueKey, status: col })
                }}
              >
                {grouped[col].map((issue: any) => (
                  <div
                    key={issue.key}
                    draggable
                    onDragStart={(e: DragEvent) => {
                      e.dataTransfer.setData('text/plain', issue.key)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <IssueCard issue={issue} />
                  </div>
                ))}
                {grouped[col].length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No issues</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Key</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Summary</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Priority</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue: any) => {
                const f = issue.fields
                const statusName = f.status?.name || 'To Do'
                const priorityName = f.priority?.name || 'Medium'
                const typeName = f.issuetype?.name || 'Task'
                return (
                  <tr key={issue.key} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link to={`/issues/${issue.key}`} className="font-medium text-primary hover:underline">
                        {issue.key}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link to={`/issues/${issue.key}`} className="hover:text-primary transition-colors">
                        {f.summary}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs">{ISSUE_TYPE_ICONS[typeName] || '\u{1F4CB}'} {typeName}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[statusName] || 'bg-slate-100'}`}>
                        {statusName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs ${PRIORITY_CONFIG[priorityName]?.color || ''}`}>
                        {priorityName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {f.assignee ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[8px] font-bold">
                            {getInitials(f.assignee.displayName)}
                          </div>
                          <span className="text-xs">{f.assignee.displayName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {issues.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No issues found</p>
            </div>
          )}
        </div>
      )}

      <CreateIssueDialog projectKey={projectKey!} open={showCreate} onClose={() => setShowCreate(false)} />
      <ChatPanel projectKey={projectKey!} open={showChat} onClose={() => setShowChat(false)} />
    </div>
  )
}
