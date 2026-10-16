import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'

/**
 * F5.2 — ProseMirror schema shared by the document editor.
 *
 * Built on `prosemirror-schema-basic` (doc, paragraph, heading, blockquote,
 * codeBlock, horizontalRule, hardBreak, text + bold/italic/code/link marks)
 * plus list nodes (`bulletList`/`orderedList`/`listItem`) and the two extra
 * inline marks the F5.1 renderer already supports: `strike` and `underline`.
 *
 * Node/mark names intentionally match the stored JSONB contract so
 * serialization round-trips without a second content format.
 */

const strikeMark = {
  parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
  toDOM: () => ['s', 0],
}

const underlineMark = {
  parseDOM: [{ tag: 'u' }],
  toDOM: () => ['u', 0],
}

export const editorSchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: {
    link: basicSchema.spec.marks.get('link'),
    em: { parseDOM: [{ tag: 'i' }, { tag: 'em' }], toDOM: () => ['em', 0] },
    strong: { parseDOM: [{ tag: 'b' }, { tag: 'strong' }], toDOM: () => ['strong', 0] },
    strike: strikeMark,
    underline: underlineMark,
    code: basicSchema.spec.marks.get('code'),
  },
})

/** Stored camelCase contract → ProseMirror snake_case schema names. */
const NODE_ALIASES = {
  bulletList: 'bullet_list',
  orderedList: 'ordered_list',
  listItem: 'list_item',
  codeBlock: 'code_block',
  horizontalRule: 'horizontal_rule',
  hardBreak: 'hard_break',
}

/** Reverse: schema names → stored contract names (for PATCH payloads). */
const NODE_CANONICAL = {
  bullet_list: 'bulletList',
  ordered_list: 'orderedList',
  list_item: 'listItem',
  code_block: 'codeBlock',
  horizontal_rule: 'horizontalRule',
  hard_break: 'hardBreak',
}

const MARK_ALIASES = { bold: 'strong', italic: 'em' }
const MARK_CANONICAL = { strong: 'bold', em: 'italic' }

const KNOWN_SCHEMA_TOP = new Set([
  'paragraph',
  'heading',
  'bullet_list',
  'ordered_list',
  'blockquote',
  'code_block',
  'horizontal_rule',
])

/** Inline JSON nodes salvaged from an unknown/unsupported node. */
function inlineNodesFromRaw(node) {
  if (!node || typeof node !== 'object') return []
  if (node.type === 'text') {
    const text = typeof node.text === 'string' ? node.text : ''
    if (!text) return []
    const parts = text.split('\n')
    const out = []
    parts.forEach((part, i) => {
      if (i > 0) out.push({ type: 'hard_break' })
      if (part) out.push({ type: 'text', text: part })
    })
    return out
  }
  if (node.type === 'hardBreak' || node.type === 'hard_break') return [{ type: 'hard_break' }]
  if (!Array.isArray(node.content)) return []
  return node.content.flatMap(inlineNodesFromRaw)
}

/** Recursively map stored node/mark names to schema names. */
function toSchemaNode(node) {
  if (!node || typeof node !== 'object') return null
  const mapped = { ...node, type: NODE_ALIASES[node.type] ?? node.type }
  if (mapped.type === 'text' && typeof mapped.text === 'string' && mapped.text.includes('\n')) {
    return null // handled by caller via inlineNodesFromRaw
  }
  if (Array.isArray(node.marks)) {
    mapped.marks = node.marks
      .map((m) => (m && typeof m === 'object' ? { ...m, type: MARK_ALIASES[m.type] ?? m.type } : m))
      .filter((m) => m && editorSchema.marks[m.type])
  }
  if (Array.isArray(node.content)) {
    const children = []
    for (const child of node.content) {
      if (child?.type === 'text' && typeof child.text === 'string' && child.text.includes('\n')) {
        children.push(...inlineNodesFromRaw(child).map((n) => ({ ...n })))
        continue
      }
      const mapped_child = toSchemaNode(child)
      if (mapped_child) children.push(mapped_child)
      else children.push(...inlineNodesFromRaw(child))
    }
    mapped.content = children
  }
  return mapped
}

/** Recursively map schema JSON back to the stored contract names. */
export function toStoredContent(schemaJson) {
  if (!schemaJson || typeof schemaJson !== 'object') return schemaJson
  const mapNode = (node) => {
    if (!node || typeof node !== 'object') return node
    const out = { ...node, type: NODE_CANONICAL[node.type] ?? node.type }
    // ProseMirror serializes em/strong; stored contract uses italic/bold.
    if (Array.isArray(node.marks)) {
      out.marks = node.marks.map((m) =>
        m && typeof m === 'object' ? { ...m, type: MARK_CANONICAL[m.type] ?? m.type } : m,
      )
    }
    if (Array.isArray(node.content)) out.content = node.content.map(mapNode)
    return out
  }
  return mapNode(schemaJson)
}

/**
 * Normalize arbitrary stored `content` into a ProseMirror doc JSON this schema
 * can always parse. Known nodes pass through untouched; anything else
 * degrades to plain-text paragraphs so no readable text is lost. Never
 * throws — worst case returns an empty doc.
 */
export function normalizeStoredContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }

  const rawNodes = Array.isArray(content.content) ? content.content : []
  const normalized = []

  for (const node of rawNodes) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
      continue
    }
    const schemaType = NODE_ALIASES[node.type] ?? node.type
    if (KNOWN_SCHEMA_TOP.has(schemaType)) {
      normalized.push(toSchemaNode(node))
      continue
    }
    if (node.type === 'text') {
      const inline = inlineNodesFromRaw(node)
      if (inline.some((n) => n.type === 'text')) {
        normalized.push({ type: 'paragraph', content: inline })
      }
      continue
    }
    // Unknown container: salvage readable text as inline nodes so no
    // readable content is lost; skip containers with no text.
    const inline = inlineNodesFromRaw(node)
    const hasText = inline.some((n) => n.type === 'text')
    if (hasText) {
      normalized.push({ type: 'paragraph', content: inline })
    }
  }

  if (normalized.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
  return { type: 'doc', content: normalized }
}

/** Stable stringify: object keys sorted so dirty comparison is order-proof. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}
