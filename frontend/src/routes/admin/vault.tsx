import { useState, useEffect, useCallback, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../../hooks/useAuth'
import { toast } from 'sonner'
import { VaultFilterBar } from '../../components/vault/VaultFilterBar'
import {
  type VaultSecret,
  type AccessRequest,
  type VaultEnvironment,
  type VaultProject,
  downloadSecretFile,
  downloadKeyStoreBundle,
} from '../../components/vault/vaultTypes'
import { VaultHeader } from '../../components/vault/VaultHeader'
import { ProjectSwitcher } from '../../components/vault/ProjectSwitcher'
import { EnvironmentBar } from '../../components/vault/EnvironmentBar'
import { SecretsTable } from '../../components/vault/SecretsTable'
import { AccessRequestsTable } from '../../components/vault/AccessRequestsTable'
import { CreateSecretDialog } from '../../components/vault/CreateSecretDialog'
import { SecretDetailDialog } from '../../components/vault/SecretDetailDialog'
import { AccessRequestDialog } from '../../components/vault/AccessRequestDialog'
import { ImportExportDialog } from '../../components/vault/ImportExportDialog'
import { ExportSecretsDialog } from '../../components/vault/ExportSecretsDialog'
import { ManageEnvironmentsDialog } from '../../components/vault/ManageEnvironmentsDialog'
import { ManageProjectsDialog } from '../../components/vault/ManageProjectsDialog'

export const Route = createFileRoute('/admin/vault')({
  component: VaultPage,
  head: () => ({ meta: [{ title: 'Secrets Management & Vault | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

const DEFAULT_PROJECTS: VaultProject[] = [
  { id: 'proj_default', slug: 'default', name: 'Default Project', color: 'indigo', icon: 'folder', secrets_count: 0 },
]

const DEFAULT_ENVS: VaultEnvironment[] = [
  { id: 'env_dev', slug: 'development', name: 'Development', color: 'sky', position: 1 },
  { id: 'env_staging', slug: 'staging', name: 'Staging', color: 'amber', position: 2 },
  { id: 'env_prod', slug: 'production', name: 'Production', color: 'rose', position: 3 },
]

function VaultPage() {
  const { authFetch } = useAuth()
  const [activeTab, setActiveTab] = useState<'secrets' | 'pam'>('secrets')
  const [projects, setProjects] = useState<VaultProject[]>(DEFAULT_PROJECTS)
  const [currentProject, setCurrentProject] = useState<string>('default')
  const [environments, setEnvironments] = useState<VaultEnvironment[]>(DEFAULT_ENVS)
  const [currentEnv, setCurrentEnv] = useState<string>('development')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [secrets, setSecrets] = useState<VaultSecret[]>([])
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [loadingSecrets, setLoadingSecrets] = useState(false)
  const [loadingRequests, setLoadingRequests] = useState(false)

  // Revealed secrets map: secret_id -> plaintext
  const [revealedMap, setRevealedMap] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)

  // Modals state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [selectedSecret, setSelectedSecret] = useState<VaultSecret | null>(null)
  const [showPamDialog, setShowPamDialog] = useState(false)
  const [pamTargetSecret, setPamTargetSecret] = useState<VaultSecret | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showManageEnvDialog, setShowManageEnvDialog] = useState(false)
  const [showManageProjectsDialog, setShowManageProjectsDialog] = useState(false)
  const [manageProjectsInitialTab, setManageProjectsInitialTab] = useState<'list' | 'create'>('list')

  const fetchProjects = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/admin/vault/projects`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) setProjects(data)
      }
    } catch { /* Keep defaults */ }
  }, [authFetch])

  const fetchEnvironments = useCallback(async (projectSlug?: string) => {
    try {
      const proj = projectSlug !== undefined ? projectSlug : currentProject
      const q = proj && proj !== 'all' ? `?project=${proj}` : ''
      const res = await authFetch(`${API_BASE}/admin/vault/environments${q}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) setEnvironments(data)
      }
    } catch { /* Keep defaults */ }
  }, [authFetch, currentProject])

  const fetchSecrets = useCallback(async () => {
    setLoadingSecrets(true)
    try {
      const q = new URLSearchParams()
      if (currentProject && currentProject !== 'all') q.set('project', currentProject)
      if (currentEnv) q.set('env', currentEnv)
      if (selectedType !== 'all') q.set('type', selectedType)
      if (searchQuery.trim()) q.set('q', searchQuery.trim())

      const res = await authFetch(`${API_BASE}/admin/vault/secrets?${q.toString()}`)
      if (res.ok) {
        setSecrets(await res.json())
      }
    } catch {
      toast.error('Failed to load secrets.')
    } finally {
      setLoadingSecrets(false)
    }
  }, [authFetch, currentProject, currentEnv, selectedType, searchQuery])

  const fetchAccessRequests = useCallback(async () => {
    setLoadingRequests(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/vault/access-requests`)
      if (res.ok) {
        setAccessRequests(await res.json())
      }
    } catch {
      // silent
    } finally {
      setLoadingRequests(false)
    }
  }, [authFetch])

  useEffect(() => {
    fetchEnvironments()
    fetchProjects()
    fetchAccessRequests()
  }, [fetchEnvironments, fetchProjects, fetchAccessRequests])

  useEffect(() => {
    fetchSecrets()
  }, [fetchSecrets])

  const pendingRequestsCount = useMemo(
    () => accessRequests.filter((r) => r.status === 'pending').length,
    [accessRequests],
  )

  const pamGuardedCount = useMemo(
    () => secrets.filter((s) => s.requires_approval).length,
    [secrets],
  )

  const totalSecretsCount = useMemo(() => {
    const sum = environments.reduce((acc, e) => acc + (e.secrets_count ?? 0), 0)
    return currentEnv === 'all' ? secrets.length : sum
  }, [environments, secrets, currentEnv])

  async function revealSecretPlaintext(s: VaultSecret): Promise<string | null> {
    if (revealedMap[s.id]) return revealedMap[s.id]
    setRevealingId(s.id)
    try {
      const res = await authFetch(`${API_BASE}/admin/vault/secrets/${s.id}/reveal`)
      const data = await res.json()
      if (res.ok && data.value) {
        setRevealedMap((prev) => ({ ...prev, [s.id]: data.value }))
        return data.value
      } else if (res.status === 403 && data.status === 'requires_pam_approval') {
        toast.warning('PAM Protected: You need to request access approval first.')
        setPamTargetSecret(s)
        setShowPamDialog(true)
      } else {
        toast.error(data.message || 'Access denied.')
      }
    } catch {
      toast.error('Failed to decrypt secret.')
    } finally {
      setRevealingId(null)
    }
    return null
  }

  async function handleToggleReveal(s: VaultSecret) {
    if (revealedMap[s.id]) {
      setRevealedMap((prev) => {
        const next = { ...prev }
        delete next[s.id]
        return next
      })
      return
    }
    const val = await revealSecretPlaintext(s)
    if (val) toast.success(`Secret "${s.name}" decrypted.`)
  }

  async function handleCopy(s: VaultSecret) {
    const val = await revealSecretPlaintext(s)
    if (val) {
      navigator.clipboard.writeText(val)
      toast.success(`Copied "${s.name}" to clipboard.`)
    }
  }

  async function handleDeleteSecret(id: string) {
    if (!confirm('Are you sure you want to permanently delete this secret and all versions?')) return
    try {
      const res = await authFetch(`${API_BASE}/admin/vault/secrets/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Secret permanently deleted.')
        fetchSecrets()
        fetchEnvironments()
        fetchProjects()
      } else {
        toast.error('Failed to delete secret.')
      }
    } catch {
      toast.error('Error deleting secret.')
    }
  }

  async function handleDownload(s: VaultSecret, mode: 'file' | 'bundle' = 'file') {
    const plaintext = await revealSecretPlaintext(s)
    if (!plaintext) return
    try {
      if (s.secret_type === 'keystore' && (mode === 'bundle' || s.metadata?.key_alias || s.metadata?.store_password)) {
        downloadKeyStoreBundle(s, plaintext)
        toast.success(`Downloaded ${s.name} bundle (.zip) with credentials`)
      } else {
        downloadSecretFile(s, plaintext)
        toast.success(`Downloaded ${s.name}`)
      }
    } catch {
      toast.error('Failed to prepare download file.')
    }
  }

  const realtimeEnvCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of environments) counts[e.slug] = e.secrets_count ?? 0
    if (currentEnv === 'all') {
      const live: Record<string, number> = {}
      for (const s of secrets) live[s.environment] = (live[s.environment] || 0) + 1
      for (const e of environments) counts[e.slug] = live[e.slug] ?? 0
    } else {
      counts[currentEnv] = secrets.length
    }
    return counts
  }, [environments, secrets, currentEnv])

  const currentEnvName = useMemo(() => {
    if (currentEnv === 'all') return 'All Environments'
    const found = environments.find((e) => e.slug === currentEnv)
    return found ? found.name : currentEnv
  }, [currentEnv, environments])

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50">
      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-4">
        {/* Top Header */}
        <VaultHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          totalSecrets={totalSecretsCount}
          pamGuardedCount={pamGuardedCount}
          pendingRequestsCount={pendingRequestsCount}
          onOpenCreate={() => setShowCreateDialog(true)}
          onOpenImport={() => setShowImportDialog(true)}
          onOpenExport={() => setShowExportDialog(true)}
          onRefresh={() => {
            fetchProjects()
            fetchSecrets()
            fetchEnvironments()
            fetchAccessRequests()
          }}
          loading={loadingSecrets}
        />

        {/* Main Content Area */}
        <main>
          {activeTab === 'pam' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Privileged Access Management (PAM) Elevation Queue
                </span>
              </div>
              <AccessRequestsTable
                requests={accessRequests}
                loading={loadingRequests}
                apiBase={API_BASE}
                authFetch={authFetch}
                onRefresh={() => {
                  fetchAccessRequests()
                  fetchSecrets()
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Project Switcher & Environment Bar Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <ProjectSwitcher
                  projects={projects}
                  currentProject={currentProject}
                  onSelectProject={setCurrentProject}
                  onOpenCreateProject={() => {
                    setManageProjectsInitialTab('create')
                    setShowManageProjectsDialog(true)
                  }}
                  onOpenManageProjects={() => {
                    setManageProjectsInitialTab('list')
                    setShowManageProjectsDialog(true)
                  }}
                  totalAllSecrets={totalSecretsCount}
                />

                <EnvironmentBar
                  environments={environments}
                  currentEnv={currentEnv}
                  onSelectEnv={setCurrentEnv}
                  onOpenManageEnv={() => setShowManageEnvDialog(true)}
                  totalCount={totalSecretsCount}
                  counts={realtimeEnvCounts}
                />
              </div>

              {/* Filter and Search Bar */}
              <VaultFilterBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedType={selectedType}
                onSelectType={setSelectedType}
              />

              {/* Secrets Table */}
              <SecretsTable
                secrets={secrets}
                projects={projects}
                currentProject={currentProject}
                revealedMap={revealedMap}
                revealingId={revealingId}
                currentEnv={currentEnv}
                envLabel={currentEnvName}
                onToggleReveal={handleToggleReveal}
                onCopy={handleCopy}
                onDownload={handleDownload}
                onSelectDetail={(s) => {
                  setSelectedSecret(s)
                  setShowDetailDialog(true)
                }}
                onDelete={handleDeleteSecret}
                onOpenCreate={() => setShowCreateDialog(true)}
                onOpenImport={() => setShowImportDialog(true)}
              />
            </div>
          )}
        </main>

        {/* Modals & Dialogs */}
        <CreateSecretDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          projects={projects}
          currentProject={currentProject}
          environments={environments}
          currentEnv={currentEnv}
          apiBase={API_BASE}
          authFetch={authFetch}
          onSecretCreated={() => {
            fetchSecrets()
            fetchEnvironments()
            fetchProjects()
          }}
        />

        <SecretDetailDialog
          open={showDetailDialog}
          onClose={() => setShowDetailDialog(false)}
          secret={selectedSecret}
          apiBase={API_BASE}
          authFetch={authFetch}
          onSecretUpdated={() => {
            fetchSecrets()
            fetchEnvironments()
            fetchProjects()
          }}
          onDeleteRequested={handleDeleteSecret}
          onDownload={handleDownload}
        />

        <AccessRequestDialog
          open={showPamDialog}
          onClose={() => setShowPamDialog(false)}
          secret={pamTargetSecret}
          environment={currentEnv}
          apiBase={API_BASE}
          authFetch={authFetch}
          onRequestCreated={fetchAccessRequests}
        />

        <ImportExportDialog
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          projects={projects}
          currentProject={currentProject}
          environments={environments}
          currentEnv={currentEnv}
          mode="import"
          apiBase={API_BASE}
          authFetch={authFetch}
          onImportComplete={() => {
            fetchSecrets()
            fetchEnvironments()
            fetchProjects()
          }}
        />

        <ExportSecretsDialog
          open={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          projects={projects}
          currentProject={currentProject}
          environments={environments}
          currentEnv={currentEnv}
          apiBase={API_BASE}
          authFetch={authFetch}
        />

        <ManageEnvironmentsDialog
          open={showManageEnvDialog}
          onClose={() => setShowManageEnvDialog(false)}
          environments={environments}
          apiBase={API_BASE}
          authFetch={authFetch}
          onEnvironmentsUpdated={() => {
            fetchEnvironments()
            fetchSecrets()
          }}
        />

        <ManageProjectsDialog
          open={showManageProjectsDialog}
          onClose={() => setShowManageProjectsDialog(false)}
          projects={projects}
          apiBase={API_BASE}
          authFetch={authFetch}
          onProjectsUpdated={() => {
            fetchProjects()
            fetchSecrets()
          }}
          initialTab={manageProjectsInitialTab}
        />
      </div>
    </div>
  )
}
