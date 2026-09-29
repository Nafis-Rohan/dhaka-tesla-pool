import { useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import {
  useArrivePool,
  useCancelPool,
  useDropOffPassenger,
  useMarkNoShow,
  useStartPool,
} from '../../hooks/usePoolActions'
import { formatPaisa } from '../../lib/money'

export function CurrentPoolCard({ pool }) {
  const arrivePool = useArrivePool()
  const startPool = useStartPool()
  const cancelPool = useCancelPool()
  const dropOff = useDropOffPassenger()
  const markNoShow = useMarkNoShow()
  const [error, setError] = useState(null)

  const isBusy = [arrivePool, startPool, cancelPool, dropOff, markNoShow].some(
    (mutation) => mutation.isPending,
  )

  async function run(mutation, arg) {
    setError(null)
    try {
      await mutation.mutateAsync(arg)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-gray-900">Current trip</h1>

      <p className="text-sm text-gray-700">
        Pickup: {pool.pickupZone.name} · Seats {pool.seatsTaken}/{pool.capacity} ·{' '}
        {pool.status.replace('_', ' ')}
      </p>

      <div className="flex flex-col gap-2">
        {pool.passengers.map((passenger) => (
          <div
            key={passenger.requestId}
            className="rounded border border-gray-200 p-3 text-sm"
          >
            <div className="flex justify-between">
              <span className="text-gray-900">
                {passenger.name} → {passenger.destination.name}
              </span>
              <span className="text-gray-500">{passenger.status}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-gray-500">
              <span>
                {passenger.seats} seat{passenger.seats > 1 ? 's' : ''} ·{' '}
                {formatPaisa(passenger.fare.final ?? passenger.fare.estimatedPooled)}
              </span>
              <div className="flex gap-2">
                {passenger.status === 'STARTED' && (
                  <button
                    type="button"
                    onClick={() => run(dropOff, passenger.requestId)}
                    disabled={isBusy}
                    className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
                  >
                    Drop off
                  </button>
                )}
                {passenger.status === 'DRIVER_ARRIVED' &&
                  pool.status === 'DRIVER_ARRIVED' && (
                    <button
                      type="button"
                      onClick={() => run(markNoShow, passenger.requestId)}
                      disabled={isBusy}
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      No-show
                    </button>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <ErrorState error={error} />}

      <div className="flex gap-2">
        {pool.status === 'MATCHED' && (
          <button
            type="button"
            onClick={() => run(arrivePool)}
            disabled={isBusy}
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            I&apos;ve arrived
          </button>
        )}
        {pool.status === 'DRIVER_ARRIVED' && (
          <button
            type="button"
            onClick={() => run(startPool)}
            disabled={isBusy}
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            Start trip
          </button>
        )}
        {(pool.status === 'MATCHED' || pool.status === 'DRIVER_ARRIVED') && (
          <button
            type="button"
            onClick={() => run(cancelPool)}
            disabled={isBusy}
            className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            Cancel trip
          </button>
        )}
      </div>
    </div>
  )
}
