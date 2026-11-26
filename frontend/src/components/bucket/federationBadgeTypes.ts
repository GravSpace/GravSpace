import type { CrossServerShare } from '../federation/federationTypes'

export interface InboundFederationBinding {
  id: number
  source_node: string
  source_bucket: string
  source_prefix: string
  target_bucket: string
  target_prefix: string
  sync_mode: 'one_way' | 'two_way' | string
  share_name: string
  last_synced_at: string
  created_at?: string
}

export interface InboundBadgeItem {
  key: string
  remoteId?: number
  sourceLabel: string
  sourceBucket: string
  sourcePrefix: string
  targetBucket: string
  targetPrefix: string
  syncMode: string
  shareName?: string
  lastSyncedAt?: string | null
}

function normalizePrefix(prefix: string | undefined | null): string {
  return (prefix || '').replace(/^\/+|\/+$/g, '')
}

/** Combines remote inbound bindings and same-server target share rules for a bucket. */
export function collectInboundForBucket(
  bucket: string,
  shares: CrossServerShare[] = [],
  inboundShares: InboundFederationBinding[] = [],
): InboundBadgeItem[] {
  const fromRemote: InboundBadgeItem[] = inboundShares
    .filter((b) => b.target_bucket === bucket)
    .map((b) => ({
      key: `inbound-${b.id}`,
      remoteId: b.id,
      sourceLabel: b.source_node || 'Source Peer',
      sourceBucket: b.source_bucket,
      sourcePrefix: b.source_prefix,
      targetBucket: b.target_bucket,
      targetPrefix: b.target_prefix,
      syncMode: b.sync_mode,
      shareName: b.share_name,
      lastSyncedAt: b.last_synced_at,
    }))

  const fromLocalTargets: InboundBadgeItem[] = shares
    .filter((s) => s.enabled && s.target_bucket === bucket && s.source_bucket !== bucket)
    .map((s) => ({
      key: `local-target-${s.id}`,
      sourceLabel: s.remote_server_name || s.source_bucket,
      sourceBucket: s.source_bucket,
      sourcePrefix: s.source_prefix,
      targetBucket: s.target_bucket,
      targetPrefix: s.target_prefix,
      syncMode: s.sync_mode,
      shareName: s.name,
      lastSyncedAt: s.last_synced_at,
    }))

  return [...fromRemote, ...fromLocalTargets]
}

/** Finds the matching inbound binding for a folder prefix inside a target bucket. */
export function matchInboundForFolder(
  bucket: string,
  folderPrefix: string,
  shares: CrossServerShare[] = [],
  inboundShares: InboundFederationBinding[] = [],
): InboundBadgeItem | undefined {
  const cleanFolder = normalizePrefix(folderPrefix)
  if (!cleanFolder) return undefined

  const candidates = collectInboundForBucket(bucket, shares, inboundShares)
  return candidates.find((item) => {
    const tPrefix = normalizePrefix(item.targetPrefix)
    if (!tPrefix) return false
    return tPrefix === cleanFolder || cleanFolder.startsWith(`${tPrefix}/`) || cleanFolder === tPrefix
  })
}

export async function fetchFederationBadgeState(
  apiBase: string,
  authFetch: (url: string, init?: RequestInit) => Promise<Response>,
  bucket?: string,
): Promise<{ shares: CrossServerShare[]; inboundShares: InboundFederationBinding[] }> {
  const inboundUrl = bucket
    ? `${apiBase}/admin/federation/inbound?bucket=${encodeURIComponent(bucket)}`
    : `${apiBase}/admin/federation/inbound`
  const [sharesRes, inboundRes] = await Promise.all([
    authFetch(`${apiBase}/admin/federation/shares`),
    authFetch(inboundUrl),
  ])
  const shares: CrossServerShare[] = sharesRes.ok ? ((await sharesRes.json()) || []) : []
  const inboundShares: InboundFederationBinding[] = inboundRes.ok
    ? ((await inboundRes.json()) || [])
    : []
  return { shares, inboundShares }
}
