import { KeyRound, Bot, Key, ShieldCheck, FileText, Folder, Smartphone, Globe, Server, Cpu, Shield, Box, Sparkles } from 'lucide-react'
import { zipSync, strToU8 } from 'fflate'

export type SecretType = 'kv' | 'agent_token' | 'keystore' | 'certificate' | 'file'
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
    desc: 'Encrypted arbitrary configuration file',
  },
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateKeyStoreCredentialsText(s: VaultSecret): string {
  const meta = s.metadata || {}
  const alias = meta.key_alias || '-'
  const pass = meta.store_password || '-'
  const keyPass = meta.key_password || pass

  return `# KeyStore Credentials & Configuration
# Generated by GravSpace Vault
# Date: ${new Date().toISOString()}

KEYSTORE_NAME=${s.name}
ENVIRONMENT=${s.environment}
CURRENT_VERSION=v${s.current_version}

# KeyStore Access Credentials
KEY_ALIAS=${alias}
STORE_PASSWORD=${pass}
KEY_PASSWORD=${keyPass}

# Example Gradle configuration (android/app/build.gradle):
# signingConfigs {
#     release {
#         storeFile file("${s.name}")
#         storePassword "${pass}"
#         keyAlias "${alias}"
#         keyPassword "${keyPass}"
#     }
# }
`
}

export function downloadSecretFile(s: VaultSecret, plaintext: string) {
  if (s.secret_type === 'keystore' || s.secret_type === 'file') {
    let b64 = plaintext.trim()
    if (b64.startsWith('data:')) {
      const idx = b64.indexOf(',')
      if (idx !== -1) b64 = b64.slice(idx + 1)
    }
    try {
      const byteCharacters = atob(b64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/octet-stream' })
      downloadBlob(blob, s.name)
    } catch {
      const blob = new Blob([plaintext], { type: 'application/octet-stream' })
      downloadBlob(blob, s.name)
    }
  } else if (s.secret_type === 'certificate') {
    try {
      const parsed = JSON.parse(plaintext)
      const content = `${parsed.certificate || ''}\n${parsed.private_key || ''}`
      const blob = new Blob([content], { type: 'application/x-pem-file' })
      const ext = s.name.endsWith('.pem') || s.name.endsWith('.crt') ? '' : '.pem'
      downloadBlob(blob, `${s.name}${ext}`)
    } catch {
      const blob = new Blob([plaintext], { type: 'application/x-pem-file' })
      downloadBlob(blob, s.name)
    }
  } else {
    const blob = new Blob([plaintext], { type: 'text/plain;charset=utf-8' })
    const ext = s.name.endsWith('.env') || s.name.endsWith('.txt') ? '' : '.txt'
    downloadBlob(blob, `${s.name}${ext}`)
  }
}

export function downloadKeyStoreCredentials(s: VaultSecret) {
  const content = generateKeyStoreCredentialsText(s)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const baseName = s.name.replace(/\.[^/.]+$/, '')
  const filename = `${baseName}-credentials.txt`
  downloadBlob(blob, filename)
}

export function downloadKeyStoreBundle(s: VaultSecret, plaintext: string) {
  const baseName = s.name.replace(/\.[^/.]+$/, '')
  const credsText = generateKeyStoreCredentialsText(s)

  // Extract binary keystore bytes from plaintext
  let keystoreBytes: Uint8Array
  let b64 = plaintext.trim()
  if (b64.startsWith('data:')) {
    const idx = b64.indexOf(',')
    if (idx !== -1) b64 = b64.slice(idx + 1)
  }
  try {
    const byteCharacters = atob(b64)
    keystoreBytes = new Uint8Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      keystoreBytes[i] = byteCharacters.charCodeAt(i)
    }
  } catch {
    keystoreBytes = new TextEncoder().encode(plaintext)
  }

  const readme = `KeyStore Bundle: ${s.name}
Generated by GravSpace Secrets & Agent Vault
Date: ${new Date().toISOString()}

Contents:
1. ${s.name} - The binary Android/Java KeyStore.
2. ${baseName}-credentials.txt - Key Alias and Passwords.

Usage with Android Gradle:
Copy ${s.name} to your android/app directory, and set storePassword & keyPassword according to ${baseName}-credentials.txt.
`

  // Package synchronously into a single ZIP file with fflate
  const zipped = zipSync({
    [s.name]: keystoreBytes,
    [`${baseName}-credentials.txt`]: strToU8(credsText),
    'README.txt': strToU8(readme),
  })

  const zipBlob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
  downloadBlob(zipBlob, `${baseName}-bundle.zip`)
}
