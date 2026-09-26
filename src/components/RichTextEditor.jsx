import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Image from '@tiptap/extension-image'
import { MathNode } from '../lib/mathNode.js'
import { IMAGE_BUCKET, uploadImage } from '../lib/storage.js'
import MathDialog from './MathDialog.jsx'

// Font sizes are relative (em) so the battle screen's auto-fit can still shrink them with the text around them.
const SIZES = [
  { key: 'small', label: '小', value: '0.8em' },
  { key: 'normal', label: '正', value: '' },
  { key: 'large', label: '大', value: '1.35em' },
]

const imageFiles = (list) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

function ToolButton({ active, onClick, title, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-8 h-8 px-2 rounded-md text-sm border ${
        active ? 'bg-cyan text-white border-cyan' : 'bg-white text-navy border-slate-300 hover:bg-slate-100'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ value, onChange, minHeight = 96 }) {
  const [uploading, setUploading] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [mathDialog, setMathDialog] = useState(null) // { pos, latex, display }
  const fileInput = useRef(null)
  const editorRef = useRef(null)

  async function uploadAndInsert(files, pos = null) {
    for (const file of files) {
      setUploading((n) => n + 1)
      setUploadError('')
      try {
        const url = await uploadImage(IMAGE_BUCKET, file)
        const chain = editorRef.current?.chain().focus()
        if (!chain) continue
        if (pos !== null) chain.insertContentAt(pos, { type: 'image', attrs: { src: url } })
        else chain.setImage({ src: url })
        chain.run()
      } catch (err) {
        console.error('[editor] 圖片上傳失敗：', err)
        setUploadError('圖片上傳失敗')
        setTimeout(() => setUploadError(''), 5000)
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        strike: false,
        link: false,
      }),
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ['paragraph'] }),
      Subscript,
      Superscript,
      Image.configure({ inline: true, allowBase64: false }),
      MathNode.configure({ onEdit: (info) => setMathDialog(info) }),
    ],
    content: value || '',
    editorProps: {
      attributes: { class: 'rte-content', style: `min-height:${minHeight}px` },
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData?.files)
        if (!files.length) return false
        event.preventDefault()
        uploadAndInsert(files)
        return true
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false
        const files = imageFiles(event.dataTransfer?.files)
        if (!files.length) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        uploadAndInsert(files, coords?.pos ?? null)
        return true
      },
    },
    onUpdate: ({ editor: updated }) => {
      onChange(updated.isEmpty ? '' : updated.getHTML())
    },
  })

  // Uploads finish asynchronously, so they insert through this ref. It must track the live editor
  // (StrictMode creates and discards one), not whichever instance fired onCreate first.
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null
      const style = e.getAttributes('textStyle')
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        sub: e.isActive('subscript'),
        sup: e.isActive('superscript'),
        color: style.color ?? '',
        size: style.fontSize ?? '',
        align: ['left', 'center', 'right'].find((a) => e.isActive({ textAlign: a })) ?? 'left',
      }
    },
  })

  if (!editor || !state) return null

  const run = (fn) => () => fn(editor.chain().focus()).run()

  function handleMathInsert(latex, display) {
    if (mathDialog?.pos !== null && mathDialog?.pos !== undefined) {
      const { pos } = mathDialog
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { latex, display })
          return true
        })
        .run()
    } else {
      editor.chain().focus().insertContent({ type: 'math', attrs: { latex, display } }).run()
    }
    setMathDialog(null)
  }

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-100 border-b border-slate-300">
        <ToolButton title="粗體" active={state.bold} onClick={run((c) => c.toggleBold())}>
          <b>B</b>
        </ToolButton>
        <ToolButton title="斜體" active={state.italic} onClick={run((c) => c.toggleItalic())}>
          <i>I</i>
        </ToolButton>

        <label
          title="文字顏色"
          className="min-w-8 h-8 px-2 rounded-md text-sm border border-slate-300 bg-white flex items-center gap-1 cursor-pointer"
        >
          A🎨
          <input
            type="color"
            value={state.color || '#ffffff'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
          />
        </label>
        <ToolButton title="清除文字顏色" onClick={run((c) => c.unsetColor())}>
          ↺
        </ToolButton>

        <span className="w-px h-6 bg-slate-300 mx-1" />
        {SIZES.map((s) => (
          <ToolButton
            key={s.key}
            title={`字體大小：${s.label}`}
            active={state.size === s.value}
            onClick={run((c) => (s.value ? c.setFontSize(s.value) : c.unsetFontSize()))}
          >
            {s.label}
          </ToolButton>
        ))}

        <span className="w-px h-6 bg-slate-300 mx-1" />
        {[
          ['left', '≡左'],
          ['center', '≡中'],
          ['right', '≡右'],
        ].map(([align, label]) => (
          <ToolButton
            key={align}
            title={`靠${label.slice(1)}對齊`}
            active={state.align === align}
            onClick={run((c) => c.setTextAlign(align))}
          >
            {label}
          </ToolButton>
        ))}

        <span className="w-px h-6 bg-slate-300 mx-1" />
        <ToolButton title="下標" active={state.sub} onClick={run((c) => c.toggleSubscript())}>
          X₂
        </ToolButton>
        <ToolButton title="上標" active={state.sup} onClick={run((c) => c.toggleSuperscript())}>
          X²
        </ToolButton>

        <span className="w-px h-6 bg-slate-300 mx-1" />
        <ToolButton title="插入圖片（也可直接貼上或拖曳）" onClick={() => fileInput.current?.click()}>
          🖼️
        </ToolButton>
        <ToolButton title="插入數學式" onClick={() => setMathDialog({ pos: null, latex: '', display: false })}>
          ∑
        </ToolButton>

        {uploading > 0 && <span className="ml-2 text-xs text-slate-500">圖片上傳中…</span>}
        {uploadError && <span className="ml-2 text-xs text-red-600">{uploadError}</span>}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            uploadAndInsert(imageFiles(e.target.files))
            e.target.value = ''
          }}
        />
      </div>

      <EditorContent editor={editor} className="rte-surface" />

      {mathDialog && (
        <MathDialog
          initialLatex={mathDialog.latex}
          initialDisplay={mathDialog.display}
          onInsert={handleMathInsert}
          onCancel={() => setMathDialog(null)}
        />
      )}
    </div>
  )
}
