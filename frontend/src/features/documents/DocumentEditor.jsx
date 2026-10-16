import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { history, undo, redo } from 'prosemirror-history'
import { baseKeymap } from 'prosemirror-commands'
import { wrapIn, setBlockType, toggleMark, lift } from 'prosemirror-commands'
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
  const titleRef = useRef(title)
  titleRef.current = title
  const contentRef = useRef(contentJson)
  contentRef.current = contentJson

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
          Enter: splitListItem(editorSchema.nodes.list_item),
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
      },
    })
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
    return 'Could not save this document. Your edits are intact — try again.'
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
              {items.map(([toolLabel, fn]) => (
                <button key={toolLabel} type="button" className="document-toolbar-button" onClick={fn}>
                  {toolLabel}
                </button>
              ))}
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
