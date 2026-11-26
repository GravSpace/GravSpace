import { KeyRound, Bot, Key, ShieldCheck, FileText, Folder, Smartphone, Globe, Server, Cpu, Shield, Box, Sparkles } from 'lucide-react'

export type SecretType = 'kv' | 'agent_token' | 'file' | 'keystore' | 'certificate'
export type Environment = string
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked'
export type ExportFormat = 'dotenv' | 'json' | 'csv'

export interface VaultProject {
  id: string
  slug: string
  name: string
  description?: string
  color: string
  icon: string
  secrets_count?: number
  created_at?: string
  updated_at?: string
}

export interface VaultEnvironment {
  id: string
  slug: string
  name: string
  color: string
  description?: string
  position: number
  secrets_count?: number
  created_at?: string
}

export interface VaultSecret {
  id: string
  project_id?: string
  name: string
  environment: Environment
  secret_type: SecretType
  description?: string
  tags: string[]
  current_version: number
  has_value: boolean
  value?: string
  value_masked?: string
  requires_approval: boolean
  has_active_grant?: boolean
  metadata?: Record<string, any>
  created_by?: string
  created_at: string
  updated_at: string
}

export interface SecretVersion {
  version: number
  comment?: string
  created_by?: string
  created_at: string
}

export interface AccessRequest {
  id: string
  secret_id?: string
  secret_name?: string
  environment: Environment
  requester: string
  justification: string
  requested_duration_minutes: number
  status: RequestStatus
  reviewed_by?: string
  reviewed_at?: string
  review_comment?: string
  access_granted_until?: string
  created_at: string
}

export interface EnvColorTheme {
  dot: string
  badge: string
  border: string
  bg: string
  ring: string
}

export const ENV_COLOR_MAP: Record<string, EnvColorTheme> = {
  sky: {
    dot: 'bg-sky-500',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
    ring: 'focus-visible:ring-sky-500',
  },
  amber: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    ring: 'focus-visible:ring-amber-500',
  },
  rose: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    ring: 'focus-visible:ring-rose-500',
  },
  emerald: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    ring: 'focus-visible:ring-emerald-500',
  },
  violet: {
    dot: 'bg-violet-500',
    badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/10',
    ring: 'focus-visible:ring-violet-500',
  },
  indigo: {
    dot: 'bg-indigo-500',
    badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-500/10',
    ring: 'focus-visible:ring-indigo-500',
  },
  cyan: {
    dot: 'bg-cyan-500',
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-500/10',
    ring: 'focus-visible:ring-cyan-500',
  },
  orange: {
    dot: 'bg-orange-500',
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/10',
    ring: 'focus-visible:ring-orange-500',
  },
}

export function getEnvTheme(color?: string): EnvColorTheme {
  if (color && ENV_COLOR_MAP[color]) {
    return ENV_COLOR_MAP[color]
  }
  return ENV_COLOR_MAP.sky
}

export function getProjectTheme(color?: string): EnvColorTheme {
  if (color && ENV_COLOR_MAP[color]) {
    return ENV_COLOR_MAP[color]
  }
  return ENV_COLOR_MAP.indigo
}

export function getProjectIcon(icon?: string) {
  switch (icon) {
    case 'bot': return Bot
    case 'smartphone': return Smartphone
    case 'globe': return Globe
    case 'server': return Server
    case 'cpu': return Cpu
    case 'shield': return Shield
    case 'box': return Box
    case 'sparkles': return Sparkles
    default: return Folder
  }
}

export const ENV_CONFIG: Record<string, { label: string; badge: string; border: string }> = {
  development: {
    label: 'Development',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    border: 'border-sky-500/30',
  },
  staging: {
    label: 'Staging',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    border: 'border-amber-500/30',
  },
  production: {
    label: 'Production',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    border: 'border-rose-500/30',
  },
}

export const TYPE_CONFIG: Record<
  SecretType,
  { label: string; icon: typeof KeyRound; color: string; desc: string }
> = {
  kv: {
    label: 'KV Secret',
    icon: KeyRound,
    color: 'text-indigo-500',
    desc: 'Key-Value pair or Environment variable',
  },
  agent_token: {
    label: 'Agent Vault',
    icon: Bot,
    color: 'text-emerald-500',
    desc: 'Scoped token for AI agent or worker bot',
  },
  keystore: {
    label: 'KeyStore (JKS/P12)',
    icon: Key,
    color: 'text-amber-500',
    desc: 'Java KeyStore (.jks) or PKCS#12 (.p12) bundle',
  },
  certificate: {
    label: 'Certificate',
    icon: ShieldCheck,
    color: 'text-violet-500',
    desc: 'SSL/TLS Certificate (.crt, .pem) & Private Key',
  },
  file: {
    label: 'Secret File',
    icon: FileText,
    color: 'text-sky-500',
    desc: 'Encrypted .txt, .md, .json, .pem, .key, .env & security files',
  },
}

export {
  downloadBlob,
  generateKeyStoreCredentialsText,
  downloadSecretFile,
  downloadKeyStoreCredentials,
  downloadKeyStoreBundle,
} from './vaultDownload'
