import { useState, useEffect } from 'react'
import { User, Key, Shield, Eye, EyeOff, Radio, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import type { S3Credentials } from '../../lib/s3Client'

export interface IAMUser {
  username: string
  access_keys: Array<{
    access_key_id: string
    secret_access_key: string
    created_at?: string
  }>
  policies?: Array<{
    name: string
    statement?: any[]
    Statement?: any[]
  }>
}

interface Props {
  users: Record<string, IAMUser>
  loadingUsers: boolean
  onRefreshUsers: () => void
  credentials: S3Credentials
  onChangeCredentials: (creds: S3Credentials) => void
  endpoint: string
  onChangeEndpoint: (ep: string) => void
  onTestConnection: () => void
  testing: boolean
}

export function S3CredentialSelector({
  users,
  loadingUsers,
  onRefreshUsers,
  credentials,
  onChangeCredentials,
  endpoint,
  onChangeEndpoint,
  onTestConnection,
  testing,
}: Props) {
  const [selectedUsername, setSelectedUsername] = useState<string>('')
  const [showSecret, setShowSecret] = useState(false)

  // Initialize selected user when users load
  useEffect(() => {
    const usernames = Object.keys(users)
    if (usernames.length > 0 && !selectedUsername) {
      const preferred = usernames.includes('admin') ? 'admin' : usernames[0]
      selectUser(preferred)
    }
  }, [users])

  function selectUser(uname: string) {
    setSelectedUsername(uname)
    const u = users[uname]
    if (u && u.access_keys && u.access_keys.length > 0) {
      const firstKey = u.access_keys[0]
      onChangeCredentials({
        accessKeyId: firstKey.access_key_id,
        secretAccessKey: firstKey.secret_access_key,
      })
    }
  }

  function selectKey(keyId: string) {
    const u = users[selectedUsername]
    if (!u) return
    const match = u.access_keys.find((k) => k.access_key_id === keyId)
    if (match) {
      onChangeCredentials({
        accessKeyId: match.access_key_id,
        secretAccessKey: match.secret_access_key,
      })
    }
  }

  const currentUser = users[selectedUsername]
  const currentKeys = currentUser?.access_keys || []
  const currentPolicies = currentUser?.policies || []

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-4 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold tracking-tight">S3 SDK Credentials & Endpoint</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1 text-muted-foreground"
          onClick={onRefreshUsers}
          disabled={loadingUsers}
        >
          <RefreshCw className={`w-3 h-3 ${loadingUsers ? 'animate-spin' : ''}`} />
          Sync IAM
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* User Selector */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" /> IAM User
          </Label>
          <select
            value={selectedUsername}
            onChange={(e) => selectUser(e.target.value)}
            className="w-full h-8 text-xs bg-background border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 font-medium text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
          >
            {Object.keys(users).map((u) => (
              <option key={u} value={u}>
                {u} ({users[u]?.access_keys?.length || 0} keys)
              </option>
            ))}
          </select>
        </div>

        {/* Key Selector */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <Key className="w-3 h-3" /> Access Key ID
          </Label>
          {currentKeys.length > 0 ? (
            <select
              value={credentials.accessKeyId}
              onChange={(e) => selectKey(e.target.value)}
              className="w-full h-8 text-xs bg-background border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 font-mono text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
            >
              {currentKeys.map((k) => (
                <option key={k.access_key_id} value={k.access_key_id}>
                  {k.access_key_id.slice(0, 12)}...
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={credentials.accessKeyId}
              onChange={(e) => onChangeCredentials({ ...credentials, accessKeyId: e.target.value })}
              placeholder="AKIA..."
              className="h-8 text-xs font-mono"
            />
          )}
        </div>

        {/* Secret Key */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span>Secret Access Key</span>
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </Label>
          <Input
            type={showSecret ? 'text' : 'password'}
            value={credentials.secretAccessKey}
            onChange={(e) => onChangeCredentials({ ...credentials, secretAccessKey: e.target.value })}
            placeholder="Secret Key"
            className="h-8 text-xs font-mono"
          />
        </div>

        {/* Endpoint */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-primary" /> S3 Endpoint
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-[10px] gap-1 border-primary/30 text-primary"
              onClick={onTestConnection}
              disabled={testing}
            >
              {testing ? 'Testing...' : 'Ping SDK'}
            </Button>
          </Label>
          <Input
            value={endpoint}
            onChange={(e) => onChangeEndpoint(e.target.value)}
            placeholder="http://localhost:9001"
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>

      {/* Policies of Selected User */}
      {currentPolicies.length > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/30 text-xs">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0 font-medium">
            <Shield className="w-3 h-3 text-emerald-500" /> Active Policies:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {currentPolicies.map((p) => (
              <Badge
                key={p.name}
                variant="outline"
                className="text-[10px] h-4.5 px-1.5 bg-slate-100 dark:bg-slate-800 border-border/60 font-medium"
              >
                {p.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
