import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { workspacesApi } from './workspaces.api.js'

function CreateWorkspaceForm({ open, onCancel, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const trimmedName = name.trim()
    if (trimmedName.length === 0 || trimmedName.length > 255) {
      setError('Name is required and must be 255 characters or fewer.')
      return
    }
    setIsSubmitting(true)
    try {
      const payload = await workspacesApi.createWorkspace({
        name: trimmedName,
        description: description.trim() || undefined,
      })
      setName('')
      setDescription('')
      if (payload?.workspace?.id && onCreated) {
        onCreated(payload.workspace)
      }
    } catch (err) {
      setError(err?.message || 'Failed to create workspace.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <form className="create-document-form" onSubmit={handleSubmit} aria-label="Create workspace">
      <h2 className="create-document-title">New Workspace</h2>
      <div className="form-group">
        <label htmlFor="ws-name" className="form-label">Name</label>
        <input
          id="ws-name"
          className="form-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workspace name"
          required
          autoFocus
        />
      </div>
      <div className="form-group">
        <label htmlFor="ws-desc" className="form-label">Description (optional)</label>
        <textarea
          id="ws-desc"
          className="form-input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description"
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="documents-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting || name.trim().length === 0}>
          {isSubmitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}

function WorkspaceCard({ workspace }) {
  return (
    <Link to={`/workspaces/${workspace.id}`} className="document-link" aria-label={`Open workspace ${workspace.name}`}>
      <span className="document-title">{workspace.name}</span>
      {workspace.description && <span className="document-meta">{workspace.description}</span>}
      <span className="document-meta">
        <span className="document-state">{workspace.workspaceState}</span>
      </span>
    </Link>
  )
}

function WorkspacesPage() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await workspacesApi.listWorkspaces()
      setWorkspaces(Array.isArray(payload?.workspaces) ? payload.workspaces : [])
    } catch (err) {
      setError(err?.message || 'Failed to load workspaces.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreated = (createdWorkspace) => {
    setIsCreateOpen(false)
    if (createdWorkspace?.id) {
      navigate(`/workspaces/${createdWorkspace.id}`)
    } else {
      load()
    }
  }

  const isEmpty = !isLoading && !error && workspaces.length === 0

  return (
    <section className="documents-page" aria-busy={isLoading || undefined}>
      <h1>Workspaces</h1>

      <div className="documents-actions documents-heading-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsCreateOpen(true)}
          disabled={isCreateOpen}
        >
          + New Workspace
        </button>
      </div>

      {isCreateOpen && (
        <CreateWorkspaceForm
          open={isCreateOpen}
          onCancel={() => setIsCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {isLoading && <p role="status">Loading workspaces…</p>}

      {error && !isLoading && (
        <>
          <p role="alert" className="form-error">Unable to load workspaces. Please try again.</p>
          <div className="documents-actions">
            <button type="button" className="btn btn-secondary" onClick={load}>
              Try again
            </button>
          </div>
        </>
      )}

      {isEmpty && (
        <div style={{ marginTop: '2rem', color: 'var(--app-text-muted)' }}>
          <p>No workspaces yet.</p>
          <p>Create your first workspace to organize documents and collaborate.</p>
        </div>
      )}

      {!isLoading && !error && workspaces.length > 0 && (
        <ul className="document-list" aria-label="Workspaces">
          {workspaces.map((ws) => (
            <li key={ws.id} className="document-item">
              <WorkspaceCard workspace={ws} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default WorkspacesPage
