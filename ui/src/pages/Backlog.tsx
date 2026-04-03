import { useState, type DragEvent } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProjectIssues, getBoards, getBoardSprints,
  createSprint, addIssuesToSprint, updateIssue, updateSprint, getProjectVersions,
  getAssignments,
} from '@/lib/api'
import { CreateIssueDialog } from '@/components/CreateIssueDialog'
import { ImportCsvDialog } from '@/components/ImportCsvDialog'
import { isAdmin, isDemo, getEmail } from '@/lib/auth'
import { STATUS_COLORS, ISSUE_TYPE_ICONS, PRIORITY_CONFIG, getInitials } from '@/lib/utils'
import { Loader2, Plus, ChevronDown, ChevronRight, Play, Square, Settings, Calendar, BarChart3, FileUp, Filter, ChevronLeft } from 'lucide-react'

const PAGE_SIZE = 50

const sortByKey = (a: any, b: any) => {
  const numA = parseInt(a.key.split('-')[1]) || 0
  const numB = parseInt(b.key.split('-')[1]) || 0
  return numA - numB
}

export function Backlog() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const epicFilter = searchParams.get('epic')
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set(['backlog']))
  const [newSprintName, setNewSprintName] = useState('')
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set())
  const [moveToSprint, setMoveToSprint] = useState('')
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [editingSprint, setEditingSprint] = useState<string | null>(null)
  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', startDate: '', endDate: '' })
  const [showProgress, setShowProgress] = useState(false)
  const [backlogPage, setBacklogPage] = useState(0)
  const readOnly = isDemo()

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

  const { data: allData, isLoading } = useQuery({
    queryKey: ['projectIssues', projectKey, 'backlog'],
    queryFn: () => getProjectIssues(projectKey!, { limit: '5000' }),
    enabled: !!projectKey,
  })

  const { data: versions } = useQuery({
    queryKey: ['versions', projectKey],
    queryFn: () => getProjectVersions(projectKey!),
    enabled: !!projectKey && showProgress,
  })

  const { data: assignments } = useQuery({
    queryKey: ['assignments', projectKey],
    queryFn: () => getAssignments(projectKey!),
    enabled: !!projectKey,
  })
  const currentEmail = getEmail()
  const canManageSprints = isAdmin() || (assignments || []).some(
    (a: any) => a.email === currentEmail && a.role === 'Project Admin' && !a.end_date
  )

  const createSprintMut = useMutation({
    mutationFn: () => createSprint({ board_id: boardId!, name: newSprintName || `Sprint ${(sprints?.length || 0) + 1}` }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', boardId] })
      setNewSprintName('')
    },
  })

  const updateSprintMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateSprint(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', boardId] })
      setEditingSprint(null)
    },
  })

  const moveToSprintMut = useMutation({
    mutationFn: ({ sprintId, keys }: { sprintId: string; keys: string[] }) => addIssuesToSprint(sprintId, keys),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectIssues', projectKey] })
      setSelectedIssues(new Set())
      setMoveToSprint('')
    },
  })

  const removeFromSprintMut = useMutation({
    mutationFn: (keys: string[]) =>
      Promise.all(keys.map((k) => updateIssue(k, { sprint_id: '' }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectIssues', projectKey] })
      setSelectedIssues(new Set())
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const allIssues: any[] = allData?.issues || []
  const nonClosedSprints = (sprints || []).filter((s: any) => s.state !== 'closed')
  const closedSprints = (sprints || []).filter((s: any) => s.state === 'closed')

  // Separate epics from work items (exclude Tasks/Sub-tasks from backlog view)
  const epics = allIssues.filter((i: any) => i.fields?.issuetype?.name === 'Epic')
  const workItems = allIssues.filter((i: any) => {
    const typeName = i.fields?.issuetype?.name
    return typeName !== 'Epic' && typeName !== 'Task' && typeName !== 'Sub-task'
  })
  const filteredIssues = epicFilter
    ? workItems.filter((i: any) => i.fields?.epic === epicFilter)
    : workItems

  const sprintIssues: Record<string, any[]> = {}
  const backlogIssuesAll: any[] = []
  for (const s of [...nonClosedSprints, ...closedSprints]) {
    sprintIssues[s.id] = []
  }
  for (const issue of filteredIssues) {
    const sid = issue.fields?.sprint
    if (sid && sprintIssues[sid]) {
      sprintIssues[sid].push(issue)
    } else if (!sid) {
      backlogIssuesAll.push(issue)
    }
  }
  // Sort all lists by issue key ascending
  backlogIssuesAll.sort(sortByKey)
  for (const sid of Object.keys(sprintIssues)) {
    sprintIssues[sid].sort(sortByKey)
  }
  // Paginate backlog
  const totalBacklog = backlogIssuesAll.length
  const totalPages = Math.max(1, Math.ceil(totalBacklog / PAGE_SIZE))
  const safePage = Math.min(backlogPage, totalPages - 1)
  const backlogIssues = backlogIssuesAll.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const showingFrom = totalBacklog > 0 ? safePage * PAGE_SIZE + 1 : 0
  const showingTo = Math.min((safePage + 1) * PAGE_SIZE, totalBacklog)

  const toggle = (id: string) => {
    const s = new Set(expandedSprints)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setExpandedSprints(s)
  }

  const toggleIssue = (key: string) => {
    const s = new Set(selectedIssues)
    if (s.has(key)) s.delete(key)
    else s.add(key)
    setSelectedIssues(s)
  }

  const stateColors: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    future: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    closed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  }

  const handleDrop = (targetId: string, e: DragEvent) => {
    e.preventDefault()
    setDragOverTarget(null)
    const issueKey = e.dataTransfer.getData('text/plain')
    if (!issueKey) return
    if (targetId === 'backlog') {
      removeFromSprintMut.mutate([issueKey])
    } else {
      moveToSprintMut.mutate({ sprintId: targetId, keys: [issueKey] })
    }
  }

  const openSprintEdit = (sprint: any) => {
    setEditingSprint(sprint.id)
    setSprintForm({
      name: sprint.name || '',
      goal: sprint.goal || '',
      startDate: sprint.startDate ? sprint.startDate.split('T')[0] : '',
      endDate: sprint.endDate ? sprint.endDate.split('T')[0] : '',
    })
  }

  const saveSprintEdit = (sprintId: string) => {
    updateSprintMut.mutate({
      id: sprintId,
      data: {
        name: sprintForm.name || undefined,
        goal: sprintForm.goal || undefined,
        start_date: sprintForm.startDate ? `${sprintForm.startDate}T00:00:00.000Z` : undefined,
        end_date: sprintForm.endDate ? `${sprintForm.endDate}T00:00:00.000Z` : undefined,
      },
    })
  }

  const formatDate = (d: string | null) => {
    if (!d) return null
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function IssueRow({ issue }: { issue: any }) {
    const f = issue.fields
    const isDone = f.status?.name === 'Done'
    return (
      <div
        draggable={!readOnly}
        onDragStart={(e: DragEvent) => {
          if (readOnly) { e.preventDefault(); return }
          e.dataTransfer.setData('text/plain', issue.key)
          e.dataTransfer.effectAllowed = 'move'
        }}
        className={`flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 border-b last:border-b-0 text-sm ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${isDone ? 'opacity-50 bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
      >
        {!readOnly && (
          <input
            type="checkbox"
            checked={selectedIssues.has(issue.key)}
            onChange={() => toggleIssue(issue.key)}
            className="shrink-0"
          />
        )}
        <span className="text-xs text-muted-foreground w-8 shrink-0">{ISSUE_TYPE_ICONS[f.issuetype?.name] || '\u{1F4CB}'}</span>
        <Link to={`/issues/${issue.key}`} className="font-medium text-primary hover:underline w-24 shrink-0">
          {issue.key}
        </Link>
        <Link to={`/issues/${issue.key}`} className={`flex-1 truncate hover:text-primary transition-colors ${isDone ? 'line-through' : ''}`}>
          {f.summary}
        </Link>
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[f.status?.name] || 'bg-slate-100'}`}>
          {f.status?.name || 'To Do'}
        </span>
        <span className={`text-xs w-14 text-right ${PRIORITY_CONFIG[f.priority?.name]?.color || ''}`}>
          {f.priority?.name || 'Medium'}
        </span>
        {f.customfield_10001 != null && (
          <span className="text-xs bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5 w-8 text-center">{f.customfield_10001}</span>
        )}
        {f.estimate_hours != null && (
          <span className="text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full px-2 py-0.5 text-center">{f.estimate_hours}h</span>
        )}
        <div className="w-20 shrink-0 text-right">
          {f.assignee ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[8px] font-bold">
                {getInitials(f.assignee.displayName)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      </div>
    )
  }

  function SprintSection({ sprint, issues }: { sprint: any; issues: any[] }) {
    const expanded = expandedSprints.has(sprint.id)
    const totalPoints = issues.reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)
    const isDragOver = dragOverTarget === sprint.id
    const isEditing = editingSprint === sprint.id
    return (
      <div
        className={`rounded-lg border dark:border-slate-700 mb-3 transition-colors ${isDragOver ? 'ring-2 ring-primary/40 bg-primary/5' : ''} ${sprint.state === 'closed' ? 'opacity-60 bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-800'}`}
        onDragOver={(e: DragEvent) => { if (!readOnly) { e.preventDefault(); setDragOverTarget(sprint.id) } }}
        onDragLeave={() => setDragOverTarget(null)}
        onDrop={(e) => { if (!readOnly) handleDrop(sprint.id, e) }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => toggle(sprint.id)} className="hover:bg-slate-100 dark:hover:bg-slate-700 rounded p-0.5">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <span className="font-semibold text-sm">{sprint.name}</span>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stateColors[sprint.state] || 'bg-slate-100'}`}>
            {sprint.state}
          </span>
          <span className="text-xs text-muted-foreground">
            {issues.length} issues {totalPoints > 0 && `\u00B7 ${totalPoints} points`}
          </span>
          {(sprint.startDate || sprint.endDate) && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(sprint.startDate)} {sprint.endDate && `- ${formatDate(sprint.endDate)}`}
            </span>
          )}
          {sprint.goal && <span className="text-xs text-muted-foreground ml-1 truncate max-w-48">- {sprint.goal}</span>}

          {/* Sprint actions (admin & project admin) */}
          {canManageSprints && !readOnly && (
            <div className="ml-auto flex items-center gap-1.5">
              {sprint.state === 'future' && (
                <button
                  onClick={(e) => { e.stopPropagation(); updateSprintMut.mutate({ id: sprint.id, data: { state: 'active' } }) }}
                  disabled={updateSprintMut.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <Play className="w-3 h-3" /> Start
                </button>
              )}
              {sprint.state === 'active' && (
                <button
                  onClick={(e) => { e.stopPropagation(); updateSprintMut.mutate({ id: sprint.id, data: { state: 'closed' } }) }}
                  disabled={updateSprintMut.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-green-600 text-green-600 rounded text-xs font-medium hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50"
                >
                  <Square className="w-3 h-3" /> Complete
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); isEditing ? setEditingSprint(null) : openSprintEdit(sprint) }}
                className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Edit sprint"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Sprint edit form */}
        {isEditing && (
          <div className="px-4 pb-3 border-t dark:border-slate-700 pt-3">
            {/* Velocity metrics — read-only */}
            <div className="flex gap-6 mb-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Planned Velocity</label>
                <span className="text-lg font-semibold">
                  {issues.reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)}
                  <span className="text-xs text-muted-foreground ml-1">pts</span>
                </span>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Actual Velocity</label>
                <span className="text-lg font-semibold">
                  {issues.filter((i: any) => i.fields?.status?.name === 'Done')
                    .reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)}
                  <span className="text-xs text-muted-foreground ml-1">pts</span>
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Sprint Name</label>
                <input
                  value={sprintForm.name}
                  onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
                  className="w-full border dark:border-slate-600 rounded px-2 py-1.5 text-sm dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Goal</label>
                <input
                  value={sprintForm.goal}
                  onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })}
                  placeholder="Sprint goal"
                  className="w-full border dark:border-slate-600 rounded px-2 py-1.5 text-sm dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
                <input
                  type="date"
                  value={sprintForm.startDate}
                  onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })}
                  className="w-full border dark:border-slate-600 rounded px-2 py-1.5 text-sm dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">End Date</label>
                <input
                  type="date"
                  value={sprintForm.endDate}
                  onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })}
                  className="w-full border dark:border-slate-600 rounded px-2 py-1.5 text-sm dark:bg-slate-700"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => saveSprintEdit(sprint.id)}
                disabled={updateSprintMut.isPending}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {updateSprintMut.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingSprint(null)}
                className="px-3 py-1.5 border dark:border-slate-600 rounded text-xs"
              >
                Cancel
              </button>
            </div>
            {updateSprintMut.isError && (
              <p className="text-xs text-destructive mt-2">{(updateSprintMut.error as Error).message}</p>
            )}
          </div>
        )}

        {expanded && (
          <div className="border-t dark:border-slate-700">
            {issues.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {isDragOver ? 'Drop here to add to sprint' : 'No issues in this sprint'}
              </p>
            ) : (
              issues.map((i: any) => <IssueRow key={i.key} issue={i} />)
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to={`/projects/${projectKey}`} className="text-sm text-muted-foreground hover:text-foreground">
              {projectKey}
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">Backlog</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Product Backlog</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Drag issues between sprints and backlog
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && selectedIssues.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedIssues.size} selected</span>
              <select
                value={moveToSprint}
                onChange={(e) => {
                  if (e.target.value === '__remove__') {
                    removeFromSprintMut.mutate([...selectedIssues])
                  } else if (e.target.value) {
                    moveToSprintMut.mutate({ sprintId: e.target.value, keys: [...selectedIssues] })
                  }
                  setMoveToSprint('')
                }}
                className="border rounded-md px-2 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-600"
              >
                <option value="">Move to...</option>
                {nonClosedSprints.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value="__remove__">Remove from sprint</option>
              </select>
            </div>
          )}
          <button
            onClick={() => setShowProgress(!showProgress)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors dark:border-slate-600 ${showProgress ? 'bg-muted' : ''}`}
          >
            <BarChart3 className="w-4 h-4" />
            Progress
          </button>
          {!readOnly && canManageSprints && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors dark:border-slate-600"
              >
                <FileUp className="w-4 h-4" />
                Import CSV
              </button>
              <button
                onClick={() => createSprintMut.mutate()}
                disabled={!boardId || createSprintMut.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 dark:border-slate-600"
              >
                <Plus className="w-4 h-4" />
                Create Sprint
              </button>
            </>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Issue
            </button>
          )}
        </div>
      </div>

      {/* Epic Filter */}
      {epics.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={epicFilter || ''}
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                setSearchParams({ epic: val })
              } else {
                setSearchParams({})
              }
              setBacklogPage(0)
            }}
            className="border dark:border-slate-600 rounded-md px-3 py-1.5 text-sm dark:bg-slate-800 min-w-[200px]"
          >
            <option value="">All Epics</option>
            {epics.map((e: any) => (
              <option key={e.key} value={e.key}>{e.key} — {e.fields?.summary || 'Untitled'}</option>
            ))}
          </select>
          {epicFilter && (
            <button
              onClick={() => { setSearchParams({}); setBacklogPage(0) }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Progress Panel */}
      {showProgress && (() => {
        const activeSpr = nonClosedSprints.find((s: any) => s.state === 'active')
        const asIssues = activeSpr ? (sprintIssues[activeSpr.id] || []) : []
        const asDone = asIssues.filter((i: any) => i.fields?.status?.name === 'Done').length
        const asIP = asIssues.filter((i: any) => ['In Progress', 'In Review'].includes(i.fields?.status?.name)).length
        const asTodo = asIssues.length - asDone - asIP

        const blDone = backlogIssuesAll.filter((i: any) => i.fields?.status?.name === 'Done').length
        const blIP = backlogIssuesAll.filter((i: any) => ['In Progress', 'In Review'].includes(i.fields?.status?.name)).length
        const blTodo = backlogIssuesAll.length - blDone - blIP

        const epicProgress = epics.map((epic: any) => {
          const items = workItems.filter((i: any) => i.fields?.epic === epic.key)
          const done = items.filter((i: any) => i.fields?.status?.name === 'Done').length
          const ip = items.filter((i: any) => ['In Progress', 'In Review'].includes(i.fields?.status?.name)).length
          return { epic, done, inProgress: ip, todo: items.length - done - ip, total: items.length }
        }).filter((ep: any) => ep.total > 0)

        const versionProgress = (versions || []).map((v: any) => {
          const vi = workItems.filter((i: any) => (i.fields?.fixVersions || []).some((fv: any) => fv.name === v.name))
          const done = vi.filter((i: any) => i.fields?.status?.name === 'Done').length
          const ip = vi.filter((i: any) => ['In Progress', 'In Review'].includes(i.fields?.status?.name)).length
          return { version: v, done, inProgress: ip, todo: vi.length - done - ip, total: vi.length }
        }).filter((vp: any) => vp.total > 0)

        const segBar = (done: number, ip: number, todo: number) => {
          const total = done + ip + todo
          if (total === 0) return <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5" />
          const dPct = (done / total) * 100
          const iPct = (ip / total) * 100
          return (
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 flex overflow-hidden">
              {dPct > 0 && <div className="bg-emerald-500 h-2.5 transition-all" style={{ width: `${dPct}%` }} />}
              {iPct > 0 && <div className="bg-blue-500 h-2.5 transition-all" style={{ width: `${iPct}%` }} />}
            </div>
          )
        }

        const legend = (done: number, ip: number, todo: number) => (
          <div className="flex gap-3 text-[10px] mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{done} Done</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{ip} In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />{todo} To Do</span>
          </div>
        )

        return (
          <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-5 mb-5">
            <h3 className="text-sm font-semibold mb-4">Project Progress</h3>

            {/* Sprint Velocity */}
            {(() => {
              const allSprints = [...nonClosedSprints, ...closedSprints]
              const velocityData = allSprints
                .map((s: any) => {
                  const sIssues = sprintIssues[s.id] || []
                  const planned = sIssues.reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)
                  const actual = sIssues
                    .filter((i: any) => i.fields?.status?.name === 'Done')
                    .reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)
                  return { sprint: s, planned, actual, issueCount: sIssues.length }
                })
                .filter((v: any) => v.issueCount > 0)

              if (velocityData.length === 0) return null

              return (
                <div className="mb-4 pb-4 border-b dark:border-slate-700">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sprint Velocity</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left font-medium pb-1">Sprint</th>
                        <th className="text-right font-medium pb-1">Planned</th>
                        <th className="text-right font-medium pb-1">Actual</th>
                        <th className="text-right font-medium pb-1">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {velocityData.map((v: any) => (
                        <tr key={v.sprint.id} className="border-t dark:border-slate-700/50">
                          <td className="py-1.5">
                            <span className="font-medium">{v.sprint.name}</span>
                            <span className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${stateColors[v.sprint.state] || ''}`}>
                              {v.sprint.state}
                            </span>
                          </td>
                          <td className="text-right py-1.5">{v.planned} pts</td>
                          <td className="text-right py-1.5 font-medium">{v.actual} pts</td>
                          <td className="text-right py-1.5">
                            {v.planned > 0 ? `${Math.round((v.actual / v.planned) * 100)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            {/* Active Sprint */}
            {activeSpr && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{activeSpr.name}</span>
                  <span className="text-muted-foreground text-xs">{asIssues.length} issues</span>
                </div>
                {segBar(asDone, asIP, asTodo)}
                {legend(asDone, asIP, asTodo)}
              </div>
            )}

            {/* Backlog */}
            {backlogIssues.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">Backlog</span>
                  <span className="text-muted-foreground text-xs">{backlogIssuesAll.length} issues</span>
                </div>
                {segBar(blDone, blIP, blTodo)}
                {legend(blDone, blIP, blTodo)}
              </div>
            )}

            {/* Epics */}
            {epicProgress.length > 0 && (
              <div className="mt-4 pt-3 border-t dark:border-slate-700">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Epics</h4>
                {epicProgress.map((ep: any) => (
                  <div key={ep.epic.key} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{ep.epic.fields?.summary || ep.epic.key}</span>
                      <span className="text-muted-foreground">{ep.done}/{ep.total} done</span>
                    </div>
                    {segBar(ep.done, ep.inProgress, ep.todo)}
                  </div>
                ))}
              </div>
            )}

            {/* Versions */}
            {versionProgress.length > 0 && (
              <div className="mt-4 pt-3 border-t dark:border-slate-700">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Releases</h4>
                {versionProgress.map((vp: any) => (
                  <div key={vp.version.name} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{vp.version.name}</span>
                      <span className="text-muted-foreground">{vp.done}/{vp.total} done</span>
                    </div>
                    {segBar(vp.done, vp.inProgress, vp.todo)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Active/Future Sprints */}
      {nonClosedSprints.map((sprint: any) => (
        <SprintSection key={sprint.id} sprint={sprint} issues={sprintIssues[sprint.id] || []} />
      ))}

      {/* Backlog */}
      <div
        className={`bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 mb-3 transition-colors ${dragOverTarget === 'backlog' ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
        onDragOver={(e: DragEvent) => { if (!readOnly) { e.preventDefault(); setDragOverTarget('backlog') } }}
        onDragLeave={() => setDragOverTarget(null)}
        onDrop={(e) => { if (!readOnly) handleDrop('backlog', e) }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
          onClick={() => toggle('backlog')}
        >
          {expandedSprints.has('backlog') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-semibold text-sm">Backlog</span>
          <span className="text-xs text-muted-foreground">{totalBacklog} issues</span>
        </div>
        {expandedSprints.has('backlog') && (
          <div className="border-t dark:border-slate-700">
            {backlogIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No items in backlog</p>
            ) : (
              <>
                {backlogIssues.map((i: any) => <IssueRow key={i.key} issue={i} />)}
                {totalBacklog > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-xs text-muted-foreground">
                      Showing {showingFrom}–{showingTo} of {totalBacklog}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setBacklogPage(Math.max(0, safePage - 1))}
                        disabled={safePage === 0}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border dark:border-slate-600 rounded text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-3 h-3" /> Previous
                      </button>
                      <span className="text-xs text-muted-foreground">
                        Page {safePage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setBacklogPage(Math.min(totalPages - 1, safePage + 1))}
                        disabled={safePage >= totalPages - 1}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border dark:border-slate-600 rounded text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Completed Sprints */}
      {closedSprints.length > 0 && (
        <div className="mt-6">
          <p className="px-1 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Completed Sprints ({closedSprints.length})
          </p>
          {closedSprints.map((sprint: any) => (
            <SprintSection key={sprint.id} sprint={sprint} issues={sprintIssues[sprint.id] || []} />
          ))}
        </div>
      )}

      <CreateIssueDialog projectKey={projectKey!} open={showCreate} onClose={() => setShowCreate(false)} />
      <ImportCsvDialog projectKey={projectKey!} open={showImport} onClose={() => setShowImport(false)} />
    </div>
  )
}
