import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, searchIssues, deleteUser, updateUser, getAgentKeys, getAssignments, getProjects, createAssignment, removeAssignment, updateAssignment } from '@/lib/api'
import { getInitials } from '@/lib/utils'
import { isAdmin, getEmail } from '@/lib/auth'
import { Loader2, Mail, Bot, ShieldCheck, ClipboardList, Code2, TestTube2, Trash2, Key, UserPlus, X, FolderKanban, Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AgentTokenDialog } from '@/components/AgentTokenDialog'

function AssignmentPill({ assignment, onRemove, canRemove }: { assignment: any; onRemove?: () => void; canRemove?: boolean }) {
  const roleColor = assignment.role === 'Project Admin'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : assignment.role === 'Product Owner'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${roleColor}`}>
      <FolderKanban className="w-3 h-3" />
      {assignment.project_key}
      {assignment.role === 'Project Admin' && <ShieldCheck className="w-3 h-3" />}
      {canRemove && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 hover:text-red-600 transition-colors"
          title="Remove from project"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

function UserCard({
  user, issueCount, onDelete, canDelete, assignments, onRemoveAssignment, canManageAssignments, editable,
}: {
  user: any; issueCount: number; onDelete?: () => void; canDelete?: boolean;
  assignments?: any[]; onRemoveAssignment?: (id: string) => void; canManageAssignments?: boolean; editable?: boolean;
}) {
  const role = user.role || 'Dev'
  const roleColors: Record<string, string> = {
    Admin: 'bg-amber-100 text-amber-700',
    Dev: 'bg-violet-100 text-violet-700',
    QA: 'bg-rose-100 text-rose-700',
    PM: 'bg-emerald-100 text-emerald-700',
    PO: 'bg-blue-100 text-blue-700',
  }
  const activeAssignments = (assignments || []).filter((a: any) => !a.end_date)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-5 flex items-start gap-4 hover:shadow-sm transition-shadow">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
        {getInitials(user.displayName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{user.displayName}</h3>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${roleColors[role] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
            {role}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
          <Mail className="w-3.5 h-3.5" />
          {user.emailAddress}
        </div>
        {/* Project assignments */}
        {activeAssignments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {activeAssignments.map((a: any) => (
              <AssignmentPill
                key={a.id}
                assignment={a}
                canRemove={canManageAssignments}
                onRemove={() => onRemoveAssignment?.(a.id)}
              />
            ))}
          </div>
        )}
        {role !== 'Admin' && activeAssignments.length === 0 && (
          <p className="text-[10px] text-muted-foreground mt-2 italic">No project assigned</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Link
            to={`/?assignee=${user.accountId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            {issueCount} assigned issue{issueCount !== 1 ? 's' : ''}
          </Link>
          {canDelete && role !== 'Admin' && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.() }}
              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
          {user.active ? 'Active' : 'Inactive'}
        </span>
        {editable && (
          <span className="text-muted-foreground/50 hover:text-primary transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}

function AssignDialog({
  users, projects, open, onClose,
}: {
  users: any[]; projects: any[]; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [role, setRole] = useState('Project User')
  const [error, setError] = useState('')
  const admin = isAdmin()

  const mutation = useMutation({
    mutationFn: () => createAssignment({ email, project_key: projectKey, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      setEmail('')
      setProjectKey('')
      setRole('Project User')
      setError('')
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  if (!open) return null

  // Filter out admin users
  const assignableUsers = users.filter((u: any) => u.role !== 'Admin')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> Assign User to Project
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!email || !projectKey) return
            mutation.mutate()
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-1">User</label>
            <select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
            >
              <option value="">Select user...</option>
              {assignableUsers.map((u: any) => (
                <option key={u.emailAddress} value={u.emailAddress}>
                  {u.displayName} ({u.emailAddress})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Project</label>
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
            >
              <option value="">Select project...</option>
              {projects.map((p: any) => (
                <option key={p.key} value={p.key}>
                  {p.key} - {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Project Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
            >
              <option value="Project User">Project User</option>
              <option value="Product Owner">Product Owner</option>
              {admin && <option value="Project Admin">Project Admin</option>}
            </select>
          </div>
          {error && (
            <p className="text-sm text-destructive bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
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
              disabled={mutation.isPending || !email || !projectKey}
              className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UserEditDialog({
  user, assignments, projects, open, onClose,
}: {
  user: any; assignments: any[]; projects: any[]; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient()
  const [role, setRole] = useState(user?.role || 'Dev')
  const [addProjectKey, setAddProjectKey] = useState('')
  const [addProjectRole, setAddProjectRole] = useState('Project User')
  const [error, setError] = useState('')
  const admin = isAdmin()

  const activeAssignments = (assignments || []).filter((a: any) => !a.end_date)
  const assignedProjectKeys = new Set(activeAssignments.map((a: any) => a.project_key))
  const availableProjects = (projects || []).filter((p: any) => !assignedProjectKeys.has(p.key))

  const updateRoleMut = useMutation({
    mutationFn: () => updateUser(user.emailAddress, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setError('')
    },
    onError: (err: Error) => setError(err.message),
  })

  const addAssignmentMut = useMutation({
    mutationFn: () => createAssignment({ email: user.emailAddress, project_key: addProjectKey, role: addProjectRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      setAddProjectKey('')
      setAddProjectRole('Project User')
      setError('')
    },
    onError: (err: Error) => setError(err.message),
  })

  const removeAssignmentMut = useMutation({
    mutationFn: (id: string) => removeAssignment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  })

  const updateAssignmentMut = useMutation({
    mutationFn: ({ id, newRole }: { id: string; newRole: string }) => updateAssignment(id, { role: newRole }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  })

  if (!open || !user) return null

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const selectClass = 'w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300'
  const roleColors: Record<string, string> = {
    'Project Admin': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'Product Owner': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'Project User': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b dark:border-slate-700">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {getInitials(user.displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg">{user.displayName}</h2>
            <p className="text-sm text-muted-foreground">{user.emailAddress}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Global Role */}
          <div>
            <label className="block text-sm font-semibold mb-2">Global Role</label>
            <div className="flex gap-2">
              <select value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
                <option value="Dev">Dev</option>
                <option value="QA">QA</option>
                <option value="PM">PM</option>
                <option value="PO">PO</option>
              </select>
              <button
                onClick={() => updateRoleMut.mutate()}
                disabled={updateRoleMut.isPending || role === user.role}
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
              >
                {updateRoleMut.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Assigned Projects */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              Assigned Projects ({activeAssignments.length})
            </label>
            {activeAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No projects assigned</p>
            ) : (
              <div className="space-y-2">
                {activeAssignments.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">{a.project_key}</span>
                    <select
                      value={a.role}
                      onChange={(e) => updateAssignmentMut.mutate({ id: a.id, newRole: e.target.value })}
                      className="ml-auto border dark:border-slate-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                    >
                      <option value="Project User">Project User</option>
                      <option value="Product Owner">Product Owner</option>
                      {admin && <option value="Project Admin">Project Admin</option>}
                    </select>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${user.displayName} from ${a.project_key}?`))
                          removeAssignmentMut.mutate(a.id)
                      }}
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                      title="Remove from project"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add to Project */}
          {availableProjects.length > 0 && (
            <div>
              <label className="block text-sm font-semibold mb-2">Add to Project</label>
              <div className="flex gap-2">
                <select value={addProjectKey} onChange={(e) => setAddProjectKey(e.target.value)} className={selectClass}>
                  <option value="">Select project...</option>
                  {availableProjects.map((p: any) => (
                    <option key={p.key} value={p.key}>{p.key} - {p.name}</option>
                  ))}
                </select>
                <select
                  value={addProjectRole}
                  onChange={(e) => setAddProjectRole(e.target.value)}
                  className="border dark:border-slate-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300 shrink-0"
                >
                  <option value="Project User">Project User</option>
                  <option value="Product Owner">Product Owner</option>
                  {admin && <option value="Project Admin">Project Admin</option>}
                </select>
                <button
                  onClick={() => { if (addProjectKey) addAssignmentMut.mutate() }}
                  disabled={!addProjectKey || addAssignmentMut.isPending}
                  className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
                  title="Add to project"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border dark:border-slate-700 hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const AGENTS = [
  {
    name: 'PO Agent',
    role: 'Product Owner',
    description: 'Manages backlog, writes user stories, prioritizes features',
    icon: ShieldCheck,
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    name: 'PM Agent',
    role: 'Project Manager',
    description: 'Tracks progress, manages sprints, reports status',
    icon: ClipboardList,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    name: 'Dev Agent',
    role: 'Developer',
    description: 'Implements features, fixes bugs, reviews code',
    icon: Code2,
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    name: 'QA Agent',
    role: 'Quality Assurance',
    description: 'Tests features, writes test cases, reports defects',
    icon: TestTube2,
    gradient: 'from-rose-500 to-pink-600',
  },
]

function AgentCard({ agent, keyCount, canManage, onManage }: {
  agent: typeof AGENTS[0]
  keyCount: number
  canManage: boolean
  onManage: () => void
}) {
  const Icon = agent.icon
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-5 flex items-start gap-4 hover:shadow-sm transition-shadow ${canManage ? 'cursor-pointer hover:border-primary/50' : ''}`}
      onClick={canManage ? onManage : undefined}
    >
      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${agent.gradient} flex items-center justify-center text-white shrink-0`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{agent.name}</h3>
          <Bot className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{agent.role}</p>
        <p className="text-xs text-muted-foreground mt-2">{agent.description}</p>
        {canManage && (
          <button
            onClick={(e) => { e.stopPropagation(); onManage() }}
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-primary hover:underline"
          >
            <Key className="w-3 h-3" />
            Manage Keys {keyCount > 0 && `(${keyCount})`}
          </button>
        )}
      </div>
      {keyCount > 0 ? (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {keyCount} key{keyCount !== 1 ? 's' : ''}
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
          No keys
        </span>
      )}
    </div>
  )
}

export function People() {
  const qc = useQueryClient()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  const { data: allIssuesData } = useQuery({
    queryKey: ['allIssues'],
    queryFn: () => searchIssues(''),
  })

  const admin = isAdmin()
  const currentEmail = getEmail()

  const { data: agentKeys } = useQuery({
    queryKey: ['agentKeys'],
    queryFn: getAgentKeys,
    enabled: admin,
  })

  const { data: assignments } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => getAssignments(),
  })

  // Check if current user is a Project Admin for any project
  const isProjectAdmin = (assignments || []).some(
    (a: any) => a.email === currentEmail && a.role === 'Project Admin' && !a.end_date
  )

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    enabled: admin || isProjectAdmin,
  })

  const deleteUserMut = useMutation({
    mutationFn: (identifier: string) => deleteUser(identifier),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const removeAssignmentMut = useMutation({
    mutationFn: (id: string) => removeAssignment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const allIssues = allIssuesData?.issues || []
  const countsByUser: Record<string, number> = {}
  for (const issue of allIssues) {
    const aid = issue.fields?.assignee?.accountId
    if (aid) countsByUser[aid] = (countsByUser[aid] || 0) + 1
  }

  const keyCountsByAgent: Record<string, number> = {}
  for (const k of agentKeys || []) {
    const name = k.agent_name
    keyCountsByAgent[name] = (keyCountsByAgent[name] || 0) + 1
  }

  // Group assignments by user email
  const assignmentsByUser: Record<string, any[]> = {}
  for (const a of assignments || []) {
    if (!assignmentsByUser[a.email]) assignmentsByUser[a.email] = []
    assignmentsByUser[a.email].push(a)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {users?.length || 0} member{(users?.length || 0) !== 1 ? 's' : ''}{admin ? ` \u00B7 ${AGENTS.length} agents` : !admin && !isProjectAdmin ? ' \u00B7 Your project teammates' : ''}
          </p>
        </div>
        {(admin || isProjectAdmin) && (
          <button
            onClick={() => setAssignDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Assign to Project
          </button>
        )}
      </div>

      {/* Humans Section */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center text-blue-600 text-xs">H</span>
          Human ({users?.length || 0})
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(users || []).map((u: any) => (
            <div
              key={u.accountId}
              className={admin && u.role !== 'Admin' ? 'cursor-pointer' : ''}
              onClick={() => { if (admin && u.role !== 'Admin') setEditingUser(u) }}
            >
              <UserCard
                user={u}
                issueCount={countsByUser[u.accountId] || 0}
                canDelete={admin}
                editable={admin && u.role !== 'Admin'}
                onDelete={() => {
                  if (confirm(`Remove user ${u.displayName} (${u.emailAddress})? This cannot be undone.`)) {
                    deleteUserMut.mutate(u.emailAddress)
                  }
                }}
                assignments={assignmentsByUser[u.emailAddress] || []}
                canManageAssignments={admin || isProjectAdmin}
                onRemoveAssignment={(id) => {
                  if (confirm('Remove this project assignment?')) {
                    removeAssignmentMut.mutate(id)
                  }
                }}
              />
            </div>
          ))}
          {(!users || users.length === 0) && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-8">No team members yet</p>
          )}
        </div>
      </div>

      {/* Agents Section (admin only) */}
      {admin && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-purple-100 flex items-center justify-center text-purple-600">
              <Bot className="w-3 h-3" />
            </span>
            Agents ({AGENTS.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((agent) => (
              <AgentCard
                key={agent.name}
                agent={agent}
                keyCount={keyCountsByAgent[agent.name] || 0}
                canManage={admin}
                onManage={() => setSelectedAgent(agent.name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agent Token Dialog */}
      {selectedAgent && (
        <AgentTokenDialog
          agentName={selectedAgent}
          open={!!selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* Assign Dialog */}
      <AssignDialog
        users={users || []}
        projects={projects || []}
        open={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
      />

      {/* User Edit Dialog (admin only) */}
      {editingUser && (
        <UserEditDialog
          user={editingUser}
          assignments={assignmentsByUser[editingUser.emailAddress] || []}
          projects={projects || []}
          open={!!editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  )
}
