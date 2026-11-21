import { Database, FileText, Tag, Globe, Eye, Upload, Zap, Download } from 'lucide-react'

export interface Statement {
  effect: 'Allow' | 'Deny'
  action: string[]
  resource: string
}

export interface Policy {
  name: string
  version: string
  statement: Statement[]
}

export const ACTION_GROUPS = [
  {
    group: 'Bucket Operations',
    icon: Database,
    color: 'indigo',
    actions: [
      { id: 's3:ListAllMyBuckets', label: 'List All Buckets', desc: 'List every bucket in the account' },
      { id: 's3:ListBucket', label: 'List Bucket Contents', desc: 'Browse objects in a bucket' },
      { id: 's3:GetBucketLocation', label: 'Get Bucket Location', desc: 'Read bucket region info' },
      { id: 's3:CreateBucket', label: 'Create Bucket', desc: 'Provision a new bucket' },
      { id: 's3:DeleteBucket', label: 'Delete Bucket', desc: 'Permanently remove a bucket' },
    ],
  },
  {
    group: 'Object Operations',
    icon: FileText,
    color: 'violet',
    actions: [
      { id: 's3:GetObject', label: 'Get / Download Object', desc: 'Read object content' },
      { id: 's3:PutObject', label: 'Put / Upload Object', desc: 'Write or overwrite objects' },
      { id: 's3:DeleteObject', label: 'Delete Object', desc: 'Remove a specific object' },
      { id: 's3:CopyObject', label: 'Copy Object', desc: 'Copy object within storage' },
      { id: 's3:HeadObject', label: 'Head Object', desc: 'Read object metadata only' },
    ],
  },
  {
    group: 'Tagging & Metadata',
    icon: Tag,
    color: 'amber',
    actions: [
      { id: 's3:GetObjectTagging', label: 'Get Object Tags', desc: 'Read object tag set' },
      { id: 's3:PutObjectTagging', label: 'Put Object Tags', desc: 'Set or overwrite tags' },
      { id: 's3:DeleteObjectTagging', label: 'Delete Object Tags', desc: 'Remove all tags' },
    ],
  },
  {
    group: 'Versioning & Lifecycle',
    icon: Globe,
    color: 'teal',
    actions: [
      { id: 's3:GetBucketVersioning', label: 'Get Versioning', desc: 'Read versioning status' },
      { id: 's3:PutBucketVersioning', label: 'Set Versioning', desc: 'Enable or suspend versioning' },
      { id: 's3:ListBucketVersions', label: 'List Object Versions', desc: 'Browse all object versions' },
      { id: 's3:GetLifecycleConfiguration', label: 'Get Lifecycle', desc: 'Read lifecycle rules' },
      { id: 's3:PutLifecycleConfiguration', label: 'Set Lifecycle', desc: 'Write lifecycle rules' },
    ],
  },
]

export const ALL_ACTIONS = ACTION_GROUPS.flatMap((g) => g.actions)

export const PRESETS = [
  {
    name: 'Read Only',
    icon: Eye,
    description: 'Download and browse — no writes',
    color: 'sky',
    actions: ['s3:GetObject', 's3:ListBucket', 's3:ListAllMyBuckets', 's3:HeadObject'],
  },
  {
    name: 'Read Write',
    icon: Upload,
    description: 'Full object read/write access',
    color: 'emerald',
    actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:ListAllMyBuckets', 's3:HeadObject', 's3:CopyObject'],
  },
  {
    name: 'Admin',
    icon: Zap,
    description: 'Unrestricted access to everything',
    color: 'violet',
    actions: ALL_ACTIONS.map((a) => a.id),
  },
  {
    name: 'Download Only',
    icon: Download,
    description: 'Only fetch/download objects',
    color: 'amber',
    actions: ['s3:GetObject', 's3:HeadObject'],
  },
]

export const COLOR_MAP: Record<string, { badge: string; bg: string; border: string; text: string; check: string }> = {
  indigo: { badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/5 hover:bg-indigo-500/10', border: 'border-indigo-500/20 hover:border-indigo-500/40', text: 'text-indigo-600 dark:text-indigo-400', check: 'text-indigo-500' },
  violet: { badge: 'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/5 hover:bg-violet-500/10', border: 'border-violet-500/20 hover:border-violet-500/40', text: 'text-violet-600 dark:text-violet-400', check: 'text-violet-500' },
  amber: { badge: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5 hover:bg-amber-500/10', border: 'border-amber-500/20 hover:border-amber-500/40', text: 'text-amber-600 dark:text-amber-400', check: 'text-amber-500' },
  teal: { badge: 'bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400', bg: 'bg-teal-500/5 hover:bg-teal-500/10', border: 'border-teal-500/20 hover:border-teal-500/40', text: 'text-teal-600 dark:text-teal-400', check: 'text-teal-500' },
  sky: { badge: 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/5 hover:bg-sky-500/10', border: 'border-sky-500/20 hover:border-sky-500/40', text: 'text-sky-600 dark:text-sky-400', check: 'text-sky-500' },
  emerald: { badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5 hover:bg-emerald-500/10', border: 'border-emerald-500/20 hover:border-emerald-500/40', text: 'text-emerald-600 dark:text-emerald-400', check: 'text-emerald-500' },
}

export function buildPolicyJson(name: string, statements: Statement[]): string {
  return JSON.stringify({
    name,
    version: '2012-10-17',
    statement: statements.map((s) => ({
      effect: s.effect,
      action: s.action,
      resource: [s.resource || 'arn:aws:s3:::*'],
    })),
  }, null, 2)
}

export function defaultStatement(): Statement {
  return { effect: 'Allow', action: [], resource: 'arn:aws:s3:::*' }
}
