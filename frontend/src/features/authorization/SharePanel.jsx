import { useCallback, useEffect, useRef, useState } from 'react'
import { authorizationApi } from './authorization.api.js'
import { ApiError } from '../../lib/api/errors.js'

function SharePanel({ document, onClose }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedPermission, setSelectedPermission] = useState('EDITOR')
  const [permissions, setPermissions] = useState(null)
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [permissionsError, setPermissionsError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [grantLoading, setGrantLoading] = useState(false)

  const [editingUserId, setEditingUserId] = useState(null)
  const [editPermission, setEditPermission] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [removingUserId, setRemovingUserId] = useState(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const debounceRef = useRef(null)

  const refreshPermissions = useCallback(async () => {
    if (!document?.id) return
    setPermissionsLoading(true)
    setPermissionsError('')
    try {
      const payload = await authorizationApi.listDocumentPermissions(document.id)
      setPermissions(payload?.permissions ?? [])
    } catch (err) {
      const msg = err instanceof ApiError ? err.message || 'Failed to load access list.' : 'Failed to load access list.'
      setPermissionsError(msg)
    } finally {
      setPermissionsLoading(false)
    }
  }, [document])

  useEffect(() => {
    refreshPermissions()
  }, [refreshPermissions])

  const runSearch = useCallback(
    async (query) => {
      if (!query || query.trim().length === 0) {
        setSearchResults([])
        setSearchLoading(false)
        setSearchError('')
        return
      }
      setSearchLoading(true)
      setSearchError('')
      try {
        const payload = await authorizationApi.lookupUser(query)
        const user = payload?.user ?? null
        if (user) {
          setSearchResults([user])
        } else {
          setSearchResults([])
        }
      } catch (err) {
        setSearchResults([])
        setSearchError(err instanceof ApiError ? err.message || 'Search failed.' : 'Search failed.')
      } finally {
        setSearchLoading(false)
      }
    },
    []
  )

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    setSelectedUser(null)
    setMutationError('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length === 0) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError('')
      return
    }
    setSearchLoading(true)
    debounceRef.current = setTimeout(() => {
      runSearch(value)
    }, 350)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const existingPermissionForUser = (userId) => {
    if (!permissions || !permissions.length) return null
    return permissions.find((p) => p.userId === userId) || null
  }

  const handleGrant = async () => {
    if (!selectedUser || !document?.id) return
    const existing = existingPermissionForUser(selectedUser.id)
    if (existing) {
      setMutationError('This user already has direct access. Use the edit action instead.')
      return
    }
    setGrantLoading(true)
    setMutationError('')
    try {
      await authorizationApi.grantDocumentPermission(document.id, selectedUser.id, selectedPermission)
      await refreshPermissions()
      setSearchQuery('')
      setSearchResults([])
      setSelectedUser(null)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message || 'Failed to grant access.' : 'Failed to grant access.'
      setMutationError(msg)
    } finally {
      setGrantLoading(false)
    }
  }

  const handleEditSave = async (userId) => {
    if (!document?.id || !editPermission) return
    setEditLoading(true)
    setMutationError('')
    try {
      await authorizationApi.updateDocumentPermission(document.id, userId, editPermission)
      await refreshPermissions()
      setEditingUserId(null)
      setEditPermission('')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message || 'Failed to update permission.' : 'Failed to update permission.'
      setMutationError(msg)
    } finally {
      setEditLoading(false)
    }
  }

  const handleRemoveConfirm = async () => {
    if (!removingUserId || !document?.id) return
    setRemoveLoading(true)
    setMutationError('')
    try {
      await authorizationApi.revokeDocumentPermission(document.id, removingUserId)
      await refreshPermissions()
      setRemovingUserId(null)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message || 'Failed to remove access.' : 'Failed to remove access.'
      setMutationError(msg)
    } finally {
      setRemoveLoading(false)
    }
  }

  return (
    <div className="share-panel-overlay" role="dialog" aria-modal="true" aria-label="Share document">
      <div className="share-panel">
        <div className="share-panel-header">
          <h2 className="share-panel-title">Share document</h2>
          <button type="button" className="share-panel-close" onClick={onClose} aria-label="Close share panel">
            ×
          </button>
        </div>

        <div className="share-panel-body">
          {/* User search */}
          <div className="share-search-section">
            <label htmlFor="share-username-search" className="share-section-label">
              Find a user
            </label>
            <input
              id="share-username-search"
              type="text"
              className="share-search-input"
              placeholder="Search username…"
              value={searchQuery}
              onChange={handleSearchChange}
              autoComplete="off"
            />
            {searchLoading ? (
              <p className="share-status-text" role="status">Searching…</p>
            ) : searchError ? (
              <p className="share-status-text share-status-error" role="alert">{searchError}</p>
            ) : searchResults.length === 0 && searchQuery.trim().length > 0 ? (
              <p className="share-status-text">No user found.</p>
            ) : null}
            {searchResults.length > 0 && (
              <div className="share-search-results" role="listbox">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="share-search-result"
                    onClick={() => setSelectedUser(user)}
                    role="option"
                    aria-selected={selectedUser?.id === user.id ? 'true' : undefined}
                  >
                    <span
                      className="share-user-color-dot"
                      style={{
                        backgroundColor: user.identityColor || '#8fb2ac',
                      }}
                      aria-hidden="true"
                    />
                    <span className="share-user-username">{user.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected user + grant */}
          {selectedUser && (
            <div className="share-grant-section">
              <div className="share-section-label">Grant access to {selectedUser.username}</div>
              <div className="share-role-selector">
                <label htmlFor="share-role-editor" className="share-role-option">
                  <input
                    id="share-role-editor"
                    type="radio"
                    name="share-role"
                    value="EDITOR"
                    checked={selectedPermission === 'EDITOR'}
                    onChange={(e) => setSelectedPermission(e.target.value)}
                  />
                  <span>Editor</span>
                </label>
                <label htmlFor="share-role-viewer" className="share-role-option">
                  <input
                    id="share-role-viewer"
                    type="radio"
                    name="share-role"
                    value="VIEWER"
                    checked={selectedPermission === 'VIEWER'}
                    onChange={(e) => setSelectedPermission(e.target.value)}
                  />
                  <span>Viewer</span>
                </label>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGrant}
                disabled={grantLoading || !selectedPermission}
                aria-busy={grantLoading ? 'true' : undefined}
              >
                {grantLoading ? 'Sharing…' : 'Share'}
              </button>
            </div>
          )}

          {/* Direct permissions */}
          <div className="share-permissions-section">
            <h3 className="share-section-label">People with direct access</h3>
            {permissionsLoading ? (
              <p className="share-status-text" role="status">Loading access…</p>
            ) : permissionsError ? (
              <p className="share-status-text share-status-error" role="alert">{permissionsError}</p>
            ) : permissions && permissions.length === 0 ? (
              <p className="share-status-text">No one else has direct access yet.</p>
            ) : (
              <ul className="share-permission-list" aria-label="Direct access list">
                {permissions?.map((p) => (
                  <li key={p.userId} className="share-permission-row">
                    <div className="share-user-info">
                      <span
                        className="share-user-color-dot"
                        style={{
                          backgroundColor: p.identityColor || '#8fb2ac',
                        }}
                        aria-hidden="true"
                      />
                      <span className="share-user-username">{p.username}</span>
                    </div>
                    <div className="share-permission-actions">
                      {editingUserId === p.userId ? (
                        <div className="share-edit-role">
                          <select
                            value={editPermission}
                            onChange={(e) => setEditPermission(e.target.value)}
                            className="share-role-select"
                            disabled={editLoading}
                            aria-label={`Change role for ${p.username}`}
                          >
                            <option value="EDITOR">Editor</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                          <button
                            type="button"
                            className="btn btn-secondary share-role-save"
                            onClick={() => handleEditSave(p.userId)}
                            disabled={editLoading || !editPermission || editPermission === p.permission}
                            aria-busy={editLoading ? 'true' : undefined}
                          >
                            {editLoading ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary share-role-cancel"
                            onClick={() => { setEditingUserId(null); setEditPermission(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="share-permission-controls">
                          <span className="share-permission-label">{p.permission}</span>
                          <button
                            type="button"
                            className="btn btn-secondary share-change-btn"
                            onClick={() => {
                              setEditingUserId(p.userId)
                              setEditPermission(p.permission)
                            }}
                            aria-label={`Change role for ${p.username}`}
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary share-remove-btn"
                            onClick={() => setRemovingUserId(p.userId)}
                            aria-label={`Remove access for ${p.username}`}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Owner display */}
          {document?.ownerId && (
            <div className="share-owner-section">
              <div className="share-owner-row">
                <span className="share-owner-label">Document owner</span>
                <span className="share-owner-value">Owner</span>
              </div>
              <p className="share-owner-note">Only the document owner can manage direct permissions.</p>
            </div>
          )}
        </div>

        {mutationError && (
          <div className="share-mutation-error" role="alert">
            <p className="share-status-text share-status-error">{mutationError}</p>
          </div>
        )}

        {/* Remove confirmation */}
        {removingUserId && (
          <div className="share-confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirm removal">
            <div className="share-confirm-body">
              <p className="share-confirm-text">Remove this user&apos;s direct access?</p>
              <p className="share-confirm-detail">They will lose direct access to this document.</p>
              <div className="share-confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRemovingUserId(null)}
                  disabled={removeLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRemoveConfirm}
                  disabled={removeLoading}
                  aria-busy={removeLoading ? 'true' : undefined}
                >
                  {removeLoading ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="share-panel-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default SharePanel
