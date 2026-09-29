import { Navigate, Outlet } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { useAuth } from './AuthContext'

export function RequireAuth({ role }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />

  return <Outlet />
}
