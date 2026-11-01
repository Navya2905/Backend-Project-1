import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, api } from '../api'
import type { User, Workspace } from '../types'
import { AskPanel } from './AskPanel'
import { DocumentsPanel } from './DocumentsPanel'

interface Props {
  user: User
  workspaces: Workspace[]
  onWorkspacesChanged: () => Promise<void>
  onSignOut: () => void
}

export function WorkspaceView({ user, workspaces, onWorkspacesChanged, onSignOut }: Props) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? '')
  const workspace = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0]

  useEffect(() => {
    if (!workspaces.some((w) => w.id === workspaceId) && workspaces[0]) setWorkspaceId(workspaces[0].id)
  }, [workspaces, workspaceId])

  const createWorkspace = async () => {
    const name = window.prompt('Name for the new workspace')?.trim()
    if (!name) return
    const created = await api.createWorkspace(name)
    await onWorkspacesChanged()
    setWorkspaceId(created.id)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">DocuMind</span>
        <label className="workspace-picker">
          <span className="sr-only">Workspace</span>
          <select id="workspace" value={workspace?.id} onChange={(e) => setWorkspaceId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.role === 'owner' ? ' (owner)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="link" onClick={() => void createWorkspace()}>
          New workspace
        </button>
        <span className="spacer" />
        <span className="muted">{user.email}</span>
        <button type="button" className="link" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      {workspace && (
        <main className="workspace" key={workspace.id}>
          <section className="panel">
            <DocumentsPanel workspace={workspace} userId={user.id} />
            {workspace.role === 'owner' && <InviteForm workspaceId={workspace.id} />}
          </section>
          <section className="panel">
            <AskPanel workspaceId={workspace.id} />
          </section>
        </main>
      )}
    </div>
  )
}

function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api.addMember(workspaceId, email)
      setMessage({ ok: true, text: `${email} can now see this workspace.` })
      setEmail('')
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not add this person.' })
    }
  }

  return (
    <form className="invite" onSubmit={submit}>
      <label>
        Add a teammate by email
        <div className="row">
          <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit">Add</button>
        </div>
      </label>
      <p className="hint">They need a DocuMind account first.</p>
      {message && <p className={message.ok ? 'success' : 'error'}>{message.text}</p>}
    </form>
  )
}
