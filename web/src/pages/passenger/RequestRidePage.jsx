import { useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { Loading } from '../../components/Loading'
import { useFareEstimate } from '../../hooks/useFareEstimate'
import { useCreateRide } from '../../hooks/useRideMutations'
import { useZones } from '../../hooks/useZones'
import { formatPaisa } from '../../lib/money'

export function RequestRidePage() {
  const { data: zones, isPending, error, refetch } = useZones()
  const [pickupZoneId, setPickupZoneId] = useState('')
  const [destZoneId, setDestZoneId] = useState('')
  const [seats, setSeats] = useState(1)
  const [allowPool, setAllowPool] = useState(true)

  const fare = useFareEstimate({ pickupZoneId, destZoneId, seats })
  const createRide = useCreateRide()

  if (isPending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const isValid = pickupZoneId && destZoneId && pickupZoneId !== destZoneId && seats >= 1

  function handleSubmit(event) {
    event.preventDefault()
    if (!isValid) return
    createRide.mutate({ pickupZoneId, destZoneId, seats, allowPool })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex max-w-sm flex-col gap-4 p-6"
    >
      <h1 className="text-xl font-semibold text-gray-900">Request a ride</h1>

      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Pickup
        <select
          value={pickupZoneId}
          onChange={(e) => setPickupZoneId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">Select pickup zone</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Destination
        <select
          value={destZoneId}
          onChange={(e) => setDestZoneId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">Select destination zone</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Seats
        <input
          type="number"
          min={1}
          max={3}
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={allowPool}
          onChange={(e) => setAllowPool(e.target.checked)}
        />
        OK to share with other passengers
      </label>

      {pickupZoneId && destZoneId && pickupZoneId === destZoneId && (
        <p className="text-sm text-red-600">
          Pickup and destination must be different zones
        </p>
      )}

      {fare.isPending && pickupZoneId && destZoneId && pickupZoneId !== destZoneId && (
        <p className="text-sm text-gray-500">Calculating fare…</p>
      )}
      {fare.error && <ErrorState error={fare.error} />}
      {fare.data && (
        <div className="flex flex-col gap-1 rounded border border-gray-200 p-3 text-sm">
          <div className="flex justify-between">
            <span>Solo fare</span>
            <span>{formatPaisa(fare.data.solo)}</span>
          </div>
          <div className="flex justify-between font-medium text-gray-900">
            <span>Pooled fare</span>
            <span>{formatPaisa(fare.data.pooled)}</span>
          </div>
        </div>
      )}

      {createRide.error && <ErrorState error={createRide.error} />}

      <button
        type="submit"
        disabled={!isValid || createRide.isPending}
        className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {createRide.isPending ? 'Requesting…' : 'Request ride'}
      </button>
    </form>
  )
}
