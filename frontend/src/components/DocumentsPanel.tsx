import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ApiError, api } from '../api'
import type { DocumentItem, Workspace } from '../types'

const STATUS_LABEL: Record<DocumentItem['status'], string> = {
  pending: 'Waiting',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function DocumentsPanel({ workspace, userId }: { workspace: Workspace; userId: string }) {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setDocuments(await api.listDocuments(workspace.id))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load documents.')
    }
  }, [workspace.id])

  useEffect(() => {
    void load()
  }, [load])

  // Processing happens in the background, so poll while anything is still in progress.
  const inProgress = documents?.some((d) => d.status === 'pending' || d.status === 'processing')
  useEffect(() => {
    if (!inProgress) return
    const timer = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(timer)
  }, [inProgress, load])

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await api.uploadDocument(workspace.id, file)
      await load()
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 413
          ? 'That file is too large.'
          : err instanceof ApiError
            ? err.message
            : 'Upload failed.',
      )
    } finally {
      setUploading(false)
    }
  }

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t work. Please try again.')
    }
  }

  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Documents</h2>
        <button type="button" className="primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload PDF'}
        </button>
        <input
          ref={fileInput}
          id="pdf-upload"
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => void upload(e)}
        />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {documents === null ? (
        <p className="muted">Loading documents…</p>
      ) : documents.length === 0 ? (
        <div className="empty">
          <p>No documents yet.</p>
          <p className="muted">Upload a PDF with selectable text. Its pages become searchable in a few seconds.</p>
        </div>
      ) : (
        <ul className="doc-list">
          {documents.map((doc) => {
            const canDelete = workspace.role === 'owner' || doc.uploadedBy === userId
            return (
              <li key={doc.id} className="doc">
                <div className="doc-main">
                  <span className="doc-name" title={doc.filename}>
                    {doc.filename}
                  </span>
                  <span className={`status status-${doc.status}`}>{STATUS_LABEL[doc.status]}</span>
                </div>
                <div className="doc-meta muted">
                  {formatSize(doc.sizeBytes)}
                  {doc.status === 'ready' && ` · ${doc.pageCount} pages · ${doc.chunkCount} passages`}
                </div>
                {doc.status === 'failed' && doc.error && <p className="error small">{doc.error}</p>}
                <div className="doc-actions">
                  {doc.status === 'failed' && (
                    <button type="button" className="link" onClick={() => void act(() => api.retryDocument(workspace.id, doc.id))}>
                      Retry
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="link danger"
                      onClick={() => {
                        if (window.confirm(`Delete “${doc.filename}”? This can’t be undone.`)) {
                          void act(() => api.deleteDocument(workspace.id, doc.id))
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
