import type { AskResult, DocumentItem, User, Workspace } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'documind.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be unavailable (private mode); the session just won't survive a reload.
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check that the backend is running.')
  }

  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    // NestJS validation errors arrive as an array of messages.
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message
    throw new ApiError(response.status, message ?? `Request failed (${response.status})`)
  }
  return body as T
}

const json = (data: unknown) => JSON.stringify(data)

export const api = {
  register: (data: { email: string; password: string; name: string }) =>
    request<{ accessToken: string; user: User }>('/auth/register', { method: 'POST', body: json(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: json(data) }),
  me: () => request<{ user: User; workspaces: Workspace[] }>('/auth/me'),

  createWorkspace: (name: string) => request<Workspace>('/workspaces', { method: 'POST', body: json({ name }) }),
  addMember: (workspaceId: string, email: string) =>
    request(`/workspaces/${workspaceId}/members`, { method: 'POST', body: json({ email }) }),

  listDocuments: (workspaceId: string) => request<DocumentItem[]>(`/workspaces/${workspaceId}/documents`),
  uploadDocument: (workspaceId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<DocumentItem>(`/workspaces/${workspaceId}/documents`, { method: 'POST', body: form })
  },
  deleteDocument: (workspaceId: string, id: string) =>
    request<void>(`/workspaces/${workspaceId}/documents/${id}`, { method: 'DELETE' }),
  retryDocument: (workspaceId: string, id: string) =>
    request<DocumentItem>(`/workspaces/${workspaceId}/documents/${id}/retry`, { method: 'POST' }),

  ask: (workspaceId: string, question: string) =>
    request<AskResult>(`/workspaces/${workspaceId}/ask`, { method: 'POST', body: json({ question }) }),
}
