import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useDriverAvailability() {
  return useQuery({
    queryKey: ['driver', 'availability'],
    queryFn: async () => {
      const { data } = await api.get('/driver/availability')
      return data.availability
    },
  })
}

export function useSetDriverAvailability() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ online, zoneId }) => {
      const { data } = await api.put('/driver/availability', { online, zoneId })
      return data.availability
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver', 'availability'] })
    },
  })
}
