import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { encKey, extractDroppedFiles } from './bucketUploadHelpers'

interface UseBucketUploadsProps {
  bucketName: string
  currentPrefix: string
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  addTransfer: (item: any) => void
  updateProgress: (id: string, progress: number) => void
  setError: (id: string, error: string) => void
  fetchObjects: () => Promise<void>
}

export function useBucketUploads({
  bucketName,
  currentPrefix,
  apiBase,
  authFetch,
  addTransfer,
  updateProgress,
  setError,
  fetchObjects,
}: UseBucketUploadsProps) {
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (!files.length) return
      for (const file of files) {
        const key = currentPrefix + file.name
        const id = crypto.randomUUID()
        addTransfer({ id, name: file.name, bucket: bucketName, type: 'upload', size: file.size })
        try {
          const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/objects/${encKey(key)}`, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          })
          if (!res.ok) throw new Error(await res.text())
          updateProgress(id, 100)
          toast.success(`"${file.name}" uploaded successfully.`)
        } catch (err) {
          setError(id, String(err))
          toast.error(`Failed to upload "${file.name}"`)
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchObjects()
    },
    [currentPrefix, bucketName, apiBase, authFetch, addTransfer, updateProgress, setError, fetchObjects],
  )

  const uploadFolder = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (!files.length) return
      for (const file of files) {
        const relativePath = (file as any).webkitRelativePath || file.name
        const key = currentPrefix + relativePath
        const id = crypto.randomUUID()
        addTransfer({ id, name: relativePath, bucket: bucketName, type: 'upload', size: file.size })
        try {
          const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/objects/${encKey(key)}`, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          })
          if (!res.ok) throw new Error(await res.text())
          updateProgress(id, 100)
        } catch (err) {
          setError(id, String(err))
        }
      }
      if (folderInputRef.current) folderInputRef.current.value = ''
      toast.success('Folder uploaded successfully.')
      await fetchObjects()
    },
    [currentPrefix, bucketName, apiBase, authFetch, addTransfer, updateProgress, setError, fetchObjects],
  )

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      const droppedFiles = await extractDroppedFiles(e.dataTransfer)
      if (droppedFiles.length === 0) return

      for (const { file, path } of droppedFiles) {
        const key = currentPrefix + path
        const id = crypto.randomUUID()
        addTransfer({ id, name: path, bucket: bucketName, type: 'upload', size: file.size })
        try {
          const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/objects/${encKey(key)}`, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          })
          if (!res.ok) throw new Error(await res.text())
          updateProgress(id, 100)
        } catch (err) {
          setError(id, String(err))
        }
      }
      toast.success('Files uploaded successfully.')
      await fetchObjects()
    },
    [currentPrefix, bucketName, apiBase, authFetch, addTransfer, updateProgress, setError, fetchObjects],
  )

  return {
    dragActive,
    fileInputRef,
    folderInputRef,
    uploadFiles,
    uploadFolder,
    handleDrag,
    handleDrop,
  }
}
