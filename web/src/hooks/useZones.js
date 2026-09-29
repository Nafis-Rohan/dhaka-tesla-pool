import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const { data } = await api.get('/zones')
      return data.zones
    },
  })
}
