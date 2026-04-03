import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createIssue, getUsers, getProjectIssues, getProjectVersions, getBoards, getBoardSprints } from '@/lib/api'
import { X } from 'lucide-react'

interface Props {
  projectKey: string
  open: boolean
  onClose: () => void
}

export function CreateIssueDialog({ projectKey, open, onClose }: Props) {
  const qc = useQueryClient()
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: projectData } = useQuery({
    queryKey: ['projectIssues', projectKey, 'all'],
    queryFn: () => getProjectIssues(projectKey, { limit: '200' }),
  })
  const { data: versions } = useQuery({
    queryKey: ['versions', projectKey],
    queryFn: () => getProjectVersions(projectKey),
  })
  const { data: boards } = useQuery({
    queryKey: ['boards', projectKey],
    queryFn: () => getBoards(projectKey),
  })
  const boardId = boards?.[0]?.id
  const { data: sprints } = useQuery({
    queryKey: ['sprints', boardId],
    queryFn: () => getBoardSprints(boardId!),
    enabled: !!boardId,
  })

  const defaultForm = {
    summary: '',
    issue_type: 'Story',
    description: '',
    priority: 'Medium',
    assignee: '',
    labels: '',
    components: '',
    story_points: '',
    estimate_hours: '',
    parent_key: '',
    fix_version: '',
    sprint_id: '',
  }
  const [form, setForm] = useState(defaultForm)

  const mutation = useMutation({
    mutationFn: () =>
      createIssue({
        project_key: projectKey,
        summary: form.summary,
        issue_type: form.issue_type,
        description: form.description,
        priority: form.priority,
        assignee: form.assignee || undefined,
        labels: form.labels ? form.labels.split(',').map((l) => l.trim()) : [],
        components: form.components ? form.components.split(',').map((c) => c.trim()) : [],
        story_points: form.story_points ? parseInt(form.story_points) : undefined,
        estimate_hours: form.estimate_hours ? parseFloat(form.estimate_hours) : undefined,
        parent_key: form.parent_key || undefined,
        fix_versions: form.fix_version ? [form.fix_version] : [],
        sprint_id: form.sprint_id || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectIssues', projectKey] })
      qc.invalidateQueries({ queryKey: ['sprintIssues'] })
      setForm(defaultForm)
      onClose()
    },
  })

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const allIssues = projectData?.issues || []
  // Parent candidates based on hierarchy: Epic > Feature > Story/Bug > Task
  const parentCandidates = allIssues.filter((i: any) => {
    const t = i.fields?.issuetype?.name
    if (form.issue_type === 'Feature') return t === 'Epic'
    if (form.issue_type === 'Story' || form.issue_type === 'Bug') return t === 'Epic' || t === 'Feature'
    if (form.issue_type === 'Task' || form.issue_type === 'Sub-task') return t === 'Story' || t === 'Bug'
    return false
  })
  const activeSprints = (sprints || []).filter(
    (s: any) => s.state === 'active' || s.state === 'future'
  )

  const selectClass = 'w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700">
          <h2 className="font-semibold text-lg">Create Issue in {projectKey}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          className="p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          {/* Summary */}
          <div>
            <label className="block text-sm font-medium mb-1">Summary *</label>
            <input
              required
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              className={selectClass}
              placeholder="What needs to be done?"
            />
          </div>

          {/* Type + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={form.issue_type}
                onChange={(e) => setForm({ ...form, issue_type: e.target.value })}
                className={selectClass}
              >
                {['Epic', 'Feature', 'Story', 'Task', 'Bug'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={selectClass}
              >
                {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className={selectClass}
              placeholder="Add a description..."
            />
          </div>

          {/* Assignee + Story Points */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Assignee</label>
              <select
                value={form.assignee}
                onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {(users || []).map((u: any) => (
                  <option key={u.accountId} value={u.accountId}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </div>
            {form.issue_type === 'Task' || form.issue_type === 'Sub-task' ? (
              <div>
                <label className="block text-sm font-medium mb-1">Estimate (Hours)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.estimate_hours}
                  onChange={(e) => setForm({ ...form, estimate_hours: e.target.value })}
                  className={selectClass}
                  placeholder="0"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">Story Points</label>
                <input
                  type="number"
                  min="0"
                  value={form.story_points}
                  onChange={(e) => setForm({ ...form, story_points: e.target.value })}
                  className={selectClass}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {/* Sprint + Release row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Sprint</label>
              <select
                value={form.sprint_id}
                onChange={(e) => setForm({ ...form, sprint_id: e.target.value })}
                className={selectClass}
              >
                <option value="">No sprint</option>
                {activeSprints.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.state})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Release</label>
              <select
                value={form.fix_version}
                onChange={(e) => setForm({ ...form, fix_version: e.target.value })}
                className={selectClass}
              >
                <option value="">No release</option>
                {(versions || []).map((v: any) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Parent */}
          {form.issue_type !== 'Epic' && parentCandidates.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Parent</label>
              <select
                value={form.parent_key}
                onChange={(e) => setForm({ ...form, parent_key: e.target.value })}
                className={selectClass}
              >
                <option value="">No parent</option>
                {parentCandidates.map((i: any) => (
                  <option key={i.key} value={i.key}>
                    {i.key} - {i.fields.summary}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Labels + Components */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Labels</label>
              <input
                value={form.labels}
                onChange={(e) => setForm({ ...form, labels: e.target.value })}
                className={selectClass}
                placeholder="Comma-separated"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Components</label>
              <input
                value={form.components}
                onChange={(e) => setForm({ ...form, components: e.target.value })}
                className={selectClass}
                placeholder="Comma-separated"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium border dark:border-slate-700 hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !form.summary.trim()}
              className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating...' : 'Create Issue'}
            </button>
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}
        </form>
      </div>
    </div>
  )
}
