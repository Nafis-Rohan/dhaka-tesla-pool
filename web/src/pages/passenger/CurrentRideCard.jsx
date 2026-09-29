import { useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { useCancelRide } from '../../hooks/useRideMutations'
import { formatPaisa } from '../../lib/money'

const STEPS = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED']
// Matches rules.md B7: passenger can cancel up to DRIVER_ARRIVED, not once STARTED.
const CANCELLABLE = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED']

export function CurrentRideCard({ ride }) {
  const cancelRide = useCancelRide()
  const [error, setError] = useState(null)

  const stepIndex = STEPS.indexOf(ride.status)
  const isTerminal = ride.status === 'CANCELLED' || ride.status === 'EXPIRED'

  // Final fare is locked only once the trip starts; until then, show the best current guess:
  // pooled if someone has already joined, solo otherwise.
  const displayFare =
    ride.fare.final ??
    (ride.coPassengerCount > 0 ? ride.fare.estimatedPooled : ride.fare.estimatedSolo)

  async function handleCancel() {
    setError(null)
    try {
      await cancelRide.mutateAsync(ride.id)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-gray-900">Your ride</h1>

      <p className="text-sm text-gray-700">
        {ride.pickup.name} → {ride.destination.name} · {ride.seats} seat
        {ride.seats > 1 ? 's' : ''}
      </p>

      {isTerminal ? (
        <p className="text-sm text-red-600">
          This ride was {ride.status.toLowerCase()}.
        </p>
      ) : (
        <ol className="flex justify-between text-[11px] text-gray-500">
          {STEPS.map((step, i) => (
            <li key={step} className={i <= stepIndex ? 'font-medium text-gray-900' : ''}>
              {step.replace('_', ' ')}
            </li>
          ))}
        </ol>
      )}

      {ride.coPassengerCount > 0 && (
        <p className="text-sm text-gray-500">
          Sharing with {ride.coPassengerCount} other passenger
          {ride.coPassengerCount > 1 ? 's' : ''}
        </p>
      )}

      <div className="flex justify-between rounded border border-gray-200 p-3 text-sm font-medium text-gray-900">
        <span>Your fare{ride.fare.final == null ? ' (estimated)' : ''}</span>
        <span>{formatPaisa(displayFare)}</span>
      </div>

      {error && <ErrorState error={error} />}

      {CANCELLABLE.includes(ride.status) && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelRide.isPending}
          className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
        >
          {cancelRide.isPending ? 'Cancelling…' : 'Cancel ride'}
        </button>
      )}
    </div>
  )
}
