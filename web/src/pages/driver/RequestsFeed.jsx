import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Loading } from '../../components/Loading'
import { useAcceptRequest, useDriverRequests } from '../../hooks/useDriverRequests'
import { formatPaisa } from '../../lib/money'

export function RequestsFeed() {
  const { data, isPending, error, refetch } = useDriverRequests(true)
  const acceptRequest = useAcceptRequest()
  const [acceptError, setAcceptError] = useState(null)

  if (isPending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const { seatsLeft, requests } = data

  async function handleAccept(requestId) {
    setAcceptError(null)
    try {
      await acceptRequest.mutateAsync(requestId)
    } catch (err) {
      setAcceptError(err)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold text-gray-900">
        Nearby requests ({seatsLeft} seat{seatsLeft !== 1 ? 's' : ''} left)
      </h1>

      {acceptError && <ErrorState error={acceptError} />}

      {requests.length === 0 ? (
        <EmptyState message="No waiting requests in your zone" />
      ) : (
        requests.map((request) => (
          <div key={request.id} className="rounded border border-gray-200 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-900">
                {request.pickup.name} → {request.destination.name}
              </span>
              <span className="text-gray-500">
                {request.seats} seat{request.seats > 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-gray-500">
              <span>
                {formatPaisa(
                  request.allowPool ? request.fare.estimatedPooled : request.fare.estimatedSolo,
                )}
                {request.allowPool ? ' (shares OK)' : ' (private)'}
              </span>
              <button
                type="button"
                onClick={() => handleAccept(request.id)}
                disabled={acceptRequest.isPending}
                className="rounded bg-gray-900 px-3 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
              >
                Accept
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
