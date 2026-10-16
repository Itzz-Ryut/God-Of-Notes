import React from 'react'

/**
 * F5.1 — Read-only renderer for the document-editor content surface.
 *
 * The backend `documents.content` column is generic JSONB (see
 * databases/migrations/006_create_documents.sql — the schema does not enforce
 * a rich-text structure). The only content shape actually stored today is the
 * ProseMirror document format (see databases/seed/013_seed_test_data.sql):
 *
 *   { "type": "doc",
 *     "content": [{ "type": "paragraph",
 *                   "content": [{ "type": "text", "text": "..." }] }] }
 *
 * F5.1 establishes the editor FOUNDATION only — it does NOT implement editing
 * or persistence (that is F5.2+). So instead of pulling in an editor library
 * that would be unused until F5.2, this module maps the recognised ProseMirror
 * node types to read-only DOM so stored content is readable, preserving the
 * backend content contract exactly. Any other shape degrades safely: unknown
 * nodes are skipped, text inside unrecognised nodes is preserved, and empty
 * documents are represented by the caller as an empty state.
 *
 * A real rich-text editor (F5.2) can reuse this same ProseMirror serialization
 * unchanged — nothing here invents, transforms, or persists content.
 */

const INLINE_MARK_TAGS = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  underline: 'u',
  code: 'code',
}

const COLLAPSIBLE_INLINE_MARKS = new Set(['code'])

/** Wrap a text node's value with text marks, innermost first. The outermost
 * wrapping element is given a stable `key` because marked text nodes can be
 * array children (in a paragraph/heading) and React requires keys there. */
function applyTextMarks(node, key) {
  const text = typeof node.text === 'string' ? node.text : ''
  const marks = Array.isArray(node.marks) ? node.marks : []

  let element = text
  for (const mark of marks) {
    const tag = mark && INLINE_MARK_TAGS[mark.type]
    if (tag) {
      element = React.createElement(
        tag,
        COLLAPSIBLE_INLINE_MARKS.has(mark.type)
          ? { className: 'document-inline-code' }
          : null,
        element,
      )
    }
  }

  // Plain text with no marks is a string (React never key-warns on strings).
  if (typeof element === 'string') return element
  return React.cloneElement(element, { key })
}

/**
 * Render a single ProseMirror-style node to read-only DOM.
 * Returns a React element, a plain string (text), or null (skip).
 */
function renderNode(node, key = 0) {
  if (!node || typeof node !== 'object') return null

  const type = node.type
  const attrs = node.attrs && typeof node.attrs === 'object' ? node.attrs : null
  const children = (Array.isArray(node.content) ? node.content : []).map(
    (child, index) => renderNode(child, index),
  )

  switch (type) {
    case 'text':
      return applyTextMarks(node)

    case 'paragraph':
      return React.createElement('p', { key }, children)

    case 'heading': {
      const level =
        attrs && /^[1-6]$/.test(String(attrs.level)) ? Number(attrs.level) : 2
      return React.createElement(`h${level}`, { key }, children)
    }

    case 'bulletList':
      return React.createElement('ul', { key }, children)

    case 'orderedList':
      return React.createElement('ol', { key }, children)

    case 'listItem':
      return React.createElement('li', { key }, children)

    case 'blockquote':
      return React.createElement('blockquote', { key }, children)

    case 'codeBlock':
      return React.createElement('pre', { key }, children)

    case 'hardBreak':
      return React.createElement('br', { key: `${key}-break` })

    case 'horizontalRule':
      return React.createElement('hr', { key })

    default: {
      // Unknown node: keep any contained text readable, skip empty containers.
      const meaningful = children.filter(
        (child) => child !== null && child !== '',
      )
      if (meaningful.length > 0) {
        return React.createElement('div', { key }, meaningful)
      }
      return null
    }
  }
}

/**
 * Render a stored document `content` value to read-only DOM.
 *
 * Returns an array of React elements to place inside the editor content
 * surface, or `null` when the document has no renderable content (including
 * `{}` — the minimal content sent at creation — and non-object values).
 */
export function renderDocumentContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return null
  }

  const nodes = Array.isArray(content.content) ? content.content : []
  const rendered = nodes
    .map((node, index) => renderNode(node, index))
    .filter((child) => child !== null && child !== '')

  return rendered.length > 0 ? rendered : null
}