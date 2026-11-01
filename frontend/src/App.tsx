import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, getToken, setToken } from './api'
import { AuthForm } from './components/AuthForm'
import { WorkspaceView } from './components/WorkspaceView'
import type { User, Workspace } from './types'

type Session = { user: User; workspaces: Workspace[] }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(() => getToken() !== null)

  const loadSession = useCallback(async () => {
    try {
      setSession(await api.me())
    } catch (err) {
      // An expired or invalid token: forget it and show the sign-in form.
      if (err instanceof ApiError && err.status === 401) setToken(null)
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Restore the session on first load. (This is data fetching, which the rule below doesn't model.)
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (getToken()) void loadSession()
  }, [loadSession])

  const signOut = () => {
    setToken(null)
    setSession(null)
  }

  if (loading) return <div className="center muted">Loading…</div>

  if (!session) {
    return (
      <AuthForm
        onAuthenticated={(token) => {
          setToken(token)
          setLoading(true)
          void loadSession()
        }}
      />
    )
  }

  return (
    <WorkspaceView
      user={session.user}
      workspaces={session.workspaces}
      onWorkspacesChanged={loadSession}
      onSignOut={signOut}
    />
  )
}
