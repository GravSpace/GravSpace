import { useEffect } from 'react'
import { Play, Terminal, Database, FileText } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export interface S3ActionDef {
  id: string
  name: string
  category: 'Bucket' | 'Object' | 'Configuration'
  description: string
  requiresBucket?: boolean
  requiresKey?: boolean
  hasBody?: boolean
}

export const S3_ACTIONS: S3ActionDef[] = [
  // Bucket
  { id: 'ListBuckets', name: 'ListBuckets', category: 'Bucket', description: 'List all buckets accessible to this identity' },
  { id: 'HeadBucket', name: 'HeadBucket', category: 'Bucket', description: 'Determine if a bucket exists and you have permission', requiresBucket: true },
  { id: 'CreateBucket', name: 'CreateBucket', category: 'Bucket', description: 'Create a new bucket', requiresBucket: true },
  { id: 'DeleteBucket', name: 'DeleteBucket', category: 'Bucket', description: 'Delete an empty bucket', requiresBucket: true },
  // Object
  { id: 'ListObjectsV2', name: 'ListObjectsV2', category: 'Object', description: 'List objects within a bucket', requiresBucket: true },
  { id: 'GetObject', name: 'GetObject', category: 'Object', description: 'Retrieve object data & metadata', requiresBucket: true, requiresKey: true },
  { id: 'HeadObject', name: 'HeadObject', category: 'Object', description: 'Retrieve object metadata without content', requiresBucket: true, requiresKey: true },
  { id: 'PutObject', name: 'PutObject', category: 'Object', description: 'Upload text or binary payload', requiresBucket: true, requiresKey: true, hasBody: true },
  { id: 'DeleteObject', name: 'DeleteObject', category: 'Object', description: 'Delete an object from bucket', requiresBucket: true, requiresKey: true },
  { id: 'CopyObject', name: 'CopyObject', category: 'Object', description: 'Copy an object between keys or buckets', requiresBucket: true, requiresKey: true },
  // Configuration
  { id: 'GetBucketVersioning', name: 'GetBucketVersioning', category: 'Configuration', description: 'Get versioning state', requiresBucket: true },
  { id: 'PutBucketVersioning', name: 'PutBucketVersioning', category: 'Configuration', description: 'Enable/suspend versioning', requiresBucket: true },
  { id: 'GetBucketCors', name: 'GetBucketCors', category: 'Configuration', description: 'Get CORS rules', requiresBucket: true },
  { id: 'GetObjectTagging', name: 'GetObjectTagging', category: 'Configuration', description: 'Get object tags', requiresBucket: true, requiresKey: true },
]

interface Props {
  action: string
  onChangeAction: (act: string) => void
  params: Record<string, any>
  onChangeParams: (params: Record<string, any>) => void
  onExecute: () => void
  executing: boolean
  availableBuckets: string[]
}

export function S3ActionForm({
  action,
  onChangeAction,
  params,
  onChangeParams,
  onExecute,
  executing,
  availableBuckets,
}: Props) {
  const currentDef = S3_ACTIONS.find((a) => a.id === action) || S3_ACTIONS[0]

  function updateParam(key: string, val: any) {
    onChangeParams({ ...params, [key]: val })
  }

  // Pre-fill bucket if empty and buckets available
  useEffect(() => {
    if (!params.Bucket && availableBuckets.length > 0) {
      updateParam('Bucket', availableBuckets[0])
    }
  }, [availableBuckets])

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-4 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold tracking-tight">S3 Command & Parameters</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{currentDef.description}</span>
      </div>

      <div className="space-y-3">
        {/* Action Select */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Select S3 API Command</Label>
          <select
            value={action}
            onChange={(e) => onChangeAction(e.target.value)}
            className="w-full h-8 text-xs bg-background border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 font-semibold text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
          >
            {['Bucket', 'Object', 'Configuration'].map((category) => (
              <optgroup key={category} label={`${category} Operations`}>
                {S3_ACTIONS.filter((a) => a.category === category).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Dynamic Parameters */}
        <div className="grid gap-3 sm:grid-cols-2">
          {currentDef.requiresBucket && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Database className="w-3 h-3" /> Target Bucket
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={params.Bucket || ''}
                  onChange={(e) => updateParam('Bucket', e.target.value)}
                  placeholder="bucket-name"
                  className="h-8 text-xs font-mono flex-1"
                />
                {availableBuckets.length > 0 && (
                  <select
                    value={params.Bucket || ''}
                    onChange={(e) => updateParam('Bucket', e.target.value)}
                    className="h-8 text-xs bg-muted border border-border rounded-lg px-2 text-foreground font-mono cursor-pointer"
                  >
                    <option value="" disabled>
                      Presets
                    </option>
                    {availableBuckets.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {currentDef.requiresKey && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" /> Object Key
              </Label>
              <Input
                value={params.Key || ''}
                onChange={(e) => updateParam('Key', e.target.value)}
                placeholder="folder/sample.txt"
                className="h-8 text-xs font-mono"
              />
            </div>
          )}
        </div>

        {/* Additional specific inputs */}
        {action === 'ListObjectsV2' && (
          <div className="grid gap-3 sm:grid-cols-3 pt-1">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Prefix</Label>
              <Input
                value={params.Prefix || ''}
                onChange={(e) => updateParam('Prefix', e.target.value)}
                placeholder="e.g. photos/"
                className="h-7 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Delimiter</Label>
              <Input
                value={params.Delimiter || ''}
                onChange={(e) => updateParam('Delimiter', e.target.value)}
                placeholder="e.g. /"
                className="h-7 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">MaxKeys</Label>
              <Input
                type="number"
                value={params.MaxKeys || 100}
                onChange={(e) => updateParam('MaxKeys', e.target.value)}
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>
        )}

        {action === 'CopyObject' && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-[10px] text-muted-foreground">CopySource (bucket/key)</Label>
            <Input
              value={params.CopySource || ''}
              onChange={(e) => updateParam('CopySource', e.target.value)}
              placeholder="source-bucket/source-file.txt"
              className="h-8 text-xs font-mono"
            />
          </div>
        )}

        {action === 'PutBucketVersioning' && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-[10px] text-muted-foreground">Versioning Status</Label>
            <select
              value={params.Status || 'Enabled'}
              onChange={(e) => updateParam('Status', e.target.value)}
              className="w-full h-8 text-xs bg-background border border-border rounded-lg px-2.5 font-medium"
            >
              <option value="Enabled">Enabled</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
        )}

        {currentDef.hasBody && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-semibold text-muted-foreground">Payload Content (Body)</Label>
              <Input
                value={params.ContentType || 'text/plain'}
                onChange={(e) => updateParam('ContentType', e.target.value)}
                placeholder="Content-Type (e.g. text/plain, application/json)"
                className="h-6 w-48 text-[10px] font-mono"
              />
            </div>
            <textarea
              value={params.Body || ''}
              onChange={(e) => updateParam('Body', e.target.value)}
              rows={3}
              placeholder="Enter text payload, JSON, or string content to upload..."
              className="w-full rounded-lg border border-border bg-background p-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-border/40">
          <Button
            size="sm"
            onClick={onExecute}
            disabled={executing}
            className="h-8 text-xs font-semibold gap-1.5 px-4 shadow-sm"
          >
            <Play className={`w-3.5 h-3.5 ${executing ? 'animate-spin' : 'fill-current'}`} />
            {executing ? 'Executing via SDK...' : `Run ${action}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
