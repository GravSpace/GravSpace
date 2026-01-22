<template>
  <div class="app-container">
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-icon">▲</div>
        GravityStore
      </div>
      <nav>
        <div class="nav-item" :class="{ active: currentTab === 'buckets' }" @click="currentTab = 'buckets'">Dashboard
        </div>
        <div class="nav-item" :class="{ active: currentTab === 'users' }" @click="currentTab = 'users'">Users & Keys
        </div>
        <div class="nav-item" :class="{ active: currentTab === 'policies' }" @click="currentTab = 'policies'">Policies
        </div>
        <div class="nav-item">Settings</div>
      </nav>
    </aside>
    <main class="main-content">
      <!-- BUCKETS TAB -->
      <div v-if="currentTab === 'buckets'">
        <header class="header">
          <h1>Buckets</h1>
          <button class="btn btn-primary" @click="createBucket">Create Bucket</button>
        </header>

        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Objects</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="bucket in buckets" :key="bucket">
                <td>
                  <span style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"
                    @click="selectBucket(bucket)">
                    📁 {{ bucket }}
                  </span>
                </td>
                <td>-</td>
                <td>-</td>
                <td>
                  <span v-if="isPublic(bucket)" class="badge"
                    style="background: rgba(52, 211, 153, 0.1); color: #34d399; margin-right: 0.5rem;">Public</span>
                  <button class="btn btn-small btn-secondary" style="margin-right: 0.5rem;"
                    @click="togglePublic(bucket)">{{ isPublic(bucket) ? 'Make Private' : 'Make Public' }}</button>
                  <button class="btn btn-small" @click="deleteBucket(bucket)">Delete</button>
                </td>
              </tr>
              <tr v-if="buckets.length === 0">
                <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 3rem;">
                  No buckets found. Create one to get started.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="selectedBucket" class="card" style="margin-top: 2rem;">
          <div class="header">
            <h2>Objects in {{ selectedBucket }}</h2>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary" @click="createFolder">New Folder</button>
              <input type="file" @change="uploadFile" style="display: none;" ref="fileInput">
              <button class="btn btn-primary" @click="$refs.fileInput.click()">Upload Object</button>
            </div>
          </div>

          <!-- BREADCRUMBS -->
          <div class="breadcrumbs">
            <span class="breadcrumb-item" @click="navigateTo('')">{{ selectedBucket }}</span>
            <template v-for="(part, i) in currentPrefix.split('/').filter(p => p)" :key="part">
              <span class="separator">/</span>
              <span class="breadcrumb-item"
                @click="navigateTo(currentPrefix.split('/').slice(0, i + 1).join('/') + '/')">{{ part }}</span>
            </template>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <!-- COMMON PREFIXES (FOLDERS) -->
              <tr v-for="cp in commonPrefixes" :key="cp">
                <td>
                  <span style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"
                    @click="navigateTo(cp)">
                    📁 {{cp.split('/').filter(p => p).pop()}}
                  </span>
                </td>
                <td>-</td>
                <td>
                  <button v-if="!isPublic(selectedBucket, cp)" class="btn btn-small btn-secondary"
                    @click="togglePublic(selectedBucket, cp)">Make Public</button>
                  <span v-else class="badge" style="background: rgba(52, 211, 153, 0.1); color: #34d399;">Public</span>
                </td>
              </tr>

              <!-- OBJECTS -->
              <template v-for="obj in objects" :key="obj.Key">
                <template v-if="!obj.Key.endsWith('/')">
                  <tr>
                    <td>{{ obj.Key.replace(currentPrefix, '') }}</td>
                    <td>{{ formatSize(obj.Size) }}</td>
                    <td>
                      <button class="btn btn-small btn-secondary" @click="previewObject = { key: obj.Key }"
                        style="margin-right: 0.5rem;">Preview</button>
                      <button class="btn btn-small" @click="downloadObject(obj.Key)"
                        style="margin-right: 0.5rem;">Download</button>
                      <button class="btn btn-small btn-secondary" @click="fetchVersions(obj.Key)"
                        style="margin-right: 0.5rem;">History</button>
                      <button class="btn btn-small btn-secondary" @click="copyPresignedUrl(obj.Key)">Copy Link</button>
                    </td>
                  </tr>
                  <tr v-if="objectVersions[obj.Key]" class="row-expanded">
                    <td colspan="3" style="background: rgba(0,0,0,0.2); padding: 0.5rem 1rem;">
                      <div v-for="v in objectVersions[obj.Key]" :key="v.VersionId" class="version-item">
                        <span style="flex: 1;">ID: <code>{{ v.VersionId }}</code></span>
                        <span style="flex: 1;">{{ formatSize(v.Size) }}</span>
                        <span style="flex: 2;">{{ v.LastModified }}</span>
                        <span v-if="v.IsLatest" class="badge">Latest</span>
                        <div style="display: flex; gap: 0.5rem;">
                          <button class="btn btn-small btn-secondary"
                            @click="previewObject = { key: obj.Key, versionId: v.VersionId }">Preview</button>
                          <button class="btn btn-small" @click="downloadObject(obj.Key, v.VersionId)">Download</button>
                          <button class="btn btn-small btn-secondary"
                            @click="copyPresignedUrl(obj.Key, v.VersionId)">Copy Link</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- USERS TAB -->
      <div v-if="currentTab === 'users'">
        <header class="header">
          <h1>Users & Access Keys</h1>
          <button class="btn btn-primary" @click="createUser">Create User</button>
        </header>

        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Keys</th>
                <th>Policies</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(user, username) in users" :key="username">
                <td>
                  <strong>{{ username }}</strong>
                  <span v-if="username === 'anonymous'" class="policy-badge"
                    style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-color: rgba(59, 130, 246, 0.2); margin-left: 0.5rem;">Anonymous
                    Access</span>
                </td>
                <td>
                  <div v-for="key in user.accessKeys" :key="key.accessKeyId" class="key-item">
                    ID: <code>{{ key.accessKeyId }}</code><br>
                    Secret: <code>{{ key.secretAccessKey }}</code>
                  </div>
                  <div v-if="user.accessKeys.length === 0 && username !== 'anonymous'" style="color: var(--text-dim);">
                    No
                    keys.</div>
                  <div v-if="username === 'anonymous'" style="color: var(--text-dim); font-style: italic;">No keys
                    required
                    for anonymous access</div>
                </td>
                <td>
                  <div v-for="p in user.policies" :key="p.name" class="policy-badge">
                    🛡️ {{ p.name }}
                    <span v-if="username !== 'admin'" @click="removePolicy(username, p.name)"
                      style="margin-left: 0.5rem; cursor: pointer; opacity: 0.6;">✕</span>
                  </div>
                  <button class="btn btn-small btn-secondary" style="margin-top: 0.5rem;"
                    @click="openPolicyModal(username)">Attach Policy</button>
                </td>
                <td>
                  <template v-if="username !== 'anonymous' && username !== 'admin'">
                    <button class="btn btn-small" @click="generateKey(username)">+ Key</button>
                    <button class="btn btn-small" style="margin-left: 0.5rem;"
                      @click="deleteUser(username)">Delete</button>
                  </template>
                  <template v-else-if="username === 'admin'">
                    <span style="color: var(--text-dim);">System Admin</span>
                  </template>
                  <template v-else>
                    <span style="color: var(--text-dim);">Built-in Account</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- POLICIES TAB -->
      <div v-if="currentTab === 'policies'">
        <header class="header">
          <h1>IAM Policies</h1>
          <button class="btn btn-primary" @click="showPolicyModal = true; selectedUserForPolicy = null">Create
            Policy</button>
        </header>
        <div class="card">
          <p style="color: var(--text-dim); padding: 1rem;">Policies define permissions for users. You can attach these
            to any
            user.</p>
          <table class="table">
            <thead>
              <tr>
                <th>Policy Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>AdministratorAccess</code> (Default)</td>
                <td>-</td>
              </tr>
              <tr v-for="policy in policies" :key="policy.name">
                <td>{{ policy.name }}</td>
                <td>
                  <button class="btn btn-small" @click="deletePolicy(policy.name)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- PREVIEW MODAL -->
      <div v-if="previewObject" class="modal-overlay" @click="previewObject = null">
        <div class="modal-content card" @click.stop>
          <div class="header">
            <h3>Preview: {{ previewObject.key }}</h3>
            <button class="btn" @click="previewObject = null">Close</button>
          </div>
          <div class="preview-body">
            <img v-if="isImage(previewObject.key)"
              :src="previewUrl || 'https://via.placeholder.com/150?text=Loading...'" class="preview-img" />
            <div v-else class="preview-placeholder">
              Preview not available for this file type.
              <br><br>
              <button class="btn btn-primary"
                @click="downloadObject(previewObject.key, previewObject.versionId)">Download to
                View</button>
            </div>
          </div>
        </div>
      </div>

      <!-- POLICY MODAL -->
      <div v-if="showPolicyModal" class="modal-overlay">
        <div class="card modal-content" style="max-width: 600px;">
          <div class="header">
            <h2>{{ selectedUserForPolicy ? 'Attach Policy to ' + selectedUserForPolicy : 'Create Policy' }}</h2>
            <button class="btn" @click="showPolicyModal = false">Close</button>
          </div>
          <div style="padding: 1rem;">
            <div style="margin-bottom: 1rem;" v-if="!selectedUserForPolicy">
              <label style="display: block; margin-bottom: 0.5rem;">Policy Name</label>
              <input type="text" class="input" v-model="policyName" placeholder="e.g. ReadOnlyAccess">
            </div>
            <label style="display: block; margin-bottom: 0.5rem;">Policy JSON</label>
            <textarea class="input" v-model="newPolicyJson" rows="10" style="font-family: monospace;"></textarea>
            <button class="btn btn-primary" style="margin-top: 1rem; width: 100%;" @click="attachPolicy">Attach / Create
              Policy</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const currentTab = ref('buckets')
const buckets = ref([])
const selectedBucket = ref(null)
const currentPrefix = ref('')
const objects = ref([])
const commonPrefixes = ref([])
const objectVersions = ref({}) // key -> versions
const previewObject = ref(null)
const previewUrl = ref(null)
const users = ref({})
const showPolicyModal = ref(false)
const selectedUserForPolicy = ref(null)
const policyName = ref('')
const newPolicyJson = ref(JSON.stringify({
  Name: "PublicAccess",
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Action: ["s3:GetObject", "s3:ListBucket"],
    Resource: ["arn:aws:s3:::your-bucket-name/*"]
  }]
}, null, 2))

const fileInput = ref(null)

const API_BASE = 'http://localhost:8080'

// Hardcoded admin creds for demo S3 requests since we just implemented auth
// In a real app, these would come from a login session
const ADMIN_KEY_ID = 'admin'
const ADMIN_SECRET = 'adminsecret' // Not used in simplified auth but good for reference

async function authFetch(url, options = {}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStamp = `${year}${month}${day}`;

  options.headers = {
    ...options.headers,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${ADMIN_KEY_ID}/${dateStamp}/us-east-1/s3/aws4_request`
  }

  if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json'
  }

  return fetch(url, options)
}

watch(previewObject, async (newVal) => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }

  if (newVal && isImage(newVal.key)) {
    try {
      const url = getPreviewUrl(newVal.key, newVal.versionId)
      const res = await authFetch(url)
      const blob = await res.blob()
      previewUrl.value = URL.createObjectURL(blob)
    } catch (e) {
      console.error('Failed to load preview', e)
    }
  }
})

async function fetchBuckets() {
  try {
    const res = await authFetch(`${API_BASE}/`)
    const text = await res.text()
    const matches = text.match(/<Name>(.*?)<\/Name>/g)
    if (matches) {
      buckets.value = matches.map(m => m.replace(/<\/?Name>/g, ''))
    } else {
      buckets.value = []
    }
  } catch (e) {
    console.error('Failed to fetch buckets', e)
  }
}

async function createBucket() {
  const name = prompt('Bucket Name:')
  if (!name) return
  await authFetch(`${API_BASE}/${name}`, { method: 'PUT' })
  await fetchBuckets()
}

async function deleteBucket(name) {
  if (!confirm(`Delete bucket ${name}?`)) return
  await authFetch(`${API_BASE}/${name}`, { method: 'DELETE' })
  await fetchBuckets()
}

async function selectBucket(name) {
  selectedBucket.value = name
  currentPrefix.value = ''
  objectVersions.value = {}
  await fetchObjects()
}

async function fetchObjects() {
  if (!selectedBucket.value) return
  const url = `${API_BASE}/${selectedBucket.value}?delimiter=/&prefix=${encodeURIComponent(currentPrefix.value)}`
  const res = await authFetch(url)
  const text = await res.text()

  const keys = text.match(/<Key>(.*?)<\/Key>/g)?.map(m => m.replace(/<\/?Key>/g, '')) || []
  const sizes = text.match(/<Size>(.*?)<\/Size>/g)?.map(m => m.replace(/<\/?Size>/g, '')) || []
  const cps = text.match(/<Prefix>(.*?)<\/Prefix>/g)?.map(m => m.replace(/<\/?Prefix>/g, '')) || []

  // Filter out the prefix itself if it appears as a key (S3 does this sometimes)
  objects.value = keys
    .filter(k => k !== currentPrefix.value)
    .map((key, i) => ({
      Key: key,
      Size: parseInt(sizes[i] || 0)
    }))

  // Filter out the current prefix from common prefixes
  commonPrefixes.value = cps.filter(p => p !== currentPrefix.value)
}

function navigateTo(p) {
  currentPrefix.value = p
  objectVersions.value = {}
  fetchObjects()
}

async function createFolder() {
  const name = prompt('Folder Name:')
  if (!name) return
  const key = currentPrefix.value + name + '/'
  await authFetch(`${API_BASE}/${selectedBucket.value}/${key}`, { method: 'PUT' })
  await fetchObjects()
}

async function fetchVersions(key) {
  if (objectVersions.value[key]) {
    const next = { ...objectVersions.value }
    delete next[key]
    objectVersions.value = next
    return
  }
  const res = await authFetch(`${API_BASE}/${selectedBucket.value}?versions&prefix=${encodeURIComponent(key)}`)
  const text = await res.text()

  // Extract <Version> blocks
  const versionBlocks = text.match(/<Version>(.*?)<\/Version>/g) || []

  objectVersions.value = {
    ...objectVersions.value,
    [key]: versionBlocks.map(block => {
      const vid = block.match(/<VersionId>(.*?)<\/VersionId>/)?.[1] || ''
      const size = block.match(/<Size>(.*?)<\/Size>/)?.[1] || '0'
      const date = block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] || ''
      const latest = block.match(/<IsLatest>(.*?)<\/IsLatest>/)?.[1] || 'false'

      return {
        VersionId: vid,
        Size: parseInt(size),
        LastModified: date,
        IsLatest: latest === 'true'
      }
    })
  }
}

function isImage(key) {
  const ext = key.split('.').pop().toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)
}

function getPreviewUrl(key, versionId = '') {
  let url = `${API_BASE}/${selectedBucket.value}/${key}`
  if (versionId) url += `?versionId=${versionId}`
  return url
}

async function uploadFile(event) {
  const file = event.target.files[0]
  if (!file || !selectedBucket.value) return

  const key = currentPrefix.value + file.name
  await authFetch(`${API_BASE}/${selectedBucket.value}/${key}`, {
    method: 'PUT',
    body: file
  })
  await fetchObjects()
}

function downloadObject(key, versionId = '') {
  // Download needs auth too, but window.open doesn't easily set headers
  // For simplicity in this demo, we'll just use the URL
  let url = `${API_BASE}/${selectedBucket.value}/${key}`
  if (versionId) url += `?versionId=${versionId}`
  window.open(url)
}

// ADMIN FUNCTIONS
async function fetchUsers() {
  const res = await authFetch(`${API_BASE}/admin/users`)
  users.value = await res.json()
}

async function createUser() {
  const username = prompt('Username:')
  if (!username) return
  await authFetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    body: JSON.stringify({ username })
  })
  await fetchUsers()
}

async function deleteUser(username) {
  if (!confirm(`Delete user ${username}?`)) return
  await authFetch(`${API_BASE}/admin/users/${username}`, { method: 'DELETE' })
  await fetchUsers()
}

async function generateKey(username) {
  await authFetch(`${API_BASE}/admin/users/${username}/keys`, { method: 'POST' })
  await fetchUsers()
}

function openPolicyModal(username) {
  selectedUserForPolicy.value = username
  showPolicyModal.value = true
}

async function attachPolicy() {
  try {
    const policy = JSON.parse(newPolicyJson.value)
    if (!selectedUserForPolicy.value) {
      alert("Global policies not yet supported. Please attach to a user.")
      return
    }

    await authFetch(`${API_BASE}/admin/users/${selectedUserForPolicy.value}/policies`, {
      method: 'POST',
      body: JSON.stringify(policy)
    })

    showPolicyModal.value = false
    await fetchUsers()
  } catch (e) {
    alert("Invalid JSON: " + e.message)
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function isPublic(bucket, prefix = "") {
  const anon = users.value['anonymous']
  if (!anon || !anon.policies) return false

  const resource = "arn:aws:s3:::" + bucket + (prefix ? "/" + prefix : "/*")

  return anon.policies.some(p =>
    p.statement.some(s => {
      if (s.effect !== "Allow" || !s.action.includes("s3:GetObject")) return false

      return s.resource.some(r => {
        if (r === "*") return true
        if (r.endsWith("*")) {
          return resource.startsWith(r.slice(0, -1))
        }
        return r === resource
      })
    })
  )
}

async function togglePublic(bucket, prefix = "") {
  const currentlyPublic = isPublic(bucket, prefix)
  const resource = "arn:aws:s3:::" + bucket + (prefix ? "/" + prefix + "/*" : "/*")
  const policyName = `PublicAccess-${bucket}-${prefix.replace(/\//g, '-') || 'Root'}`

  if (currentlyPublic) {
    if (!confirm("Are you sure you want to make this private?")) return
    await authFetch(`${API_BASE}/admin/users/anonymous/policies/${policyName}`, {
      method: 'DELETE'
    })
    await fetchUsers()
  } else {
    const policy = {
      name: policyName,
      version: "2012-10-17",
      statement: [{
        effect: "Allow",
        action: ["s3:GetObject", "s3:ListBucket"],
        resource: [resource]
      }]
    }

    await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
      method: 'POST',
      body: JSON.stringify(policy)
    })
    await fetchUsers()
  }
}

async function copyPresignedUrl(key, versionId = null) {
  const isObjPublic = isPublic(selectedBucket.value, key)

  if (isObjPublic) {
    const baseUrl = `${window.location.protocol}//${window.location.host}/${selectedBucket.value}/${key}`
    let finalUrl = baseUrl
    if (versionId) finalUrl += (finalUrl.includes('?') ? '&' : '?') + `versionId=${versionId}`
    try {
      await navigator.clipboard.writeText(finalUrl)
      alert("Public link copied to clipboard!")
    } catch (err) {
      alert("Failed to copy: " + err)
    }
    return
  }

  // Fetch from backend for private/presigned
  let url = `${API_BASE}/admin/presign?bucket=${selectedBucket.value}&key=${key}`
  if (versionId) url += `&versionId=${versionId}`

  try {
    const res = await authFetch(url)
    if (!res.ok) throw new Error("Failed to generate presigned URL")
    const data = await res.json()
    await navigator.clipboard.writeText(data.url)
    alert("Presigned URL copied to clipboard!")
  } catch (err) {
    alert("Error: " + err.message)
  }
}

watch(currentTab, (newTab) => {
  if (newTab === 'buckets') fetchBuckets()
  if (newTab === 'users') fetchUsers()
})

onMounted(() => {
  fetchBuckets()
  fetchUsers()
})
</script>

<style>
.logo-icon {
  background: var(--primary);
  color: white;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 1.2rem;
}
</style>
