import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LandingPage } from './components/LandingPage'
import { LoginPage } from './components/LoginPage'
import { RegisterPage } from './components/RegisterPage'
import { RecoverPage } from './components/RecoverPage'
import { ResetPasswordPage } from './components/ResetPasswordPage'
import { PatientRegistrationPage } from './components/PatientRegistrationPage'
import { DashboardPage } from './components/DashboardPage'
import { NotFoundPage } from './components/NotFoundPage'
import './styles/style.css'
import './styles/dashboard.css'
import './styles/modules.css'
import './styles/responsive.css'
import './styles/sitio.css'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registrarse" element={<RegisterPage />} />
        <Route path="/recuperar" element={<RecoverPage />} />
        <Route path="/restablecer" element={<ResetPasswordPage />} />
        <Route path="/registro" element={<PatientRegistrationPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App