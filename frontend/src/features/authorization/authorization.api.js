import { api } from '../../lib/api/client.js'

export const authorizationApi = {
  lookupUser(username) {
    const params = new URLSearchParams()
    if (typeof username === 'string' && username.trim().length > 0) {
      params.set('username', username.trim())
    }
    const query = params.toString()
    return api.get(query.length > 0 ? `/users/lookup?${query}` : '/users/lookup')
  },

  listDocumentPermissions(documentId) {
    return api.get(`/authorization/documents/${documentId}/permissions`)
  },

  grantDocumentPermission(documentId, userId, permission) {
    return api.post(`/authorization/documents/${documentId}/permissions`, { userId, permission })
  },

  updateDocumentPermission(documentId, userId, permission) {
    return api.patch(`/authorization/documents/${documentId}/permissions/${userId}`, { permission })
  },

  revokeDocumentPermission(documentId, userId) {
    return api.delete(`/authorization/documents/${documentId}/permissions/${userId}`)
  },
}
