// Lo único que se guarda en el navegador es QUÉ paciente está activo.
// Los datos del paciente viven en la base de datos (SQLite vía API).
const ACTIVE_PATIENT_KEY = 'motrix_paciente_activo'

export function getActivePatientId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PATIENT_KEY)
  } catch {
    return null
  }
}

export function setActivePatientId(id: string) {
  try {
    localStorage.setItem(ACTIVE_PATIENT_KEY, id)
  } catch (error) {
    console.error('No se pudo recordar el paciente activo:', error)
  }
}
