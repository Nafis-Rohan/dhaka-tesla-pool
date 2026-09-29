import { Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'

function HomePage() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">
        Welcome, {user.name}
      </h1>
      <button
        type="button"
        onClick={logout}
        className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
      >
        Log out
      </button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
      </Route>
    </Routes>
  )
}

export default App
