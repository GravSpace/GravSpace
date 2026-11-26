import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import type { BucketInfo } from '../../routes/admin/buckets/$bucket'
import type { WebhookConfig, DLQRecord, CorsRule, ReplicationRule } from './settings/settingsTypes'
import { BucketGeneralTab } from './settings/BucketGeneralTab'
import { BucketSecurityTab } from './settings/BucketSecurityTab'
import { BucketWebsiteTab } from './settings/BucketWebsiteTab'
import { BucketCorsTab } from './settings/BucketCorsTab'
import { BucketWebhookTab } from './settings/BucketWebhookTab'
import { BucketReplicationTab } from './settings/BucketReplicationTab'

interface Props {
  open: boolean
  onClose: () => void
  bucketName: string
  bucketInfo: BucketInfo | null
  onInfoUpdated: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function BucketSettingsDialog({
  open,
  onClose,
  bucketName,
  bucketInfo,
  onInfoUpdated,
  authFetch,
  apiBase,
}: Props) {
  const [activeTab, setActiveTab] = useState('general')
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [dlqRecords, setDlqRecords] = useState<DLQRecord[]>([])
  const [corsRules, setCorsRules] = useState<CorsRule[]>([])
  const [websiteConfig, setWebsiteConfig] = useState({ enabled: false, indexDocument: 'index.html', errorDocument: '' })
  const [replicationRules, setReplicationRules] = useState<ReplicationRule[]>([])
  const [bucketsList, setBucketsList] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      fetchWebhooks()
      fetchDLQ()
      fetchCors()
      fetchWebsite()
      fetchReplication()
      fetchBuckets()
    }
  }, [open, bucketName])

  async function fetchWebhooks() {
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks`)
      if (res.ok) setWebhooks((await res.json()) || [])
    } catch {}
  }

  async function fetchDLQ() {
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/webhooks/dlq`)
      if (res.ok) setDlqRecords((await res.json()) || [])
    } catch {}
  }

  async function fetchCors() {
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/cors`)
      if (res.ok) {
        const data = (await res.json()) || []
        const rules = data.map((r: any) => ({
          ...r,
          originsInput: (r.allowed_origins || []).join(', '),
          headersInput: (r.allowed_headers || []).join(', '),
          exposeHeadersInput: (r.expose_headers || []).join(', '),
        }))
        setCorsRules(rules)
      }
    } catch {}
  }

  async function fetchWebsite() {
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/website`)
      if (res.ok) {
        const d = await res.json()
        if (d) {
          setWebsiteConfig({
            enabled: true,
            indexDocument: d.index_document?.suffix || 'index.html',
            errorDocument: d.error_document?.key || '',
          })
        }
      }
    } catch {}
  }

  async function fetchReplication() {
    try {
      const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/replication`)
      if (res.ok) setReplicationRules((await res.json()) || [])
    } catch {}
  }

  async function fetchBuckets() {
    try {
      const res = await authFetch(`${apiBase}/admin/buckets`)
      if (res.ok) setBucketsList((await res.json()) || [])
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <DialogTitle>
              Bucket Settings: <span className="text-primary italic">{bucketName}</span>
            </DialogTitle>
          </div>
          <DialogDescription>Configure advanced features and notifications for this bucket.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col mt-4">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto gap-1 shrink-0">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="website">Website</TabsTrigger>
            <TabsTrigger value="cors">CORS</TabsTrigger>
            <TabsTrigger value="replication">Replication</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="general">
              <BucketGeneralTab
                bucketName={bucketName}
                info={bucketInfo}
                onInfoUpdated={onInfoUpdated}
                authFetch={authFetch}
                apiBase={apiBase}
              />
            </TabsContent>

            <TabsContent value="webhooks">
              <BucketWebhookTab
                bucketName={bucketName}
                webhooks={webhooks}
                dlqRecords={dlqRecords}
                onRefreshWebhooks={fetchWebhooks}
                onRefreshDLQ={fetchDLQ}
                authFetch={authFetch}
                apiBase={apiBase}
              />
            </TabsContent>

            <TabsContent value="security">
              <BucketSecurityTab
                bucketName={bucketName}
                info={bucketInfo}
                onInfoUpdated={onInfoUpdated}
                authFetch={authFetch}
                apiBase={apiBase}
              />
            </TabsContent>

            <TabsContent value="website">
              <BucketWebsiteTab
                bucketName={bucketName}
                initialConfig={websiteConfig}
                onInfoUpdated={onInfoUpdated}
                authFetch={authFetch}
                apiBase={apiBase}
              />
            </TabsContent>

            <TabsContent value="cors">
              <BucketCorsTab
                bucketName={bucketName}
                rules={corsRules}
                authFetch={authFetch}
                apiBase={apiBase}
              />
            </TabsContent>

            <TabsContent value="replication">
              <BucketReplicationTab
                bucketName={bucketName}
                rules={replicationRules}
                bucketsList={bucketsList}
                onRefreshRules={fetchReplication}
                authFetch={authFetch}
                apiBase={apiBase}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
