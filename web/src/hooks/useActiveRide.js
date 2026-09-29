import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Polling, not websockets (architecture.md): fine at MVP scale, zero extra infra.
export function useActiveRide() {
  return useQuery({
    queryKey: ['rides', 'active'],
    queryFn: async () => {
      const { data } = await api.get('/rides', { params: { scope: 'active' } })
      return data.rides[0] ?? null
    },
    refetchInterval: 5000,
  })
}
