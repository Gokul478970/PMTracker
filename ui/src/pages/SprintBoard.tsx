import { useState, useEffect, type DragEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getBoards, getBoardSprints, getSprintIssues, getSprint,
  updateSprint, updateIssue, getProjectIssues, getProjectVersions,
  getAssignments, getUsers,
} from '@/lib/api'
import { isAdmin, isDemo, getEmail } from '@/lib/auth'
import { IssueCard } from '@/components/IssueCard'
import { STATUS_COLORS } from '@/lib/utils'
import { Loader2, Play, Square, BarChart3, ListFilter, User } from 'lucide-react'

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done'] as const

export function SprintBoard() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const qc = useQueryClient()
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [showProgress, setShowProgress] = useState(false)
  const [showChildTasks, setShowChildTasks] = useState(false)
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false)

  const { data: boards } = useQuery({
    queryKey: ['boards', projectKey],
    queryFn: () => getBoards(projectKey),
    enabled: !!projectKey,
  })
  const boardId = boards?.[0]?.id

  const { data: sprints, isLoading: sprintsLoading } = useQuery({
    queryKey: ['sprints', boardId],
    queryFn: () => getBoardSprints(boardId!),
    enabled: !!boardId,
  })

  const { data: assignments } = useQuery({
    queryKey: ['assignments', projectKey],
    queryFn: () => getAssignments(projectKey!),
    enabled: !!projectKey,
  })
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const currentEmail = getEmail()
  const currentAccountId = (users || []).find((u: any) => u.emailAddress === currentEmail)?.accountId
  const canManageSprints = isAdmin() || (assignments || []).some(
    (a: any) => a.email === currentEmail && a.role === 'Project Admin' && !a.end_date
  )
  const readOnly = isDemo()

  // Default to active sprint
  const activeSprint = (sprints || []).find((s: any) => s.state === 'active')
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null)
  const sprintId = selectedSprintId || activeSprint?.id

  // Reset selected sprint when project changes
  useEffect(() => { setSelectedSprintId(null) }, [projectKey])

  const { data: sprintIssues, isLoading } = useQuery({
    queryKey: ['sprintIssues', sprintId],
    queryFn: () => getSprintIssues(sprintId!),
    enabled: !!sprintId,
    staleTime: 0,
  })

  const currentSprint = (sprints || []).find((s: any) => s.id === sprintId)

  const { data: allData } = useQuery({
    queryKey: ['projectIssues', projectKey, 'board'],
    queryFn: () => getProjectIssues(projectKey!, { limit: '200' }),
    enabled: !!projectKey && showProgress,
  })
  const { data: versions } = useQuery({
    queryKey: ['versions', projectKey],
    queryFn: () => getProjectVersions(projectKey!),
    enabled: !!projectKey && showProgress,
  })

  const transitionMut = useMutation({
    mutationFn: ({ key, status }: { key: string; status: string }) => updateIssue(key, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprintIssues', sprintId] }),
  })

  const startSprintMut = useMutation({
    mutationFn: () => updateSprint(sprintId!, { state: 'active' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', boardId] }),
  })

  const completeSprintMut = useMutation({
    mutationFn: () => updateSprint(sprintId!, { state: 'closed' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', boardId] }),
  })

  if (sprintsLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const nonClosedSprints = (sprints || []).filter((s: any) => s.state !== 'closed')
  const rawIssues = sprintIssues || []

  // Filter: hide child tasks by default
  let filteredIssues = rawIssues
  if (!showChildTasks) {
    filteredIssues = filteredIssues.filter((i: any) => !i.fields?.parent)
  }
  // Filter: "My Tasks" — show only issues assigned to current user
  if (showMyTasksOnly && currentAccountId) {
    filteredIssues = filteredIssues.filter(
      (i: any) => i.fields?.assignee?.accountId === currentAccountId
    )
  }

  const issues = filteredIssues
  const grouped: Record<string, any[]> = { 'To Do': [], 'In Progress': [], 'In Review': [], Done: [] }
  for (const i of issues) {
    const s = i.fields?.status?.name || 'To Do'
    if (grouped[s]) grouped[s].push(i)
    else grouped['To Do'].push(i)
  }

  const totalPoints = issues.reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)
  const donePoints = grouped['Done'].reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)

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
            <span className="text-sm font-medium">Sprint Board</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {currentSprint?.name || 'No Sprint Selected'}
            </h1>
            {nonClosedSprints.length > 1 && (
              <select
                value={sprintId || ''}
                onChange={(e) => setSelectedSprintId(e.target.value)}
                className="border dark:border-slate-600 rounded-md px-2 py-1 text-sm dark:bg-slate-800"
              >
                {nonClosedSprints.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.state})
                  </option>
                ))}
              </select>
            )}
          </div>
          {currentSprint?.goal && (
            <p className="text-sm text-muted-foreground mt-1">Goal: {currentSprint.goal}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Progress */}
          {totalPoints > 0 && (
            <div className="flex items-center gap-2 mr-3">
              <div className="w-32 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.round((donePoints / totalPoints) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {donePoints}/{totalPoints} pts
              </span>
            </div>
          )}
          <button
            onClick={() => setShowChildTasks(!showChildTasks)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors dark:border-slate-600 ${showChildTasks ? 'bg-primary/10 border-primary text-primary' : ''}`}
          >
            <ListFilter className="w-4 h-4" />
            Tasks
          </button>
          <button
            onClick={() => setShowMyTasksOnly(!showMyTasksOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors dark:border-slate-600 ${showMyTasksOnly ? 'bg-primary/10 border-primary text-primary' : ''}`}
          >
            <User className="w-4 h-4" />
            My Tasks
          </button>
          <button
            onClick={() => setShowProgress(!showProgress)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors dark:border-slate-600 ${showProgress ? 'bg-muted' : ''}`}
          >
            <BarChart3 className="w-4 h-4" />
            Progress
          </button>
          {!readOnly && canManageSprints && currentSprint?.state === 'future' && (
            <button
              onClick={() => startSprintMut.mutate()}
              disabled={startSprintMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Start Sprint
            </button>
          )}
          {!readOnly && canManageSprints && currentSprint?.state === 'active' && (
            <button
              onClick={() => completeSprintMut.mutate()}
              disabled={completeSprintMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 border border-green-600 text-green-600 rounded-md text-sm font-medium hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
            >
              <Square className="w-4 h-4" />
              Complete Sprint
            </button>
          )}
        </div>
      </div>

      {/* Progress Panel */}
      {showProgress && sprintId && (() => {
        const sDone = grouped['Done'].length
        const sIP = grouped['In Progress'].length + grouped['In Review'].length
        const sTodo = grouped['To Do'].length
        const sTotal = sDone + sIP + sTodo

        const allIssues: any[] = allData?.issues || []
        const allEpics = allIssues.filter((i: any) => i.fields?.issuetype?.name === 'Epic')
        const allWork = allIssues.filter((i: any) => i.fields?.issuetype?.name !== 'Epic')

        const epicProgress = allEpics.map((epic: any) => {
          const items = allWork.filter((i: any) => i.fields?.epic === epic.key)
          const done = items.filter((i: any) => i.fields?.status?.name === 'Done').length
          const ip = items.filter((i: any) => ['In Progress', 'In Review'].includes(i.fields?.status?.name)).length
          return { epic, done, inProgress: ip, todo: items.length - done - ip, total: items.length }
        }).filter((ep: any) => ep.total > 0)

        const versionProgress = (versions || []).map((v: any) => {
          const vi = allWork.filter((i: any) => (i.fields?.fixVersions || []).some((fv: any) => fv.name === v.name))
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
            <h3 className="text-sm font-semibold mb-4">Sprint Progress</h3>

            {/* Sprint Velocity */}
            {(() => {
              const allSprintsList = sprints || []
              const velocityData = allSprintsList
                .map((s: any) => {
                  const sIssues = allIssues.filter((i: any) => String(i.fields?.sprint) === String(s.id))
                  const planned = sIssues.reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)
                  const actual = sIssues
                    .filter((i: any) => i.fields?.status?.name === 'Done')
                    .reduce((sum: number, i: any) => sum + (i.fields?.customfield_10001 || 0), 0)
                  return { sprint: s, planned, actual, issueCount: sIssues.length }
                })
                .filter((v: any) => v.issueCount > 0)

              if (velocityData.length === 0) return null

              const velStateColors: Record<string, string> = {
                active: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                future: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                closed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
              }

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
                            <span className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${velStateColors[v.sprint.state] || ''}`}>
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

            {/* Current Sprint */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{currentSprint?.name || 'Current Sprint'}</span>
                <span className="text-muted-foreground text-xs">{sTotal} issues &middot; {donePoints}/{totalPoints} pts</span>
              </div>
              {segBar(sDone, sIP, sTodo)}
              {legend(sDone, sIP, sTodo)}
            </div>

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

      {!sprintId ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No active sprint. Go to <Link to={`/projects/${projectKey}/backlog`} className="text-primary hover:underline">Backlog</Link> to create one.</p>
        </div>
      ) : (
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
                onDragOver={(e: DragEvent) => { if (!readOnly) { e.preventDefault(); setDragOverCol(col) } }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e: DragEvent) => {
                  if (readOnly) return
                  e.preventDefault()
                  setDragOverCol(null)
                  const issueKey = e.dataTransfer.getData('text/plain')
                  if (issueKey) transitionMut.mutate({ key: issueKey, status: col })
                }}
              >
                {grouped[col].map((issue: any) => (
                  <div
                    key={issue.key}
                    draggable={!readOnly}
                    onDragStart={(e: DragEvent) => {
                      if (readOnly) { e.preventDefault(); return }
                      e.dataTransfer.setData('text/plain', issue.key)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    className={readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
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
      )}

      {(startSprintMut.isError || completeSprintMut.isError) && (
        <p className="text-sm text-destructive mt-3">
          {(startSprintMut.error as Error)?.message || (completeSprintMut.error as Error)?.message}
        </p>
      )}
    </div>
  )
}
