import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { Loading } from '../../components/Loading'
import { useDriverHistory } from '../../hooks/useDriverHistory'
import { formatPaisa } from '../../lib/money'

export function DriverHistoryPage() {
  const { data: pools, isPending, error, refetch } = useDriverHistory()

  if (isPending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (pools.length === 0) return <EmptyState message="No past trips yet" />

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold text-gray-900">Trip history</h1>

      {pools.map((pool) => (
        <div key={pool.id} className="rounded border border-gray-200 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-900">Pickup: {pool.pickupZone.name}</span>
            <span className="text-gray-500">{pool.status}</span>
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-gray-500">
            {pool.passengers.map((passenger, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {passenger.name} → {passenger.destination.name} ({passenger.status})
                </span>
                <span>{passenger.fare != null ? formatPaisa(passenger.fare) : '—'}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between font-medium text-gray-900">
            <span>Earned</span>
            <span>{formatPaisa(pool.earnedFare)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
