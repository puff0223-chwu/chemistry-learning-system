import { useMemo } from 'react'
import 'katex/dist/katex.min.css'
import { renderRich } from '../lib/richText.js'

// Student-facing display of editor content. Styles are scoped under .rich-content (see index.css).
export default function RichContent({ html, className = '', as: Tag = 'div', ref, style }) {
  const rendered = useMemo(() => renderRich(html), [html])
  return <Tag ref={ref} style={style} className={`rich-content ${className}`} dangerouslySetInnerHTML={{ __html: rendered }} />
}
