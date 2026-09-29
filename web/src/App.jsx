import { Link, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { Loading } from './components/Loading'
import { useActiveRide } from './hooks/useActiveRide'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { useCurrentPool } from './hooks/useCurrentPool'
import { useDriverAvailability } from './hooks/useDriverAvailability'
import { AvailabilityBar } from './pages/driver/AvailabilityBar'
import { CurrentPoolCard } from './pages/driver/CurrentPoolCard'
import { DriverHistoryPage } from './pages/driver/DriverHistoryPage'
import { RequestsFeed } from './pages/driver/RequestsFeed'
import { CurrentRideCard } from './pages/passenger/CurrentRideCard'
import { RequestRidePage } from './pages/passenger/RequestRidePage'
import { RideHistoryPage } from './pages/passenger/RideHistoryPage'

function PassengerHome() {
  const { data: activeRide, isPending } = useActiveRide()

  if (isPending) return <Loading />
  return activeRide ? <CurrentRideCard ride={activeRide} /> : <RequestRidePage />
}

function DriverHome() {
  const { data: availability } = useDriverAvailability()
  const { data: pool, isPending } = useCurrentPool()

  return (
    <div className="flex flex-1 flex-col">
      <AvailabilityBar />
      {!isPending && pool && <CurrentPoolCard pool={pool} />}
      {availability?.isOnline && <RequestsFeed />}
    </div>
  )
}

function HomePage() {
  const { user } = useAuth()
  return user.role === 'PASSENGER' ? <PassengerHome /> : <DriverHome />
}

function HistoryPage() {
  const { user } = useAuth()
  return user.role === 'PASSENGER' ? <RideHistoryPage /> : <DriverHistoryPage />
}

// Temporary shell for Phase 10: a logout bar + nav above whichever page fits the role.
// Replaced by real passenger/driver layouts once both flows exist.
function AppLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Hi, {user.name}</span>
          <nav className="flex gap-3 text-sm text-gray-700">
            <Link to="/" className="hover:underline">
              Home
            </Link>
            <Link to="/history" className="hover:underline">
              History
            </Link>
          </nav>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700"
        >
          Log out
        </button>
      </header>
      <Outlet />
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
