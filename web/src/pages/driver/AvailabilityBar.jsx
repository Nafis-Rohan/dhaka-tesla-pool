import { useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { useDriverAvailability, useSetDriverAvailability } from '../../hooks/useDriverAvailability'
import { useZones } from '../../hooks/useZones'

export function AvailabilityBar() {
  const { data: availability } = useDriverAvailability()
  const { data: zones } = useZones()
  const setAvailability = useSetDriverAvailability()
  const [zoneId, setZoneId] = useState('')

  if (!availability || !zones) return null

  function goOnline() {
    if (!zoneId) return
    setAvailability.mutate({ online: true, zoneId })
  }

  function goOffline() {
    setAvailability.mutate({ online: false })
  }

  return (
    <div className="flex flex-col gap-2 border-b border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">
          {availability.vehicle.name} ({availability.vehicle.capacity} seats) ·{' '}
          {availability.isOnline
            ? `Online in ${availability.currentZone?.name}`
            : 'Offline'}
        </span>

        {availability.isOnline ? (
          <button
            type="button"
            onClick={goOffline}
            disabled={setAvailability.isPending}
            className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            Go offline
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">Select zone</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={goOnline}
              disabled={!zoneId || setAvailability.isPending}
              className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            >
              Go online
            </button>
          </div>
        )}
      </div>

      {setAvailability.error && <ErrorState error={setAvailability.error} />}
    </div>
  )
}
