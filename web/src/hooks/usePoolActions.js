import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Every pool action changes what the current-trip screen shows, and may free up
// seats a waiting passenger could now be accepted into, so both are refreshed.
function usePoolMutation(mutationFn) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver', 'pool', 'current'] })
      queryClient.invalidateQueries({ queryKey: ['driver', 'requests'] })
    },
  })
}

export function useArrivePool() {
  return usePoolMutation(async () => {
    const { data } = await api.post('/driver/pool/arrive')
    return data.pool
  })
}

export function useStartPool() {
  return usePoolMutation(async () => {
    const { data } = await api.post('/driver/pool/start')
    return data.pool
  })
}

export function useCancelPool() {
  return usePoolMutation(async () => {
    const { data } = await api.post('/driver/pool/cancel')
    return data.pool
  })
}

export function useDropOffPassenger() {
  return usePoolMutation(async (requestId) => {
    const { data } = await api.post(`/driver/pool/requests/${requestId}/dropoff`)
    return data.pool
  })
}

export function useMarkNoShow() {
  return usePoolMutation(async (requestId) => {
    const { data } = await api.post(`/driver/pool/requests/${requestId}/no-show`)
    return data.pool
  })
}
