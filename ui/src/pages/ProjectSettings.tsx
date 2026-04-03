import { useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProject,
  getUsers,
  getAssignments,
  createAssignment,
  removeAssignment,
  updateProject,
} from '@/lib/api'
import { isAdmin, getEmail } from '@/lib/auth'
import { getInitials } from '@/lib/utils'
import {
  Loader2,
  Settings,
  Users,
  UserPlus,
  UserMinus,
  Save,
  Shield,
  ShieldCheck,
  Mail,
} from 'lucide-react'

export function ProjectSettings() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const qc = useQueryClient()
  const admin = isAdmin()
  const currentEmail = getEmail()

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ['project', projectKey],
    queryFn: () => getProject(projectKey!),
    enabled: !!projectKey,
  })

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: getUsers, staleTime: 0 })

  const { data: assignments, isLoading: assignLoading } = useQuery({
    queryKey: ['assignments', projectKey],
    queryFn: () => getAssignments(projectKey!),
    enabled: !!projectKey,
  })

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editComponents, setEditComponents] = useState('')
  const [formInit, setFormInit] = useState(false)

  // Assign form state
  const [assignEmail, setAssignEmail] = useState('')
  const [assignRole, setAssignRole] = useState('Project User')
  const [assignError, setAssignError] = useState('')

  // Initialize form once project loads
  if (project && !formInit) {
    setEditName(project.name || '')
    setEditDesc(project.description || '')
    setEditComponents((project.components || []).join(', '))
    setFormInit(true)
  }

  const updateMut = useMutation({
    mutationFn: () =>
      updateProject(projectKey!, {
        name: editName,
        description: editDesc,
        components: editComponents
          .split(',')
          .map((c: string) => c.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectKey] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const assignMut = useMutation({
    mutationFn: () =>
      createAssignment({
        email: assignEmail,
        project_key: projectKey!,
        role: assignRole,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', projectKey] })
      qc.invalidateQueries({ queryKey: ['users'] })
      setAssignEmail('')
      setAssignRole('Project User')
      setAssignError('')
    },
    onError: (err: Error) => setAssignError(err.message),
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => removeAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', projectKey] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })

  if (projLoading || assignLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return <p className="text-muted-foreground text-center py-12">Project not found.</p>
  }

  const activeAssignments = (assignments || []).filter((a: any) => !a.end_date)
  const endedAssignments = (assignments || []).filter((a: any) => a.end_date)

  // Check if current user is project admin for this project
  const isCurrentUserProjectAdmin = activeAssignments.some(
    (a: any) => a.email === currentEmail && a.role === 'Project Admin'
  )
  const canManage = admin || isCurrentUserProjectAdmin

  // Redirect non-managers to dashboard
  if (!canManage) {
    return <Navigate to="/" replace />
  }

  // Build a lookup from email to user display info
  const userMap: Record<string, any> = {}
  for (const u of users || []) {
    userMap[u.emailAddress] = u
  }

  // Unassigned users (not actively assigned to this project)
  const assignedEmails = new Set(activeAssignments.map((a: any) => a.email))
  const unassignedUsers = (users || []).filter(
    (u: any) => !assignedEmails.has(u.emailAddress) && u.emailAddress !== '604671@cognizant.com'
  )

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.key} Settings</h1>
          <p className="text-sm text-muted-foreground">Manage project details and team</p>
        </div>
      </div>

      {/* Edit Project Details */}
      {canManage && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Project Details
          </h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              updateMut.mutate()
            }}
          >
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Components</label>
              <input
                value={editComponents}
                onChange={(e) => setEditComponents(e.target.value)}
                className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                placeholder="Frontend, Backend, DevOps (comma-separated)"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updateMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {updateMut.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            {updateMut.isSuccess && (
              <p className="text-sm text-emerald-600">Project updated successfully.</p>
            )}
            {updateMut.isError && (
              <p className="text-sm text-destructive">{(updateMut.error as Error).message}</p>
            )}
          </form>
        </div>
      )}

      {/* Team Management */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" /> Team Members ({activeAssignments.length})
        </h2>

        {/* Active Members */}
        <div className="space-y-3 mb-6">
          {activeAssignments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No team members assigned yet.
            </p>
          )}
          {activeAssignments.map((a: any) => {
            const user = userMap[a.email]
            return (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 rounded-lg border dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                    {getInitials(user?.displayName || a.email.split('@')[0])}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {user?.displayName || a.email.split('@')[0]}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          a.role === 'Project Admin'
                            ? 'bg-amber-100 text-amber-700'
                            : a.role === 'Product Owner'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {a.role === 'Project Admin' ? (
                          <span className="flex items-center gap-0.5">
                            <ShieldCheck className="w-3 h-3" /> Project Admin
                          </span>
                        ) : (
                          a.role
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Mail className="w-3 h-3" />
                      {a.email}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Remove ${user?.displayName || a.email} from ${project.key}?`
                        )
                      ) {
                        removeMut.mutate(a.id)
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <UserMinus className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Assign New Member */}
        {canManage && unassignedUsers.length > 0 && (
          <div className="border-t dark:border-slate-700 pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Add Team Member
            </h3>
            <form
              className="flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!assignEmail) return
                assignMut.mutate()
              }}
            >
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  User
                </label>
                <select
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                >
                  <option value="">Select user...</option>
                  {unassignedUsers.map((u: any) => (
                    <option key={u.emailAddress} value={u.emailAddress}>
                      {u.displayName} ({u.emailAddress})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-40">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Role
                </label>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                >
                  <option value="Project User">Project User</option>
                  <option value="Product Owner">Product Owner</option>
                  {admin && <option value="Project Admin">Project Admin</option>}
                </select>
              </div>
              <button
                type="submit"
                disabled={assignMut.isPending || !assignEmail}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                {assignMut.isPending ? 'Adding...' : 'Add'}
              </button>
            </form>
            {assignError && (
              <p className="text-sm text-destructive mt-2">{assignError}</p>
            )}
          </div>
        )}

        {canManage && unassignedUsers.length === 0 && (
          <div className="border-t dark:border-slate-700 pt-4">
            <p className="text-xs text-muted-foreground text-center">
              All registered users are already assigned to this project.
            </p>
          </div>
        )}
      </div>

      {/* Removed Members (history) */}
      {canManage && endedAssignments.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Removed Members ({endedAssignments.length})
          </h2>
          <div className="space-y-2">
            {endedAssignments.map((a: any) => {
              const user = userMap[a.email]
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-2 rounded border dark:border-slate-700 opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {user?.displayName || a.email.split('@')[0]}
                    </span>
                    <span className="text-xs text-muted-foreground">({a.email})</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Ended: {new Date(a.end_date).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
