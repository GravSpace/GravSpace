// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  BucketFederationBadge,
  BucketHeaderFederationBadge,
  FolderFederationBadge,
} from '../components/bucket/FederationBadge'
import type { InboundFederationBinding } from '../components/bucket/federationBadgeTypes'
import type { CrossServerShare } from '../components/federation/federationTypes'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const sampleInboundFolder: InboundFederationBinding = {
  id: 12,
  source_node: 'Server 83',
  source_bucket: 'prod-assets',
  source_prefix: 'multi-db/',
  target_bucket: 'dr-assets',
  target_prefix: 'multi-db/',
  sync_mode: 'one_way',
  share_name: 'Multi-DB Sync',
  last_synced_at: new Date().toISOString(),
}

const sampleLocalTwoWayShare: CrossServerShare = {
  id: 5,
  name: 'Bidirectional Share',
  source_bucket: 'primary-bkt',
  source_prefix: 'logs/',
  remote_server_id: 2,
  remote_server_name: 'Peer West',
  target_bucket: 'dr-assets',
  target_prefix: 'replica-logs/',
  sync_mode: 'two_way',
  enabled: true,
  status: 'in_sync',
  created_at: new Date().toISOString(),
}

describe('Target Inbound Federation Badges', () => {
  test('BucketFederationBadge renders Inbound badge on target bucket without local source shares', () => {
    render(
      <BucketFederationBadge
        bucket="dr-assets"
        shares={[]}
        inboundShares={[sampleInboundFolder]}
      />,
    )
    expect(screen.getByText('1 Inbound')).toBeTruthy()
  })

  test('BucketHeaderFederationBadge renders Full 1-Way Inbound when target_prefix is empty', () => {
    render(
      <BucketHeaderFederationBadge
        bucketName="dr-assets"
        shares={[]}
        inboundShares={[{ ...sampleInboundFolder, target_prefix: '' }]}
      />,
    )
    expect(screen.getByText('1-Way Inbound')).toBeTruthy()
  })

  test('FolderFederationBadge renders Inbound source badge on target folder multi-db/ and 2-Way target badge', () => {
    const { rerender } = render(
      <FolderFederationBadge
        currentBucket="dr-assets"
        folderPrefix="multi-db/"
        shares={[]}
        inboundShares={[sampleInboundFolder]}
      />,
    )
    expect(screen.getByText('Inbound: Server 83')).toBeTruthy()

    rerender(
      <FolderFederationBadge
        currentBucket="dr-assets"
        folderPrefix="replica-logs/"
        shares={[sampleLocalTwoWayShare]}
        inboundShares={[]}
      />,
    )
    expect(screen.getByText('2-Way: Peer West')).toBeTruthy()
  })
})
