import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// POST because the API computes the answer from a body, but nothing is created (rules.md B10),
// so it's fetched as a query, not a mutation: re-runs automatically whenever the inputs change.
export function useFareEstimate({ pickupZoneId, destZoneId, seats }) {
  const enabled = Boolean(
    pickupZoneId && destZoneId && pickupZoneId !== destZoneId && seats >= 1,
  )

  return useQuery({
    queryKey: ['fareEstimate', pickupZoneId, destZoneId, seats],
    queryFn: async () => {
      const { data } = await api.post('/fares/estimate', {
        pickupZoneId,
        destZoneId,
        seats,
      })
      return data
    },
    enabled,
  })
}
