import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { CrossServerShare } from '../federation/federationTypes'
import {
  fetchFederationBadgeState,
  type InboundFederationBinding,
} from './federationBadgeTypes'

export function useBucketFederation(
  apiBase: string,
  authFetch: (url: string, init?: RequestInit) => Promise<Response>,
  bucket?: string,
) {
  const [shares, setShares] = useState<CrossServerShare[]>([])
  const [inboundShares, setInboundShares] = useState<InboundFederationBinding[]>([])

  const refreshFederation = useCallback(async () => {
    const next = await fetchFederationBadgeState(apiBase, authFetch, bucket)
    setShares(
      bucket
        ? next.shares.filter(
            (s) =>
              s.enabled &&
              (s.source_bucket === bucket || s.target_bucket === bucket),
          )
        : next.shares,
    )
    setInboundShares(next.inboundShares)
  }, [apiBase, authFetch, bucket])

  const dismissInbound = useCallback(
    async (id: number) => {
      const res = await authFetch(`${apiBase}/admin/federation/inbound/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setInboundShares((prev) => prev.filter((item) => item.id !== id))
        toast.success('Inbound federation marker dismissed')
      } else {
        toast.error('Failed to dismiss inbound marker')
      }
    },
    [apiBase, authFetch],
  )

  return { shares, inboundShares, refreshFederation, dismissInbound }
}
