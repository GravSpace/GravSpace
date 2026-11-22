import { useState } from 'react'
import {
  User, Key, Lock, ChevronDown, Copy, Eye, EyeOff, Trash2,
  ShieldCheck, Fingerprint, UserMinus, Plus, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { IamUser } from './userTypes'

interface Props {
  username: string
  user: IamUser
  onGenerateKey: (username: string) => void
  onDeleteKey: (username: string, keyId: string) => void
  onChangePassword: (username: string) => void
  onDeleteUser: (username: string) => void
  onAttachPolicy: (username: string) => void
  onRemovePolicy: (username: string, policyName: string) => void
}

export function UserCard({
  username,
  user,
  onGenerateKey,
  onDeleteKey,
  onChangePassword,
  onDeleteUser,
  onAttachPolicy,
  onRemovePolicy,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  const accessKeys = user.accessKeys || user.access_keys || []

  function toggleSecret(keyId: string) {
    setShowSecrets((prev) => ({ ...prev, [keyId]: !prev[keyId] }))
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard.`)
  }

  function getAvatarStyle() {
    if (username === 'admin')
      return 'bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 text-indigo-500'
    if (username === 'anonymous')
      return 'bg-gradient-to-br from-sky-500/15 to-cyan-500/15 border border-sky-500/25 text-sky-500'
    return 'bg-gradient-to-br from-slate-500/10 to-slate-400/10 border border-slate-300 dark:border-slate-700 text-slate-500'
  }

  return (
    <div className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300">
      <div className="flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${getAvatarStyle()}`}>
            {username === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight truncate">{username}</span>
              {username === 'admin' && (
                <Badge className="text-[8px] h-4 bg-indigo-500 hover:bg-indigo-500 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold">
                  Root
                </Badge>
              )}
              {username === 'anonymous' && (
                <Badge variant="outline" className="text-[8px] h-4 border-sky-500/30 text-sky-500 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold">
                  Guest
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase tracking-wider opacity-50">
              {username === 'admin' ? 'System Administrator' : username === 'anonymous' ? 'Unauthenticated Access' : 'Service Account'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-[40%]">
          {user.policies?.map((p) => (
            <div
              key={p.name}
              className="flex items-center gap-1 h-6 px-2 rounded-md bg-indigo-500/8 border border-indigo-500/15 group/badge hover:border-indigo-500/40 transition-colors"
            >
              <Lock className="w-2.5 h-2.5 text-indigo-500 opacity-70" />
              <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 capitalize leading-none">{p.name}</span>
              {username !== 'admin' && (
                <button
                  onClick={() => onRemovePolicy(username, p.name)}
                  className="ml-1 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center p-0.5 cursor-pointer"
                  title="Detach Policy"
                >
                  <X className="w-2.5 h-2.5 font-bold" />
                </button>
              )}
            </div>
          ))}
          {username !== 'admin' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] font-bold text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600 transition-all cursor-pointer"
              onClick={() => onAttachPolicy(username)}
            >
              <Plus className="w-3 h-3 mr-0.5" /> Attach
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {username !== 'anonymous' ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                onClick={() => onGenerateKey(username)}
                title="Generate Access Key"
              >
                <Key className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer"
                onClick={() => onChangePassword(username)}
                title="Change Password"
              >
                <Fingerprint className="w-3.5 h-3.5" />
              </Button>
              {username !== 'admin' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  onClick={() => onDeleteUser(username)}
                  title="Delete User"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          ) : (
            <Badge variant="outline" className="text-[8px] font-bold uppercase tracking-tighter opacity-40 border-slate-300 pointer-events-none ml-1">
              Immutable
            </Badge>
          )}
        </div>
      </div>

      {accessKeys.length > 0 ? (
        <div className="border-t border-slate-100 dark:border-slate-800/80">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Key className="w-3 h-3 opacity-50" />
              <span>{accessKeys.length} Access {accessKeys.length === 1 ? 'Key' : 'Keys'}</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {expanded && (
            <div className={`px-5 pb-4 pt-1 grid gap-2 ${accessKeys.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {accessKeys.map((key) => {
                const keyId = key.accessKeyId || key.access_key_id || ''
                const secretKey = key.secretAccessKey || key.secret_access_key || key.secretKey || ''
                return (
                  <div
                    key={keyId}
                    className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Access Key ID</span>
                        <code className="text-[11px] font-mono font-bold truncate select-all">{keyId}</code>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted cursor-pointer" onClick={() => copyToClipboard(keyId, 'Access Key ID')} title="Copy Key ID">
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10 cursor-pointer" onClick={() => onDeleteKey(username, keyId)} title="Delete Key">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Secret Access Key</span>
                        <code className="text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400 truncate select-all">
                          {showSecrets[keyId] ? secretKey : '••••••••••••••••••••••••••••••••'}
                        </code>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted cursor-pointer" onClick={() => toggleSecret(keyId)} title={showSecrets[keyId] ? "Hide Secret" : "Show Secret"}>
                          {showSecrets[keyId] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted cursor-pointer" onClick={() => copyToClipboard(secretKey, 'Secret Access Key')} title="Copy Secret">
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        username !== 'anonymous' && (
          <div className="border-t border-dashed border-slate-200/80 dark:border-slate-800/60 px-5 py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Key className="w-3 h-3 opacity-25" />
              <span className="text-[10px] font-medium uppercase tracking-widest opacity-40 italic">No active credentials</span>
            </div>
          </div>
        )
      )}
    </div>
  )
}
