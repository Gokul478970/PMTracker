import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getProjects, getProjectIssues } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import { Loader2, FolderKanban, ArrowRight } from 'lucide-react'

function StatusPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {count} {label}
    </span>
  )
}

function ProjectCard({ project }: { project: any }) {
  const { data } = useQuery({
    queryKey: ['projectIssues', project.key],
    queryFn: () => getProjectIssues(project.key, { limit: '100' }),
  })

  const issues = data?.issues || []
  const counts: Record<string, number> = {}
  for (const i of issues) {
    const s = i.fields?.status?.name || 'Unknown'
    counts[s] = (counts[s] || 0) + 1
  }

  return (
    <Link
      to={`/projects/${project.key}`}
      className="group block bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 shadow-sm hover:shadow-md transition-all p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">{project.key}</span>
          </div>
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {project.lead?.displayName || 'No lead'}
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
      </div>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{project.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {counts['To Do'] ? <StatusPill label="To Do" count={counts['To Do']} color="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300" /> : null}
        {counts['In Progress'] ? <StatusPill label="Active" count={counts['In Progress']} color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" /> : null}
        {counts['In Review'] ? <StatusPill label="Review" count={counts['In Review']} color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" /> : null}
        {counts['Done'] ? <StatusPill label="Done" count={counts['Done']} color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" /> : null}
      </div>
      <div className="mt-3 pt-3 border-t dark:border-slate-700 text-xs text-muted-foreground">
        {issues.length} issue{issues.length !== 1 ? 's' : ''} &middot;{' '}
        {(project.components || []).length} components
      </div>
    </Link>
  )
}

export function Dashboard() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of all projects</p>
        </div>
        {isAdmin() && (
          <Link
            to="/create-project"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <FolderKanban className="w-4 h-4" />
            New Project
          </Link>
        )}
      </div>

      {!projects || projects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700">
          <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No projects yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">
            {isAdmin() ? 'Create your first project to get started.' : 'No projects assigned yet. Ask an admin to add you to a project.'}
          </p>
          {isAdmin() && (
            <Link
              to="/create-project"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
            >
              Create Project
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p: any) => (
            <ProjectCard key={p.key} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
