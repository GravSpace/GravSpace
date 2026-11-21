import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, Users, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useAuth } from '../../hooks/useAuth'
import type { IamUser, Policy } from '../../components/user/userTypes'
import { CreateUserDialog } from '../../components/user/CreateUserDialog'
import { ChangePasswordDialog } from '../../components/user/ChangePasswordDialog'
import { AttachPolicyDialog } from '../../components/user/AttachPolicyDialog'
import { UserCard } from '../../components/user/UserCard'
import { NewKeyDialog } from '../../components/user/NewKeyDialog'

export const Route = createFileRoute('/admin/users')({
  component: UsersPage,
  head: () => ({ meta: [{ title: 'IAM Engine | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

function UsersPage() {
  const { authFetch } = useAuth()
  const [users, setUsers] = useState<Record<string, IamUser>>({})
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState('')
  const [showPolicyDialog, setShowPolicyDialog] = useState(false)
  const [policyTarget, setPolicyTarget] = useState('')
  const [policyTemplates, setPolicyTemplates] = useState<Policy[]>([])
  const [newKeyInfo, setNewKeyInfo] = useState<{
    open: boolean
    username: string
    accessKeyId: string
    secretAccessKey: string
  }>({ open: false, username: '', accessKeyId: '', secretAccessKey: '' })

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/users`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          const map: Record<string, IamUser> = {}
          data.forEach((u: any) => {
            if (u?.username) map[u.username] = u
          })
          setUsers(map)
        } else {
          setUsers(data || {})
        }
      }
    } catch {
      toast.error('Failed to sync users.')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  const fetchPolicyTemplates = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/admin/policies`)
      if (res.ok) setPolicyTemplates(await res.json())
    } catch {}
  }, [authFetch])

  useEffect(() => {
    fetchUsers()
    fetchPolicyTemplates()
  }, [fetchUsers, fetchPolicyTemplates])

  const filteredUsers = Object.entries(users).filter(([username]) =>
    username.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  async function handleCreateUser(username: string) {
    try {
      const res = await authFetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (res.ok) {
        toast.success(`Principal "${username}" initialized.`)
        fetchUsers()
      } else {
        const err = await res.text()
        toast.error(`Provisioning failed: ${err}`)
      }
    } catch {
      toast.error('Failed to provision user.')
    }
  }

  async function handleDeleteUser(username: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/users/${username}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed')
        fetchUsers()
      },
      { loading: `Purging "${username}"...`, success: 'User eradicated.', error: 'Failed to purge user.' },
    )
  }

  async function handleGenerateKey(username: string) {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${username}/keys`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.text()
        toast.error(`Failed to issue key: ${err}`)
        return
      }
      const data = await res.json()
      const accessKeyId = data.accessKeyId || data.access_key_id || ''
      const secretAccessKey = data.secretAccessKey || data.secret_access_key || data.secretKey || ''
      setNewKeyInfo({
        open: true,
        username,
        accessKeyId,
        secretAccessKey,
      })
      toast.success('New access key pair minted.')
      fetchUsers()
    } catch {
      toast.error('Failed to issue key.')
    }
  }

  async function handleDeleteKey(username: string, keyId: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/keys/${keyId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed')
        fetchUsers()
      },
      { loading: `Revoking key "${keyId.slice(0, 12)}..."`, success: 'Access key revoked.', error: 'Failed to revoke key.' },
    )
  }

  async function handleChangePassword(password: string) {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${passwordTarget}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) toast.success(`Password reset for "${passwordTarget}".`)
      else toast.error('Failed to update password.')
    } catch {
      toast.error('Failed to reset credentials.')
    }
  }

  async function handleAttachTemplate(templateName: string) {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${policyTarget}/policies/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName }),
      })
      if (res.ok) {
        toast.success('Policy attached.')
        fetchUsers()
      } else {
        const err = await res.text()
        toast.error(`Failed: ${err}`)
      }
    } catch {
      toast.error('Failed to attach policy.')
    }
  }

  async function handleAttachInline(policy: any) {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${policyTarget}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      })
      if (res.ok) {
        toast.success('Inline policy attached.')
        fetchUsers()
      } else {
        const err = await res.text()
        toast.error(`Failed: ${err}`)
      }
    } catch {
      toast.error('Failed to attach inline policy.')
    }
  }

  async function handleRemovePolicy(username: string, policyName: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/policies/${policyName}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed')
        fetchUsers()
      },
      { loading: `Removing policy "${policyName}"...`, success: 'Policy removed.', error: 'Failed to remove policy.' },
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Identity & Access Management</h1>
          <p className="text-xs text-muted-foreground">Control security credentials and access permissions.</p>
        </div>
        <div className="flex items-center gap-3" suppressHydrationWarning>
          <div className="relative" suppressHydrationWarning>
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter principals..."
              autoComplete="off"
              data-protonpass-ignore="true"
              data-1p-ignore="true"
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" className="h-8" onClick={() => setShowCreateDialog(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-2" />
            Provision User
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-3">
        {filteredUsers.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 opacity-20" />
            </div>
            <span className="text-sm font-medium">
              {searchQuery ? 'No matching principals' : 'No principals configured'}
            </span>
            <span className="text-xs opacity-60 mt-1">
              {searchQuery ? 'Try adjusting your search' : 'Create your first user to get started'}
            </span>
          </div>
        )}

        {filteredUsers.map(([username, user]) => (
          <UserCard
            key={username}
            username={username}
            user={user}
            onGenerateKey={handleGenerateKey}
            onDeleteKey={handleDeleteKey}
            onChangePassword={(name) => { setPasswordTarget(name); setShowPasswordDialog(true) }}
            onDeleteUser={handleDeleteUser}
            onAttachPolicy={(name) => { setPolicyTarget(name); setShowPolicyDialog(true) }}
            onRemovePolicy={handleRemovePolicy}
          />
        ))}
      </main>

      <CreateUserDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateUser}
      />

      <ChangePasswordDialog
        open={showPasswordDialog}
        targetUser={passwordTarget}
        onClose={() => setShowPasswordDialog(false)}
        onSave={handleChangePassword}
      />

      <AttachPolicyDialog
        open={showPolicyDialog}
        targetUser={policyTarget}
        templates={policyTemplates}
        onClose={() => setShowPolicyDialog(false)}
        onAttachTemplate={handleAttachTemplate}
        onAttachInline={handleAttachInline}
      />

      <NewKeyDialog
        open={newKeyInfo.open}
        onClose={() => setNewKeyInfo((prev) => ({ ...prev, open: false }))}
        username={newKeyInfo.username}
        accessKeyId={newKeyInfo.accessKeyId}
        secretAccessKey={newKeyInfo.secretAccessKey}
      />
    </div>
  )
}
