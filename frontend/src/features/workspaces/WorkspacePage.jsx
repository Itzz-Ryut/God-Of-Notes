import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { workspacesApi } from './workspaces.api.js'
import { api } from '../../lib/api/client.js'
import { useAuth } from '../auth/auth.context.jsx'

function MemberRow({ member, isCurrentUserOwner, currentUserId, membersLength, editingMemberId, editRole, editSubmitting, editError, setEditingMemberId, setEditRole, setEditError, handleEditRole, removeMemberId, removeSubmitting, removeError, setRemoveMemberId, setRemoveError, handleRemoveMember, isLeaving, leaveSubmitting, leaveError, setIsLeaving, setLeaveError, handleLeave }) {
  const isCurrentMember = currentUserId === member.userId
  const isOwner = member.role === 'OWNER'
  const canEditRole = isCurrentUserOwner && !isOwner && !isCurrentMember
  const canRemove = isCurrentUserOwner && !isOwner

  return (
    <li key={member.userId} style={{ padding: '0.75rem 1rem', border: '1px solid var(--app-border)', borderRadius: '0.5rem', background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{member.username || member.userId}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--app-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{member.role}</span>
        {isCurrentUserOwner && (
          <>
            {!isOwner && (
              <>
                {editingMemberId === member.userId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label className="share-role-option" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input type="radio" name={`edit-role-${member.userId}`} value="EDITOR" checked={editRole === 'EDITOR'} onChange={() => setEditRole('EDITOR')} disabled={editSubmitting} />
                      Editor
                    </label>
                    <label className="share-role-option" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input type="radio" name={`edit-role-${member.userId}`} value="VIEWER" checked={editRole === 'VIEWER'} onChange={() => setEditRole('VIEWER')} disabled={editSubmitting} />
                      Viewer
                    </label>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => handleEditRole(member.userId)} disabled={editSubmitting || !editRole || editRole === member.role}>
                      {editSubmitting ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setEditingMemberId(null); setEditRole(''); setEditError(null) }} disabled={editSubmitting}>
                      Cancel
                    </button>
                    {editError && <span style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{editError}</span>}
                  </div>
                ) : (
                  <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setEditingMemberId(member.userId); setEditRole(member.role); setEditError(null) }}>
                    Change role
                  </button>
                )}
              </>
            )}
            {!isCurrentMember && canRemove && (
              <>
                {removeMemberId === member.userId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--app-text-muted)' }}>Remove {member.username || member.userId}?</span>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', color: 'var(--error)', borderColor: 'var(--error)' }} onClick={() => handleRemoveMember(member.userId)} disabled={removeSubmitting}>
                      {removeSubmitting ? 'Removing…' : 'Confirm'}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setRemoveMemberId(null); setRemoveError(null) }} disabled={removeSubmitting}>
                      Cancel
                    </button>
                    {removeError && <span style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{removeError}</span>}
                  </div>
                ) : (
                  <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', color: 'var(--error)', borderColor: 'var(--error)' }} onClick={() => { setRemoveMemberId(member.userId); setRemoveError(null) }}>
                    Remove
                  </button>
                )}
              </>
            )}
          </>
        )}
        {!isCurrentUserOwner && isCurrentMember && (
          <>
            {isLeaving ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--app-text-muted)' }}>Leave this workspace?</span>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', color: 'var(--error)', borderColor: 'var(--error)' }} onClick={handleLeave} disabled={leaveSubmitting}>
                  {leaveSubmitting ? 'Leaving…' : 'Confirm'}
                </button>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setIsLeaving(false); setLeaveError(null) }} disabled={leaveSubmitting}>
                  Cancel
                </button>
                {leaveError && <span style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{leaveError}</span>}
              </div>
            ) : (
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setIsLeaving(true); setLeaveError(null) }} disabled={membersLength <= 1}>
                Leave workspace
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

function WorkspacePage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const { user: authUser } = useAuth()

  // Workspace data
  const [workspace, setWorkspace] = useState(null)
  const [wsLoading, setWsLoading] = useState(true)
  const [wsError, setWsError] = useState(null)

  // Members
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState(null)

  // Documents
  const [documents, setDocuments] = useState([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState(null)

  // Member management
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRole, setSelectedRole] = useState('VIEWER')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addError, setAddError] = useState(null)

  const [editingMemberId, setEditingMemberId] = useState(null)
  const [editRole, setEditRole] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState(null)

  const [removeMemberId, setRemoveMemberId] = useState(null)
  const [removeSubmitting, setRemoveSubmitting] = useState(false)
  const [removeError, setRemoveError] = useState(null)

  const [isLeaving, setIsLeaving] = useState(false)
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [leaveError, setLeaveError] = useState(null)

  // Document picker for association
  const [docPickerOpen, setDocPickerOpen] = useState(false)
  const [accessibleDocs, setAccessibleDocs] = useState([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState(null)
  const [selectedDocId, setSelectedDocId] = useState('')
  const [addDocSubmitting, setAddDocSubmitting] = useState(false)
  const [addDocError, setAddDocError] = useState(null)
  const [removeDocId, setRemoveDocId] = useState(null)
  const [removeDocSubmitting, setRemoveDocSubmitting] = useState(false)
  const [removeDocError, setRemoveDocError] = useState(null)
  const [restoreDocId, setRestoreDocId] = useState(null)
  const [restoreDocSubmitting, setRestoreDocSubmitting] = useState(false)
  const [restoreDocError, setRestoreDocError] = useState(null)

  // Workspace settings
  const [isEditingSettings, setIsEditingSettings] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [settingsSubmitting, setSettingsSubmitting] = useState(false)
  const [settingsError, setSettingsError] = useState(null)

  // Ownership transfer
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferUserId, setTransferUserId] = useState('')
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [transferError, setTransferError] = useState(null)

  // Determine if current user is OWNER based on members response (display only; backend authoritative)
  const currentUserId = authUser?.id || null
  const currentMember = currentUserId ? members.find((m) => m.userId === currentUserId) : null
  const isCurrentUserOwner = currentMember?.role === 'OWNER'
  const isCurrentUserEditor = currentMember?.role === 'EDITOR'
  const isCurrentAssociationManager = isCurrentUserOwner || isCurrentUserEditor

  const refreshMembers = useCallback(async () => {
    if (!workspaceId) return
    setMembersLoading(true)
    setMembersError(null)
    try {
      const payload = await workspacesApi.getWorkspaceMembers(workspaceId)
      setMembers(Array.isArray(payload?.members) ? payload.members : [])
    } catch (err) {
      setMembersError(err?.message || 'Failed to load members.')
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [workspaceId])

  // Workspace load
  useEffect(() => {
    if (!workspaceId) return
    setWsLoading(true)
    setWsError(null)
    workspacesApi.getWorkspace(workspaceId)
      .then((payload) => setWorkspace(payload?.workspace ?? null))
      .catch((err) => { setWsError(err?.message || 'Failed to load workspace.'); setWorkspace(null) })
      .finally(() => setWsLoading(false))
  }, [workspaceId])

  // Members load
  useEffect(() => {
    refreshMembers()
  }, [workspaceId, refreshMembers])

  // Documents load
  useEffect(() => {
    if (!workspaceId) return
    setDocsLoading(true)
    setDocsError(null)
    workspacesApi.getWorkspaceDocuments(workspaceId)
      .then((payload) => setDocuments(Array.isArray(payload?.documents) ? payload.documents : []))
      .catch((err) => { setDocsError(err?.message || 'Failed to load documents.'); setDocuments([]) })
      .finally(() => setDocsLoading(false))
  }, [workspaceId])

  // Username lookup (debounced)
  useEffect(() => {
    const trimmed = searchName.trim()
    if (trimmed.length === 0) {
      setSearchResults([])
      setSearchError(null)
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const payload = await api.get(`/users/lookup?username=${encodeURIComponent(trimmed)}`)
        const user = payload?.user
        setSearchResults(user ? [user] : [])
      } catch (err) {
        if (err?.status === 404) {
          setSearchResults([])
          setSearchError('No user found with that username.')
        } else {
          setSearchResults([])
          setSearchError(err?.message || 'Lookup failed.')
        }
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchName])

  const handleAddMember = async () => {
    if (!selectedUser || !selectedRole) return
    setAddSubmitting(true)
    setAddError(null)
    try {
      await workspacesApi.addWorkspaceMember(workspaceId, { userId: selectedUser.id, role: selectedRole })
      setSearchName('')
      setSelectedUser(null)
      setSelectedRole('VIEWER')
      setIsAddOpen(false)
      await refreshMembers()
    } catch (err) {
      setAddError(err?.message || 'Failed to add member.')
    } finally {
      setAddSubmitting(false)
    }
  }

  const handleEditRole = async (userId) => {
    setEditSubmitting(true)
    setEditError(null)
    try {
      await workspacesApi.updateWorkspaceMemberRole(workspaceId, userId, { role: editRole })
      setEditingMemberId(null)
      setEditRole('')
      await refreshMembers()
    } catch (err) {
      setEditError(err?.message || 'Failed to update role.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleRemoveMember = async (userId) => {
    setRemoveSubmitting(true)
    setRemoveError(null)
    try {
      await workspacesApi.removeWorkspaceMember(workspaceId, userId)
      setRemoveMemberId(null)
      await refreshMembers()
    } catch (err) {
      setRemoveError(err?.message || 'Failed to remove member.')
    } finally {
      setRemoveSubmitting(false)
    }
  }

  const handleDocAdd = async () => {
    if (!selectedDocId) return
    setAddDocSubmitting(true)
    setAddDocError(null)
    try {
      await workspacesApi.addWorkspaceDocument(workspaceId, { documentId: selectedDocId })
      setSelectedDocId('')
      setDocPickerOpen(false)
      const payload = await workspacesApi.getWorkspaceDocuments(workspaceId)
      setDocuments(Array.isArray(payload?.documents) ? payload.documents : [])
    } catch (err) {
      setAddDocError(err?.message || 'Failed to add document.')
    } finally {
      setAddDocSubmitting(false)
    }
  }

  const handleDocRemove = async (documentId) => {
    setRemoveDocSubmitting(true)
    setRemoveDocError(null)
    try {
      await workspacesApi.removeWorkspaceDocument(workspaceId, documentId)
      setRemoveDocId(null)
      const payload = await workspacesApi.getWorkspaceDocuments(workspaceId)
      setDocuments(Array.isArray(payload?.documents) ? payload.documents : [])
    } catch (err) {
      setRemoveDocError(err?.message || 'Failed to remove document.')
    } finally {
      setRemoveDocSubmitting(false)
    }
  }

  const handleDocRestore = async (documentId) => {
    setRestoreDocSubmitting(true)
    setRestoreDocError(null)
    try {
      await workspacesApi.restoreWorkspaceDocument(workspaceId, documentId)
      setRestoreDocId(null)
      const payload = await workspacesApi.getWorkspaceDocuments(workspaceId)
      setDocuments(Array.isArray(payload?.documents) ? payload.documents : [])
    } catch (err) {
      setRestoreDocError(err?.message || 'Failed to restore association.')
    } finally {
      setRestoreDocSubmitting(false)
    }
  }

  const [trashSubmitting, setTrashSubmitting] = useState(false)
  const [trashError, setTrashError] = useState(null)
  const [trashConfirm, setTrashConfirm] = useState(false)
  const [restoreWsSubmitting, setRestoreWsSubmitting] = useState(false)
  const [restoreWsError, setRestoreWsError] = useState(null)
  const [deleteWsSubmitting, setDeleteWsSubmitting] = useState(false)
  const [deleteWsError, setDeleteWsError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const handleTrashWorkspace = async () => {
    setTrashSubmitting(true)
    setTrashError(null)
    try {
      const payload = await workspacesApi.trashWorkspace(workspaceId)
      setWorkspace(payload?.workspace ?? workspace)
      setTrashConfirm(false)
    } catch (err) {
      setTrashError(err?.message || 'Failed to trash workspace.')
    } finally {
      setTrashSubmitting(false)
    }
  }

  const handleRestoreWorkspace = async () => {
    setRestoreWsSubmitting(true)
    setRestoreWsError(null)
    try {
      const payload = await workspacesApi.restoreWorkspace(workspaceId)
      setWorkspace(payload?.workspace ?? workspace)
    } catch (err) {
      setRestoreWsError(err?.message || 'Failed to restore workspace.')
    } finally {
      setRestoreWsSubmitting(false)
    }
  }

  const handlePermanentlyDeleteWorkspace = async () => {
    setDeleteWsSubmitting(true)
    setDeleteWsError(null)
    try {
      await workspacesApi.permanentlyDeleteWorkspace(workspaceId)
      navigate('/workspaces')
    } catch (err) {
      setDeleteWsError(err?.message || 'Failed to permanently delete workspace.')
    } finally {
      setDeleteWsSubmitting(false)
    }
  }

  const handleUpdateSettings = async () => {
    setSettingsSubmitting(true)
    setSettingsError(null)
    try {
      const payload = await workspacesApi.updateWorkspace(workspaceId, { name: editName.trim(), description: editDescription.trim() || undefined })
      setWorkspace(payload?.workspace ?? workspace)
      setIsEditingSettings(false)
    } catch (err) {
      setSettingsError(err?.message || 'Failed to update workspace.')
    } finally {
      setSettingsSubmitting(false)
    }
  }

  const handleTransferOwnership = async () => {
    setTransferSubmitting(true)
    setTransferError(null)
    try {
      const payload = await workspacesApi.transferWorkspaceOwnership(workspaceId, { userId: transferUserId })
      setWorkspace(payload?.workspace ?? workspace)
      setTransferOpen(false)
      setTransferUserId('')
      await refreshMembers()
    } catch (err) {
      setTransferError(err?.message || 'Failed to transfer ownership.')
    } finally {
      setTransferSubmitting(false)
    }
  }

  const handleLeave = async () => {
    setLeaveSubmitting(true)
    setLeaveError(null)
    try {
      await workspacesApi.leaveWorkspace(workspaceId)
      navigate('/workspaces')
    } catch (err) {
      setLeaveError(err?.message || 'Failed to leave workspace.')
    } finally {
      setLeaveSubmitting(false)
    }
  }

  useEffect(() => {
    if (docPickerOpen && workspace && workspace.workspaceState === 'ACTIVE') {
      setPickerLoading(true)
      setPickerError(null)
      api.get('/documents').then((payload) => {
        setAccessibleDocs(Array.isArray(payload?.documents) ? payload.documents : [])
      }).catch((err) => {
        setPickerError(err?.message || 'Failed to load accessible documents.')
        setAccessibleDocs([])
      }).finally(() => setPickerLoading(false))
    }
  }, [docPickerOpen, workspace, workspaceId])

  const hasWorkspaceError = wsError !== null
  const isEmptyMembers = !membersLoading && !membersError && members.length === 0
  const isEmptyDocs = !docsLoading && !docsError && documents.length === 0

  return (
    <section className="documents-page" aria-busy={wsLoading ? true : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <Link to="/workspaces" className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.875rem', textDecoration: 'none' }}>
          ← Workspaces
        </Link>
      </div>

      {wsLoading && <p role="status">Loading workspace…</p>}

      {hasWorkspaceError && !wsLoading && (
        <>
          <p role="alert" className="form-error">{wsError}</p>
          <div className="documents-actions">
            <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </>
      )}

      {workspace && !wsLoading && (
        <>
          <h1 style={{ margin: '0 0 0.25rem', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '1.75rem', letterSpacing: '0.01em', color: 'var(--app-text)' }}>
            {workspace.name}
          </h1>
          {workspace.description && (
            <p style={{ margin: '0 0 1.5rem', color: 'var(--app-text-muted)' }}>{workspace.description}</p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.875rem', color: 'var(--app-text-muted)', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{workspace.workspaceState}</span>
            {(() => {
              const ownerMember = members.find((m) => m.userId === workspace.ownerId)
              return ownerMember ? <span>Owner: {ownerMember.username || workspace.ownerId}</span> : <span>Owner: {workspace.ownerId}</span>
            })()}
            {isCurrentUserOwner && workspace && !wsLoading && !wsError && (
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', marginLeft: 'auto' }} onClick={() => setShowSettingsPanel(true)} title="Workspace settings">
                ⚙ Settings
              </button>
            )}
          </div>
        </>
      )}

      {isCurrentUserOwner && workspace && !wsLoading && !wsError && showSettingsPanel && (
        <div style={{ marginBottom: '1rem', padding: '1rem 1.25rem', border: '1px solid var(--app-border)', borderRadius: '0.5rem', background: 'transparent', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--app-text)' }}>Workspace settings</h3>
            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => setShowSettingsPanel(false)} aria-label="Close settings">✕</button>
          </div>
          {!isEditingSettings ? (
            <div>
              <p style={{ margin: '0 0 0.25rem', color: 'var(--app-text)' }}><strong>{workspace.name}</strong></p>
              {workspace.description && <p style={{ margin: '0 0 0.75rem', color: 'var(--app-text-muted)' }}>{workspace.description}</p>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.35rem 0.6rem' }} onClick={() => { setEditName(workspace.name); setEditDescription(workspace.description || ''); setIsEditingSettings(true); setSettingsError(null); }}>Edit settings</button>
                <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.35rem 0.6rem', color: (workspace.workspaceState === 'ACTIVE' ? 'var(--error)' : 'inherit'), borderColor: (workspace.workspaceState === 'ACTIVE' ? 'var(--error)' : 'inherit') }} onClick={() => { workspace.workspaceState === 'ACTIVE' ? setTrashConfirm(true) : workspace.workspaceState === 'TRASHED' ? setDeleteConfirm(true) : null; }}>{workspace.workspaceState === 'ACTIVE' ? 'Trash' : workspace.workspaceState === 'TRASHED' ? 'Permanently delete' : 'Lifecycle'}</button>
                {workspace.workspaceState === 'TRASHED' && (
                  <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.35rem 0.6rem' }} onClick={handleRestoreWorkspace} disabled={restoreWsSubmitting}>
                    {restoreWsSubmitting ? 'Restoring…' : 'Restore'}
                  </button>
                )}
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--app-border)' }}>
                <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--app-text)' }}>Ownership</h4>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => setTransferOpen(true)} disabled={transferSubmitting}>Transfer ownership</button>
                {transferOpen && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <select value={transferUserId} onChange={(e) => setTransferUserId(e.target.value)} disabled={transferSubmitting} style={{ padding: '0.5rem' }}>
                      <option value="">Select member…</option>
                      {members.filter((m) => m.role !== 'OWNER').map((m) => (
                        <option key={m.userId} value={m.userId}>{m.username || m.userId}</option>
                      ))}
                    </select>
                    {transferError && <p className="form-error">{transferError}</p>}
                    <div className="documents-actions">
                      <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setTransferOpen(false); setTransferUserId(''); setTransferError(null); }} disabled={transferSubmitting}>Cancel</button>
                      <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={handleTransferOwnership} disabled={transferSubmitting || !transferUserId}>
                        {transferSubmitting ? 'Transferring…' : 'Transfer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="form-group">
                <label htmlFor="settings-name" className="form-label">Name</label>
                <input id="settings-name" className="form-input" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={settingsSubmitting} />
              </div>
              <div className="form-group">
                <label htmlFor="settings-desc" className="form-label">Description</label>
                <textarea id="settings-desc" className="form-input" rows={2} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} disabled={settingsSubmitting} />
              </div>
              {settingsError && <p className="form-error">{settingsError}</p>}
              <div className="documents-actions">
                <button className="btn btn-secondary" onClick={() => { setIsEditingSettings(false); setEditName(''); setEditDescription(''); setSettingsError(null); }} disabled={settingsSubmitting}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpdateSettings} disabled={settingsSubmitting || editName.trim().length === 0 || editName.trim().length > 255}>
                  {settingsSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: 'var(--app-text)' }}>Members</h2>
      {membersLoading && <p role="status">Loading members…</p>}
      {membersError && !membersLoading && <p role="alert" className="form-error">{membersError}</p>}
      {members.length === 0 && !membersLoading && !membersError && (
        <p style={{ color: 'var(--app-text-muted)' }}>No members yet.</p>
      )}

      {/* Add member control — only for OWNER per backend authorization */}
      {isCurrentUserOwner && workspace && !wsLoading && !wsError && (
        <div style={{ marginBottom: '1rem' }}>
          {!isAddOpen ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setIsAddOpen(true); setSearchName(''); setSelectedUser(null); setSelectedRole('VIEWER'); setAddError(null); setSearchResults([]); }}
            >
              + Add member
            </button>
          ) : (
            <div style={{ padding: '1rem 1.25rem', border: '1px solid var(--app-border)', borderRadius: '0.5rem', background: 'transparent', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--app-text)' }}>Add member</h3>
              <div className="form-group">
                <label htmlFor="member-search" className="form-label">Search username</label>
                <input
                  id="member-search"
                  className="form-input"
                  type="text"
                  value={searchName}
                  onChange={(e) => { setSearchName(e.target.value); setSelectedUser(null); }}
                  placeholder="Type username..."
                  disabled={addSubmitting}
                  autoFocus
                />
                {searchLoading && <span style={{ fontSize: '0.8125rem', color: 'var(--app-text-muted)' }}>Searching…</span>}
                {searchError && <p className="field-error">{searchError}</p>}
                {searchResults.length > 0 && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', border: '1px solid var(--app-border)', borderRadius: '0.375rem', background: 'var(--input-bg)' }}>
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.9375rem', borderRadius: '0.375rem', color: 'var(--app-text)' }}
                        onClick={() => setSelectedUser(user)}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--app-border) 30%, transparent)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontWeight: 600 }}>{user.username}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--app-text-muted)' }}>
                    Selected user: <strong>{selectedUser.username}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <label className="share-role-option" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                      <input type="radio" name="add-role" value="EDITOR" checked={selectedRole === 'EDITOR'} onChange={() => setSelectedRole('EDITOR')} disabled={addSubmitting} />
                      Editor
                    </label>
                    <label className="share-role-option" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                      <input type="radio" name="add-role" value="VIEWER" checked={selectedRole === 'VIEWER'} onChange={() => setSelectedRole('VIEWER')} disabled={addSubmitting} />
                      Viewer
                    </label>
                  </div>
                </div>
              )}
              {addError && <p className="form-error">{addError}</p>}
              <div className="documents-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddOpen(false)} disabled={addSubmitting}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleAddMember} disabled={addSubmitting || !selectedUser || !selectedRole}>
                  {addSubmitting ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {members.length > 0 && !membersLoading && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
           {members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                isCurrentUserOwner={isCurrentUserOwner}
                currentUserId={currentUserId}
                membersLength={members.length}
                isLeaving={currentUserId === m.userId ? isLeaving : false}
               leaveSubmitting={leaveSubmitting}
               leaveError={leaveError}
               setIsLeaving={setIsLeaving}
               setLeaveError={setLeaveError}
               handleLeave={handleLeave}
               editingMemberId={editingMemberId}
               editRole={editRole}
               editSubmitting={editSubmitting}
               editError={editError}
               setEditingMemberId={setEditingMemberId}
               setEditRole={setEditRole}
               setEditError={setEditError}
               handleEditRole={handleEditRole}
               removeMemberId={removeMemberId}
               removeSubmitting={removeSubmitting}
               removeError={removeError}
               setRemoveMemberId={setRemoveMemberId}
               setRemoveError={setRemoveError}
               handleRemoveMember={handleRemoveMember}
             />
           ))}
        </ul>
      )}

      <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: 'var(--app-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Documents</span>
        {isCurrentAssociationManager && workspace && !wsLoading && !wsError && workspace.workspaceState === 'ACTIVE' && (
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setDocPickerOpen(true); setSelectedDocId(''); setAddDocError(null); }}>
            + Add document
          </button>
        )}
      </h2>
      {docPickerOpen && (
        <div style={{ padding: '1rem 1.25rem', border: '1px solid var(--app-border)', borderRadius: '0.5rem', background: 'transparent', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--app-text)' }}>Select document</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--app-text-muted)' }}>Search your accessible documents</p>
          {pickerLoading && <p role="status">Loading documents…</p>}
          {pickerError && <p role="alert" className="form-error">{pickerError}</p>}
          {accessibleDocs.length === 0 && !pickerLoading && !pickerError && <p style={{ color: 'var(--app-text-muted)' }}>No accessible documents.</p>}
          {accessibleDocs.length > 0 && !pickerLoading && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {accessibleDocs.map((doc) => (
                <li key={doc.id}>
                  <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: '1px solid var(--app-border)', borderRadius: '0.375rem', background: 'transparent', cursor: 'pointer', fontSize: '0.9375rem', color: selectedDocId === doc.id ? 'var(--app-text)' : 'var(--app-text-muted)', fontWeight: selectedDocId === doc.id ? 600 : 400 }} onClick={() => setSelectedDocId(doc.id)}>
                    <div style={{ fontWeight: 600 }}>{doc.title}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--app-text-muted)' }}>{doc.documentState || 'ACTIVE'}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {addDocError && <p className="form-error">{addDocError}</p>}
          <div className="documents-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setDocPickerOpen(false); setSelectedDocId(''); setAddDocError(null); }} disabled={addDocSubmitting}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleDocAdd} disabled={addDocSubmitting || !selectedDocId}>
              {addDocSubmitting ? 'Adding…' : 'Add to workspace'}
            </button>
          </div>
        </div>
      )}
      {docsLoading && <p role="status">Loading documents…</p>}
      {docsError && !docsLoading && <p role="alert" className="form-error">{docsError}</p>}
      {documents.length === 0 && !docsLoading && !docsError && (
        <p style={{ color: 'var(--app-text-muted)' }}>No documents in this workspace yet.</p>
      )}
      {documents.length > 0 && !docsLoading && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {documents.map((doc) => (
            <li key={doc.id}>
              <div style={{ padding: '0.875rem 1rem', border: '1px solid var(--app-border)', borderRadius: '0.5rem', color: 'var(--app-text)', background: 'transparent', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <Link to={`/documents/${doc.id}`} style={{ fontWeight: 600, textDecoration: 'none', color: 'var(--app-text)' }}>
                  {doc.title}
                </Link>
                <span style={{ fontSize: '0.875rem', color: 'var(--app-text-muted)' }}>
                  {(() => {
                    const d = doc.associationState || doc.documentState || 'ACTIVE'
                    const docState = doc.documentState || 'ACTIVE'
                    const assocState = doc.associationState || 'ACTIVE'
                    if (assocState === docState) {
                      return <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{assocState === 'WORKSPACE_TRASHED' ? 'Workspace trashed' : assocState === 'OWNER_TRASHED' ? 'Owner trashed' : 'Active'}</span>
                    }
                    return (
                      <>
                        <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{assocState === 'WORKSPACE_TRASHED' ? 'Workspace trashed' : assocState === 'OWNER_TRASHED' ? 'Owner trashed' : 'Active'}</span>
                        <span style={{ marginLeft: '0.25rem' }}>·</span>
                        <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{docState === 'WORKSPACE_TRASHED' ? 'Workspace trashed' : docState === 'OWNER_TRASHED' ? 'Owner trashed' : 'Active'}</span>
                      </>
                    )
                  })()}
                  {doc.createdAt && <span> · Created {new Date(doc.createdAt).toLocaleDateString()}</span>}
                </span>
                  {isCurrentAssociationManager && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      {doc.associationState === 'WORKSPACE_TRASHED' ? (
                        <>
                          {restoreDocId === doc.id ? (
                            <>
                              <span style={{ fontSize: '0.8125rem', color: 'var(--app-text-muted)' }}>Restore association?</span>
                              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => handleDocRestore(doc.id)} disabled={restoreDocSubmitting}>
                                {restoreDocSubmitting ? 'Restoring…' : 'Confirm restore'}
                              </button>
                              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setRestoreDocId(null); setRestoreDocError(null); }} disabled={restoreDocSubmitting}>
                                Cancel
                              </button>
                              {restoreDocError && <span style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{restoreDocError}</span>}
                            </>
                          ) : (
                            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setRestoreDocId(doc.id); setRestoreDocError(null); }}>
                              Restore
                            </button>
                          )}
                        </>
                      ) : doc.associationState === 'ACTIVE' ? (
                        <>
                          {removeDocId === doc.id ? (
                            <>
                              <span style={{ fontSize: '0.8125rem', color: 'var(--app-text-muted)' }}>Remove from workspace?</span>
                              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', color: 'var(--error)', borderColor: 'var(--error)' }} onClick={() => handleDocRemove(doc.id)} disabled={removeDocSubmitting}>
                                {removeDocSubmitting ? 'Removing…' : 'Confirm'}
                              </button>
                              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={() => { setRemoveDocId(null); setRemoveDocError(null); }} disabled={removeDocSubmitting}>
                                Cancel
                              </button>
                              {removeDocError && <span style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{removeDocError}</span>}
                            </>
                          ) : (
                            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', color: 'var(--error)', borderColor: 'var(--error)' }} onClick={() => { setRemoveDocId(doc.id); setRemoveDocError(null); }}>
                              Remove
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default WorkspacePage
