import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorState } from '../components/ErrorState'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await register(name, phone, password)
      navigate('/')
    } catch (err) {
      setError(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-3 rounded border border-gray-200 p-6"
      >
        <h1 className="text-xl font-semibold text-gray-900">
          Create an account
        </h1>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="tel"
          placeholder="01XXXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        {error && <ErrorState error={error} />}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating account…' : 'Register'}
        </button>
        <p className="text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-gray-900 underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  )
}
