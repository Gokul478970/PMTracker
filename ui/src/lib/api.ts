import { getToken, clearSession } from './auth'

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSession()
    window.location.reload()
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// --- Auth (no token needed) ---
export const authRegister = (email: string) =>
  fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Registration failed')
    return data
  })

export const authVerifyOtp = (email: string, otp: string, password: string, display_name?: string, role?: string) =>
  fetch(`${BASE}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, password, display_name: display_name || '', role: role || 'Dev' }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Verification failed')
    return data
  })

export const authLogin = (email: string, password: string) =>
  fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Login failed')
    return data
  })

export const authDemoLogin = (otp: string) =>
  fetch(`${BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Demo login failed')
    return data
  })

// --- Projects ---
export const getProjects = () => request<any[]>('/projects');
export const getProject = (key: string) => request<any>(`/projects/${key}`);
export const createProject = (data: any) =>
  request<any>('/projects', { method: 'POST', body: JSON.stringify(data) });
export const getProjectIssues = (key: string, params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<any>(`/projects/${key}/issues${qs}`);
};

// --- Issues ---
export const getIssue = (key: string) => request<any>(`/issues/${key}`);
export const createIssue = (data: any) =>
  request<any>('/issues', { method: 'POST', body: JSON.stringify(data) });
export const updateIssue = (key: string, data: any) =>
  request<any>(`/issues/${key}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteIssue = (key: string) =>
  request<any>(`/issues/${key}`, { method: 'DELETE' });
export const getChildIssues = (key: string) =>
  request<any[]>(`/issues/${key}/children`);

// --- Transitions ---
export const getTransitions = (key: string) => request<any[]>(`/issues/${key}/transitions`);
export const transitionIssue = (key: string, transitionName: string) =>
  request<any>(`/issues/${key}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition_name: transitionName }),
  });

// --- Comments ---
export const getComments = (key: string) => request<any[]>(`/issues/${key}/comments`);
export const addComment = (key: string, body: string, authorId?: string) =>
  request<any>(`/issues/${key}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, author_id: authorId }),
  });
export const editComment = (key: string, commentId: string, body: string) =>
  request<any>(`/issues/${key}/comments/${commentId}`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });

// --- Sprints & Boards ---
export const getBoards = (projectKey?: string) => {
  const qs = projectKey ? `?project_key=${projectKey}` : '';
  return request<any[]>(`/boards${qs}`);
};
export const getBoardSprints = (boardId: string) =>
  request<any[]>(`/boards/${boardId}/sprints`);
export const getSprintIssues = (sprintId: string) =>
  request<any[]>(`/sprints/${sprintId}/issues`);
export const createSprint = (data: any) =>
  request<any>('/sprints', { method: 'POST', body: JSON.stringify(data) });
export const updateSprint = (sprintId: string, data: any) =>
  request<any>(`/sprints/${sprintId}`, { method: 'PUT', body: JSON.stringify(data) });
export const addIssuesToSprint = (sprintId: string, issueKeys: string[]) =>
  request<any>(`/sprints/${sprintId}/issues`, {
    method: 'POST',
    body: JSON.stringify({ issue_keys: issueKeys }),
  });
export const getSprint = (sprintId: string) =>
  request<any>(`/sprints/${sprintId}`);

// --- Versions ---
export const getProjectVersions = (projectKey: string) =>
  request<any[]>(`/projects/${projectKey}/versions`);
export const createVersion = (projectKey: string, data: any) =>
  request<any>(`/projects/${projectKey}/versions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

// --- Issue Links ---
export const getIssueLinks = (key: string) => request<any[]>(`/issues/${key}/links`);
export const createIssueLink = (key: string, type: string, targetKey: string) =>
  request<any>(`/issues/${key}/links`, {
    method: 'POST',
    body: JSON.stringify({ type, target_key: targetKey }),
  });
export const deleteIssueLink = (key: string, linkId: string) =>
  request<any>(`/issues/${key}/links/${linkId}`, { method: 'DELETE' });

// --- Users ---
export const getUsers = () => request<any[]>('/users');
export const updateUser = (identifier: string, data: any) =>
  request<any>(`/users/${identifier}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteUser = (identifier: string) =>
  request<any>(`/users/${identifier}`, { method: 'DELETE' });

// --- Projects (delete) ---
export const deleteProject = (key: string) =>
  request<any>(`/projects/${key}`, { method: 'DELETE' });

// --- Chat ---
export const getChatMessages = (projectKey: string, limit?: number) =>
  request<any>(`/projects/${projectKey}/chat?limit=${limit || 50}`);

export const sendChatMessage = (projectKey: string, text: string) =>
  request<any>(`/projects/${projectKey}/chat`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

export const markChatRead = (projectKey: string) =>
  request<any>(`/projects/${projectKey}/chat/read`, { method: 'POST' });

export const getUnreadCounts = () =>
  request<Record<string, number>>('/chat/unread');

// --- Scopes (MVP) ---
export const getScopes = (projectKey: string) =>
  request<any[]>(`/projects/${projectKey}/scopes`);
export const createScope = (projectKey: string, name: string, content: string = '') =>
  request<any>(`/projects/${projectKey}/scopes`, {
    method: 'POST',
    body: JSON.stringify({ name, content }),
  });
export const updateScope = (projectKey: string, scopeId: string, data: any) =>
  request<any>(`/projects/${projectKey}/scopes/${scopeId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
export const deleteScope = (projectKey: string, scopeId: string) =>
  request<any>(`/projects/${projectKey}/scopes/${scopeId}`, { method: 'DELETE' });

// --- Search ---
export const searchIssues = (jql: string, q?: string) => {
  const params = new URLSearchParams({ jql, limit: '50' });
  if (q) params.set('q', q);
  return request<any>(`/search?${params.toString()}`);
};

// --- Agent Keys ---
export const getAgentKeys = () => request<any[]>('/agents');
export const createAgentKey = (agentName: string) =>
  request<any>('/agents', { method: 'POST', body: JSON.stringify({ agent_name: agentName }) });
export const deleteAgentKey = (id: string) =>
  request<any>(`/agents/${id}`, { method: 'DELETE' });

// --- Project Assignments ---
export const getAssignments = (projectKey?: string) => {
  const qs = projectKey ? `?project_key=${projectKey}` : '';
  return request<any[]>(`/assignments${qs}`);
};
export const createAssignment = (data: { email: string; project_key: string; role: string }) =>
  request<any>('/assignments', { method: 'POST', body: JSON.stringify(data) });
export const updateAssignment = (id: string, data: any) =>
  request<any>(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removeAssignment = (id: string) =>
  request<any>(`/assignments/${id}`, { method: 'DELETE' });

// --- Project Edit ---
export const updateProject = (key: string, data: any) =>
  request<any>(`/projects/${key}`, { method: 'PUT', body: JSON.stringify(data) });

// --- CSV Import ---
export const importIssuesCsv = async (projectKey: string, file: File) => {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/projects/${projectKey}/import-issues`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}
