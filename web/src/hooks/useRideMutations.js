import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useCreateRide() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/rides', body)
      return data.ride
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides', 'active'] })
    },
  })
}

export function useCancelRide() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rideId) => {
      const { data } = await api.post(`/rides/${rideId}/cancel`)
      return data.ride
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides', 'active'] })
    },
  })
}
