import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { Loading } from '../../components/Loading'
import { useRideHistory } from '../../hooks/useRideHistory'
import { formatPaisa } from '../../lib/money'

export function RideHistoryPage() {
  const { data: rides, isPending, error, refetch } = useRideHistory()

  if (isPending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (rides.length === 0) return <EmptyState message="No past rides yet" />

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold text-gray-900">Ride history</h1>

      {rides.map((ride) => (
        <div key={ride.id} className="rounded border border-gray-200 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-900">
              {ride.pickup.name} → {ride.destination.name}
            </span>
            <span className="text-gray-500">{ride.status}</span>
          </div>
          <div className="mt-1 flex justify-between text-gray-500">
            <span>{ride.seats} seat{ride.seats > 1 ? 's' : ''}</span>
            <span>
              {ride.fare.final != null ? formatPaisa(ride.fare.final) : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
