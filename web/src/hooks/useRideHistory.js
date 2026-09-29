import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useRideHistory() {
  return useQuery({
    queryKey: ['rides', 'history'],
    queryFn: async () => {
      const { data } = await api.get('/rides', { params: { scope: 'history' } })
      return data.rides
    },
  })
}
