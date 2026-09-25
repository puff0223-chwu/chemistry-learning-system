export const PURPOSES = ['進度學習', '考試複習', '重補修']
export const GRADES = ['國中', '高一', '高二', '高三']

const STORAGE_KEY = 'chemistry_student_info'

export const EMPTY_STUDENT = { grade: '', className: '', seatNumber: '', name: '' }

// Class names: Chinese characters or digits only.
export function filterClassName(value) {
  return value.replace(/[^一-鿿0-9]/g, '')
}

export function filterSeatNumber(value) {
  return value.replace(/[^0-9]/g, '')
}

export function isStudentComplete(student) {
  return !!(student && student.grade && student.className && student.seatNumber && student.name)
}

export function getStudentInfo() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const info = JSON.parse(raw)
    // Older saved data (before purpose/grade existed) is treated as missing.
    return PURPOSES.includes(info?.purpose) && isStudentComplete(info) ? info : null
  } catch {
    return null
  }
}

export function saveStudentInfo(info) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info))
  } catch {
    // sessionStorage unavailable — proceed without persisting
  }
}

export function clearStudentInfo() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
