export const MIN_PASSWORD_LENGTH = 8

// Returns an error message, or null when the new password is acceptable.
export function validateNewPassword(password, confirmation) {
  if (password.length < MIN_PASSWORD_LENGTH) return `密碼長度至少 ${MIN_PASSWORD_LENGTH} 個字元`
  if (password !== confirmation) return '兩次輸入的密碼不一致'
  return null
}
