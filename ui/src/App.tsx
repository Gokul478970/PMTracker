import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated, isAdmin, isDemo } from './lib/auth'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ProjectBoard } from './pages/ProjectBoard'
import { IssueDetail } from './pages/IssueDetail'
import { CreateProject } from './pages/CreateProject'
import { People } from './pages/People'
import { ProjectChat } from './pages/ProjectChat'
import { Backlog } from './pages/Backlog'
import { SprintBoard } from './pages/SprintBoard'
import { ProjectScope } from './pages/ProjectScope'
import { ProjectSettings } from './pages/ProjectSettings'

function App() {
  const [authed, setAuthed] = useState(isAuthenticated())

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  return (
    <Layout onLogout={() => setAuthed(false)}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects/:projectKey" element={<ProjectBoard />} />
        <Route path="/projects/:projectKey/backlog" element={<Backlog />} />
        <Route path="/projects/:projectKey/sprints" element={<SprintBoard />} />
        <Route path="/projects/:projectKey/scope" element={isDemo() ? <Navigate to="/" replace /> : <ProjectScope />} />
        <Route path="/projects/:projectKey/chat" element={isDemo() ? <Navigate to="/" replace /> : <ProjectChat />} />
        <Route path="/projects/:projectKey/settings" element={isDemo() ? <Navigate to="/" replace /> : <ProjectSettings />} />
        <Route path="/issues/:issueKey" element={<IssueDetail />} />
        <Route path="/create-project" element={isAdmin() ? <CreateProject /> : <Navigate to="/" replace />} />
        <Route path="/people" element={isDemo() ? <Navigate to="/" replace /> : <People />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
