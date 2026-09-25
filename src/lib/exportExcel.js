// SheetJS is loaded on demand so it doesn't weigh down the student-facing pages.
export async function exportXlsx(filename, sheetName, rows) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows)
  const keys = Object.keys(rows[0] ?? {})
  sheet['!cols'] = keys.map((key) => ({
    wch: Math.min(40, Math.max(key.length * 2, ...rows.map((r) => String(r[key] ?? '').length * 1.6)) + 2),
  }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  XLSX.writeFile(book, filename)
}

export function todayStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}
