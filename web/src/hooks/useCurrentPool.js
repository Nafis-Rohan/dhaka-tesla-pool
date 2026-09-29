import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useCurrentPool() {
  return useQuery({
    queryKey: ['driver', 'pool', 'current'],
    queryFn: async () => {
      const { data } = await api.get('/driver/pool/current')
      return data.pool
    },
    refetchInterval: 5000,
  })
}
