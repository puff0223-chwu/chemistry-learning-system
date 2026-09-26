import katex from 'katex'
import DOMPurify from 'dompurify'

const HTML_TAG = /<\/?[a-z][^>]*>/i
const MATH = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Questions written before the rich editor are plain text; keep showing them as-is.
export function toDisplayHtml(value) {
  const text = value ?? ''
  if (HTML_TAG.test(text)) return text
  return escapeHtml(text).replace(/\n/g, '<br>')
}

function mathElement(latex, displayMode) {
  const span = document.createElement('span')
  span.className = displayMode ? 'math-display' : 'math-inline'
  span.innerHTML = katex.renderToString(latex, { displayMode, throwOnError: false })
  return span
}

// Sanitizes stored HTML and renders $...$ / $$...$$ with KaTeX.
export function renderRich(value) {
  const clean = DOMPurify.sanitize(toDisplayHtml(value))
  const template = document.createElement('template')
  template.innerHTML = clean

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const targets = []
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.includes('$')) targets.push(walker.currentNode)
  }

  for (const node of targets) {
    const text = node.nodeValue
    const fragment = document.createDocumentFragment()
    let last = 0
    let found = false
    for (const match of text.matchAll(MATH)) {
      found = true
      if (match.index > last) fragment.append(text.slice(last, match.index))
      const isDisplay = match[1] !== undefined
      fragment.append(mathElement((match[1] ?? match[2]).trim(), isDisplay))
      last = match.index + match[0].length
    }
    if (!found) continue
    if (last < text.length) fragment.append(text.slice(last))
    node.replaceWith(fragment)
  }
  return template.innerHTML
}

// Plain-text summary of stored content (for lists, exports and search snippets).
export function htmlToText(value) {
  const html = toDisplayHtml(value)
  const template = document.createElement('template')
  template.innerHTML = DOMPurify.sanitize(html)
  template.content.querySelectorAll('img').forEach((img) => img.replaceWith('[圖片]'))
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
