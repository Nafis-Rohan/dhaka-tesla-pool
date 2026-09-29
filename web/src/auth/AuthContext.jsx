import { createContext, use, useEffect, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // On first load, a token may already be in localStorage from a previous
  // session. Ask the API who it belongs to before treating anyone as logged in.
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setIsLoading(false)
      return
    }

    api
      .get('/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setIsLoading(false))
  }, [])

  async function login(phone, password) {
    const { data } = await api.post('/auth/login', { phone, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  async function register(name, phone, password) {
    const { data } = await api.post('/auth/register', { name, phone, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext
      value={{ user, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext>
  )
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
