import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Only polled while online: the API rejects this with DRIVER_OFFLINE otherwise.
export function useDriverRequests(enabled) {
  return useQuery({
    queryKey: ['driver', 'requests'],
    queryFn: async () => {
      const { data } = await api.get('/driver/requests')
      return data // { seatsLeft, requests }
    },
    enabled,
    refetchInterval: 5000,
  })
}

export function useAcceptRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId) => {
      const { data } = await api.post(`/driver/requests/${requestId}/accept`)
      return data.pool
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver', 'requests'] })
      queryClient.invalidateQueries({ queryKey: ['driver', 'pool', 'current'] })
    },
  })
}
