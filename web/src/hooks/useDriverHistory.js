import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useDriverHistory() {
  return useQuery({
    queryKey: ['driver', 'history'],
    queryFn: async () => {
      const { data } = await api.get('/driver/history')
      return data.pools
    },
  })
}
