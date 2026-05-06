export function getTucsonToday(): string {
  const now = new Date()
  const tucsonOffset = -7 * 60
  const utcMinutes = now.getTime() / 60000
  const tucsonMinutes = utcMinutes + tucsonOffset
  const tucsonDate = new Date(tucsonMinutes * 60000)
  const year = tucsonDate.getUTCFullYear()
  const month = String(tucsonDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(tucsonDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTucsonTomorrow(): string {
  const today = getTucsonToday()
  const date = new Date(today + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
