// 18.3 Workspace Creation: public API mapping, following the project's
// camelCase conventions used by documents/mapper.js and users/mapper.js
// (snake_case DB columns -> camelCase response fields).
const toPublicWorkspace = (workspace) => {
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    ownerId: workspace.owner_id,
    workspaceState: workspace.workspace_state,
    createdAt: workspace.created_at,
    updatedAt: workspace.updated_at,
  };
};

// 18.7 Workspace membership: public member mapping. Exposes ONLY the
// identity needed to identify the member + the role + joinedAt. Never
// exposes credentials, tokens, internal DB fields, permission rows, or
// authorization internals.
const toPublicWorkspaceMember = (member) => {
  return {
    userId: member.user_id,
    username: member.username,
    identityColor: member.identity_color,
    role: member.role,
    joinedAt: member.joined_at,
  };
};

// 18.8 Workspace <-> Document association: public association mapping.
// Exposes ONLY identity + state — never added_by, internal DB columns,
// document content/ownership, or permission data.
const toPublicWorkspaceDocumentAssociation = (association) => {
  return {
    id: association.id,
    workspaceId: association.workspace_id,
    documentId: association.document_id,
    associationState: association.association_state,
    createdAt: association.created_at,
    updatedAt: association.updated_at,
  };
};

export {
  toPublicWorkspaceMember,
  toPublicWorkspace,
  toPublicWorkspaceDocumentAssociation,
};