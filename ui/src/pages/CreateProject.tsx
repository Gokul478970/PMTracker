import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProject, getUsers } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import { FolderKanban } from 'lucide-react'

export function CreateProject() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  const [form, setForm] = useState({
    key: '',
    name: '',
    description: '',
    lead_account_id: '',
    components: '',
    admin_project: false,
  })

  const mutation = useMutation({
    mutationFn: () =>
      createProject({
        ...form,
        components: form.components
          ? form.components.split(',').map((c) => c.trim()).filter(Boolean)
          : [],
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${data.key}`)
    },
  })

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <FolderKanban className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Project</h1>
          <p className="text-sm text-muted-foreground">Create a new project to organize your work</p>
        </div>
      </div>

      <form
        className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <label className="block text-sm font-medium mb-1">Key *</label>
            <input
              required
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
              pattern="^[A-Z][A-Z0-9_]+$"
              maxLength={10}
              className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
              placeholder="PROJ"
            />
            <p className="text-xs text-muted-foreground mt-1">Uppercase letters only</p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
              placeholder="My Project"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
            placeholder="What is this project about?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Lead</label>
          <select
            value={form.lead_account_id}
            onChange={(e) => setForm({ ...form, lead_account_id: e.target.value })}
            className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
          >
            <option value="">No lead</option>
            {(users || []).map((u: any) => (
              <option key={u.accountId} value={u.accountId}>
                {u.displayName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Components</label>
          <input
            value={form.components}
            onChange={(e) => setForm({ ...form, components: e.target.value })}
            className="w-full border dark:border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
            placeholder="Frontend, Backend, DevOps (comma-separated)"
          />
        </div>

        {isAdmin() && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="admin_project"
              checked={form.admin_project}
              onChange={(e) => setForm({ ...form, admin_project: e.target.checked })}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            <label htmlFor="admin_project" className="text-sm font-medium">
              Admin Project
            </label>
            <span className="text-xs text-muted-foreground">
              (Only visible to admins)
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-md text-sm font-medium border dark:border-slate-700 hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !form.key.trim() || !form.name.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
        )}
      </form>
    </div>
  )
}
