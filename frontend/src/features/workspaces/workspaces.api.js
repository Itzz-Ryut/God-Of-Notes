import { api } from '../../lib/api/client.js'

export const workspacesApi = {
  listWorkspaces() {
    return api.get('/workspaces')
  },

  getWorkspace(workspaceId) {
    return api.get(`/workspaces/${workspaceId}`)
  },

  getWorkspaceMembers(workspaceId) {
    return api.get(`/workspaces/${workspaceId}/members`)
  },

  getWorkspaceDocuments(workspaceId) {
    return api.get(`/workspaces/${workspaceId}/documents`)
  },

  createWorkspace({ name, description }) {
    return api.post('/workspaces', { name, description })
  },

  addWorkspaceMember(workspaceId, { userId, role }) {
    return api.post(`/workspaces/${workspaceId}/members`, { userId, role })
  },

  updateWorkspaceMemberRole(workspaceId, userId, { role }) {
    return api.patch(`/workspaces/${workspaceId}/members/${userId}`, { role })
  },

  removeWorkspaceMember(workspaceId, userId) {
    return api.delete(`/workspaces/${workspaceId}/members/${userId}`)
  },

  leaveWorkspace(workspaceId) {
    return api.delete(`/workspaces/${workspaceId}/members/me`)
  },

  addWorkspaceDocument(workspaceId, { documentId }) {
    return api.post(`/workspaces/${workspaceId}/documents`, { documentId })
  },

  removeWorkspaceDocument(workspaceId, documentId) {
    return api.delete(`/workspaces/${workspaceId}/documents/${documentId}`)
  },

  restoreWorkspaceDocument(workspaceId, documentId) {
    return api.post(`/workspaces/${workspaceId}/documents/${documentId}/restore`)
  },

  updateWorkspace(workspaceId, { name, description }) {
    return api.patch(`/workspaces/${workspaceId}`, { name, description })
  },

  transferWorkspaceOwnership(workspaceId, { userId }) {
    return api.patch(`/workspaces/${workspaceId}/owner`, { userId })
  },

  listAccessibleDocuments() {
    return api.get('/documents')
  },
}
