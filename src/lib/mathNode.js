import { Node } from '@tiptap/core'
import katex from 'katex'

// Inline math node. It is stored as <span data-latex="...">$...$</span> (or $$...$$ for display math):
// the data attributes let the editor restore the node, and the $-delimited text is what the student
// side renders with KaTeX.
export const MathNode = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onEdit: null }
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') ?? '',
        renderHTML: () => ({}),
      },
      display: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-display') === 'true',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-latex]' }]
  },

  renderHTML({ node }) {
    const { latex, display } = node.attrs
    const mark = display ? '$$' : '$'
    return ['span', { 'data-latex': latex, 'data-display': String(display) }, `${mark}${latex}${mark}`]
  },

  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('span')
      dom.className = 'math-node'
      dom.contentEditable = 'false'
      dom.title = '連按兩下可編輯數學式'
      try {
        dom.innerHTML = katex.renderToString(node.attrs.latex, { displayMode: node.attrs.display, throwOnError: false })
      } catch {
        dom.textContent = node.attrs.latex
      }
      dom.addEventListener('dblclick', () => {
        this.options.onEdit?.({ pos: getPos(), latex: node.attrs.latex, display: node.attrs.display })
      })
      return { dom }
    }
  },
})
