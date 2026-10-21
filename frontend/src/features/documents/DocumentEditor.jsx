import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { history, undo, redo } from 'prosemirror-history'
import { baseKeymap } from 'prosemirror-commands'
import { wrapIn, setBlockType, toggleMark, lift, exitCode, splitBlockAs, splitBlockKeepMarks, liftEmptyBlock, newlineInCode } from 'prosemirror-commands'
import { wrapInList, sinkListItem, liftListItem, splitListItem } from 'prosemirror-schema-list'
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules'
import { documentsApi } from './documents.api.js'
import { ApiError } from '../../lib/api/errors.js'
import SharePanel from '../authorization/SharePanel.jsx'
import { editorSchema, normalizeStoredContent, stableStringify, toStoredContent } from './prosemirrorSchema.js'

const TITLE_MAX = 255

function buildInputRules(schema) {
  const rules = [...smartQuotes.concat(emDash, ellipsis)]
  rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote))
  rules.push(wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list))
  rules.push(wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (m) => ({ order: Number(m[1]) })))
  rules.push(textblockTypeInputRule(/^```$/, schema.nodes.code_block))
  for (let level = 1; level <= 6; level += 1) {
    const re = new RegExp(`^(#{1,${level}})\\s$`)
    rules.push(textblockTypeInputRule(re, schema.nodes.heading, () => ({ level })))
  }
  return inputRules({ rules })
}

function splitHeading(state, dispatch, view) {
  const { $head, $anchor } = state.selection
  if (!$head.sameParent($anchor)) return false
  if ($head.parent.type.name !== 'heading') return false
  const text = $head.parent.textContent || ''
  const offset = $head.pos - $head.start()
  const before = text.slice(0, offset)
  // Non-empty heading: split into new heading of same level (preserve formatting)
  if (before.trim().length > 0) {
    const level = $head.parent.attrs.level || 2
    const splitNode = () => ({ type: editorSchema.nodes.heading, attrs: { level } })
    // Use splitBlockAs (imported at the top of this ESM module) to force a
    // heading node of the same level for the new block; preserves inline marks.
    return splitBlockAs(splitNode)(state, dispatch, view)
  }
  // Empty heading: let base chain handle exit to paragraph (standard behavior)
  return false
}

export function enterInEditor(state, dispatch, view) {
  // Code block: Enter must insert a newline inside the block (even when the
  // block is empty). This custom Enter binding shadows baseKeymap's Enter
  // chain (`newlineInCode`, `createParagraphNear`, `liftEmptyBlock`,
  // `splitBlock`), so `newlineInCode` has to run first here — otherwise the
  // generic split below would exit the code block after a single line.
  // `Mod-Enter: exitCode` remains the explicit way out of a code block.
  if (newlineInCode(state, dispatch, view)) return true
  // Heading non-empty: keep heading level
  if (splitHeading(state, dispatch, view)) return true
  // Otherwise standard list/paragraph/code behavior
  if (splitListItem(editorSchema.nodes.list_item)(state, dispatch, view)) return true
  const { $head, $anchor } = state.selection
  // Empty list item that splitListItem could not split (e.g. the final item of
  // a list nested in a blockquote): lift the empty block out of the list so
  // pressing Enter exits the list instead of staying trapped in it.
  if ($head.node(-1) && $head.node(-1).type.name === 'list_item' && $head.parent.content.size === 0) {
    if (liftEmptyBlock(state, dispatch, view)) return true
  }
  // Empty paragraph directly inside a blockquote: lift it out of the quote so
  // pressing Enter exits the blockquote instead of splitting the empty paragraph
  // inside it. NOTE: `liftEmptyBlock` alone is NOT enough here: for an empty
  // textblock that is NOT the last child of its parent it first *splits* the
  // parent (line 383-390 of prosemirror-commands), which would just duplicate
  // the empty paragraph inside the quote. Use `lift` (unconditional blockRange
  // lift) so Enter reliably moves the empty paragraph out after the quote.
  if ($head.node(-1) && $head.node(-1).type.name === 'blockquote' && $head.parent.type.name === 'paragraph' && $head.parent.content.size === 0) {
    if (lift(state, dispatch, view)) return true
    if (liftEmptyBlock(state, dispatch, view)) return true
  }
  if ($head.parent.type.spec.code && $head.sameParent($anchor)) {
    const text = $head.parent.textContent || ''
    const offset = $head.pos - $head.start()
    const before = text.slice(0, offset)
    const lastNL = before.lastIndexOf('\n')
    const lineStart = lastNL >= 0 ? lastNL + 1 : 0
    const lineContent = text.slice(lineStart, offset)
    if (lineContent.trim() === '' && (lastNL >= 0 || offset > 0)) {
      return exitCode(state, dispatch, view)
    }
  }
  return splitBlockKeepMarks(state, dispatch, view)
}

function runCommand(viewRef, command) {
  const view = viewRef.current
  if (!view) return
  view.focus()
  command(view.state, view.dispatch, view)
}

/**
 * DocumentEditor (F5.2) — ProseMirror editing + explicit PATCH save.
 * Backend is the authority; GET exposes no editability signal so the
 * workspace is presented editable and PATCH 403 is handled honestly.
 */
function DocumentEditor({ document }) {
  const baseTitle = typeof document?.title === 'string' ? document.title : ''
  const baseContent = useMemo(
    () => normalizeStoredContent(document?.content),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document?.id],
  )
  const baseFingerprint = useMemo(
    () => stableStringify({ title: baseTitle, content: baseContent }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document?.id],
  )
  const initialDocNode = useMemo(() => editorSchema.nodeFromJSON(baseContent), [baseContent])

  const [title, setTitle] = useState(baseTitle)
  const [contentJson, setContentJson] = useState(baseContent)
  const [savedFingerprint, setSavedFingerprint] = useState(baseFingerprint)
  const [titleError, setTitleError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const access = document?.access
  const accessPermission = access?.permission
  const isOwner = accessPermission === 'OWNER'
  const isEditor = accessPermission === 'EDITOR'
  const isEditable = isOwner || isEditor

  const [forbidden, setForbidden] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const mountRef = useRef(null)
  const viewRef = useRef(null)
  const [toolbarState, setToolbarState] = useState({ marks: {}, block: null, blockHasAttr: null })
  const titleRef = useRef(title)
  titleRef.current = title
  const contentRef = useRef(contentJson)
  contentRef.current = contentJson

  const deriveBlock = ($from) => {
    // Inspect from deepest block outward. Containers (list/quote/heading/code)
    // take precedence over an inner paragraph so the toolbar reflects the real
    // surrounding structure (a paragraph inside a blockquote is still "quote").
    // Paragraph is only used as a fallback when no container wraps the cursor.
    let paragraphFallback = null
    for (let d = $from.depth; d >= 1; d--) {
      const node = $from.node(d)
      const name = node.type.name
      if (name === 'bullet_list' || name === 'ordered_list') return { block: name, attr: null }
      if (name === 'blockquote') return { block: 'blockquote', attr: null }
      if (name === 'code_block') return { block: 'code_block', attr: null }
      if (name === 'heading') return { block: 'heading', attr: node.attrs.level || 2 }
      if (name === 'paragraph' && paragraphFallback === null) {
        paragraphFallback = { block: 'paragraph', attr: null }
      }
    }
    return paragraphFallback || { block: 'paragraph', attr: null }
  }

  const deriveState = (state) => {
    const sel = state.selection
    const hasMark = (type) => {
      if (sel.empty) {
        const stored = state.storedMarks || sel.$from.marks()
        return !!(stored && stored.some((m) => m.type.name === type))
      }
      let all = true, some = false
      sel.ranges.forEach((r) => {
        state.doc.nodesBetween(r.$from.pos, r.$to.pos, (node) => {
          if (node.isText && node.marks) {
            const has = node.marks.some((m) => m.type.name === type)
            if (has) some = true
            else all = false
          }
        })
      })
      return all ? true : (some ? 'mixed' : false)
    }
    const $from = sel.$from
    const blockInfo = deriveBlock($from)
    return {
      marks: {
        strong: hasMark('strong') === true,
        em: hasMark('em') === true,
        strike: hasMark('strike') === true,
        underline: hasMark('underline') === true,
        code: hasMark('code') === true,
      },
      block: blockInfo.block,
      blockHasAttr: blockInfo.attr,
    }
  }

  useEffect(() => {
    if (!mountRef.current) return undefined
    const state = EditorState.create({
      doc: initialDocNode,
      plugins: [
        buildInputRules(editorSchema),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
          Enter: enterInEditor,
          'Mod-Enter': exitCode,
          Tab: sinkListItem(editorSchema.nodes.list_item),
          'Shift-Tab': liftListItem(editorSchema.nodes.list_item),
        }),
        keymap(baseKeymap),
        history(),
      ],
    })
    const view = new EditorView(mountRef.current, {
      state,
      editable: () => isEditable,
      dispatchTransaction(tr) {
        const next = view.state.apply(tr)
        view.updateState(next)
        if (tr.docChanged) {
          setContentJson(toStoredContent(next.doc.toJSON()))
        }
        // Live toolbar state update on every transaction (typing, selection, undo)
        setToolbarState(deriveState(next))
      },
    })
    const init = deriveState(view.state)
    setToolbarState({ marks: init.marks, block: init.block, blockHasAttr: init.blockHasAttr })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [initialDocNode, document?.id, isEditable])

  const fingerprint = stableStringify({ title, content: contentJson })
  const isDirty = fingerprint !== savedFingerprint

  useEffect(() => {
    if (!isDirty) return undefined
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const describeFailure = (err) => {
    if (err instanceof ApiError) {
      if (err.status === 0) return 'Could not reach the server. Your edits are intact — try Save again.'
      if (err.status === 400) {
        const d = err.details && typeof err.details === 'object' ? err.details : null
        const extra = d ? [d.title, d.content].filter(Boolean).join(' ') : ''
        return `The server rejected this save.${extra ? ` ${extra}` : ''} Your edits are intact.`
      }
      if (err.status === 401) return 'Your session expired. Your edits are intact — sign in again, then retry Save.'
      if (err.status === 403) {
        setForbidden(true)
        return 'You do not have permission to save this document. Your edits are intact.'
      }
      if (err.status === 404) return 'This document is no longer available. Your edits are intact.'
      return 'Could not save this document. Your edits are intact — try again.'
    }

  }

  const handleSave = async () => {
    if (isSaving) return
    setSaveError('')
    const trimmed = title.trim()
    if (trimmed.length === 0) {
      setTitleError('Title is required.')
      return
    }
    if (trimmed.length > TITLE_MAX) {
      setTitleError('Title must be 255 characters or fewer.')
      return
    }
    const payload = { title, content: contentRef.current }
    setIsSaving(true)
    try {
      const res = await documentsApi.updateDocument(document.id, payload)
      const saved = res?.document ?? null
      const sTitle = typeof saved?.title === 'string' ? saved.title : payload.title
      const sContent = saved?.content && typeof saved.content === 'object' && !Array.isArray(saved.content) ? saved.content : payload.content
      setSavedFingerprint(stableStringify({ title: sTitle, content: sContent }))
    } catch (err) {
      setSaveError(describeFailure(err))
    } finally {
      setIsSaving(false)
    }
  }

  const marks = editorSchema.marks
  const nodes = editorSchema.nodes
  const groups = [
    ['Text formatting', [
      ['Bold', () => runCommand(viewRef, toggleMark(marks.strong))],
      ['Italic', () => runCommand(viewRef, toggleMark(marks.em))],
      ['Strike', () => runCommand(viewRef, toggleMark(marks.strike))],
      ['Underline', () => runCommand(viewRef, toggleMark(marks.underline))],
    ]],
    ['Code', [
      ['Code', () => runCommand(viewRef, toggleMark(marks.code))],
      ['Code block', () => runCommand(viewRef, setBlockType(nodes.code_block))],
    ]],
    ['Blocks / headings', [
      ['Paragraph', () => runCommand(viewRef, setBlockType(nodes.paragraph))],
      ['Heading', () => runCommand(viewRef, setBlockType(nodes.heading, { level: 2 }))],
      ['Quote', () => runCommand(viewRef, wrapIn(nodes.blockquote))],
    ]],
    ['Lists', [
      ['Bullets', () => runCommand(viewRef, wrapInList(nodes.bullet_list))],
      ['Numbered', () => runCommand(viewRef, wrapInList(nodes.ordered_list))],
    ]],
    ['Structure', [
      ['Lift', () => runCommand(viewRef, lift)],
    ]],
  ]

  return (
    <section className="document-editor" aria-label="Document editor">
      <div className="document-editor-header">
      <div className="document-editor-header-top">
        <Link
          to="/documents"
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.6rem', fontSize: '0.875rem', textDecoration: 'none' }}
        >
          ← Documents
        </Link>
    </div>
        <label className="document-title-field">
        <span className="document-title-label">Title</span>
        <input
          id="document-title"
          name="documentTitle"
          className="document-title-input"
          type="text"
          value={title}
          maxLength={TITLE_MAX + 20}
          readOnly={!isEditable}
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleError('')
          }}
          aria-invalid={titleError ? 'true' : undefined}
          aria-describedby={titleError ? 'document-title-error' : undefined}
        />
      </label>
      {titleError ? (
        <p id="document-title-error" className="document-field-error" role="alert">
          {titleError}
        </p>
      ) : null}
      <div className="document-savebar" role="status" aria-live="polite">
        <span className={isDirty ? 'document-dirty' : 'document-clean'}>
          {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <div className="document-savebar-actions">
          {isOwner && (
            <button
              type="button"
              className="btn btn-secondary document-share-trigger"
              onClick={() => setShareOpen(true)}
              aria-label="Share document"
            >
              Share
            </button>
          )}
          {isEditable && (
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving || !isDirty}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
      {saveError ? (
        <p className="document-save-error" role="alert">
          {saveError}
        </p>
      ) : null}
      {forbidden ? <p className="document-save-hint">Read access does not imply save access — the server decides.</p> : null}
      {isEditable && (
        <div className="document-toolbar" role="toolbar" aria-label="Formatting">
          {groups.map(([sectionLabel, items]) => (
            <div key={sectionLabel} className="document-toolbar-section">
              <span className="document-toolbar-section-label">{sectionLabel}</span>
              {items.map(([toolLabel, fn]) => {
                let active = false; let ariaPressed = 'false'
                if (toolLabel === 'Bold') { active = toolbarState.marks.strong === true; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Italic') { active = toolbarState.marks.em === true; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Strike') { active = toolbarState.marks.strike === true; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Underline') { active = toolbarState.marks.underline === true; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Code') { active = toolbarState.marks.code === true; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Paragraph') { active = toolbarState.block === 'paragraph'; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Heading') { active = toolbarState.block === 'heading'; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Bullets') { active = toolbarState.block === 'bullet_list'; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Numbered') { active = toolbarState.block === 'ordered_list'; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Quote') { active = toolbarState.block === 'blockquote'; ariaPressed = active ? 'true' : 'false' }
                else if (toolLabel === 'Code block') { active = toolbarState.block === 'code_block'; ariaPressed = active ? 'true' : 'false' }
                const cls = active ? 'document-toolbar-button document-toolbar-button-active' : 'document-toolbar-button'
                return (
                  <button key={toolLabel} type="button" className={cls}
                    onPointerDown={(e) => { e.preventDefault() }}
                    onClick={fn} aria-pressed={ariaPressed} aria-label={toolLabel}>
                    {toolLabel}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
      </div>
      <div ref={mountRef} className="document-editor-content document-editor-editable" aria-label="Document content" />
      {shareOpen && (
        <SharePanel document={document} onClose={() => setShareOpen(false)} />
      )}
    </section>
  )
}

export default DocumentEditor
