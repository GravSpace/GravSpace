import { useState, useMemo, useCallback } from 'react'
import type { S3Object } from '../../routes/admin/buckets/$bucket'
import { toast } from 'sonner'
import { formatPreviewFileSize } from './PreviewContent'

export interface BatchItemDetail {
  key: string
  isFolder: boolean
  size?: number
  formattedSize?: string
  prefix: string
  name: string
}

export interface BatchItemSummary {
  keys: string[]
  count: number
  filesCount: number
  foldersCount: number
  totalBytes: number
  formattedSize: string
  hasFolders: boolean
  items: BatchItemDetail[]
}

export function useBatchOperations(
  items: (S3Object | string)[],
  externalSelected?: Set<string>,
  onExternalChange?: (keys: Set<string>) => void,
) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set())
  const selectedKeys = externalSelected ?? internalSelected
  const setSelectedKeys = onExternalChange ?? setInternalSelected
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)

  // Map of items for quick lookup of file sizes and types
  const itemsMap = useMemo(() => {
    const map = new Map<string, S3Object | null>()
    for (const item of items) {
      if (typeof item === 'string') {
        map.set(item, null)
      } else {
        map.set(item.Key, item)
      }
    }
    return map
  }, [items])

  const summary = useMemo<BatchItemSummary>(() => {
    let filesCount = 0
    let foldersCount = 0
    let totalBytes = 0
    const keys: string[] = []
    const itemDetails: BatchItemDetail[] = []

    for (const key of selectedKeys) {
      keys.push(key)
      if (key.endsWith('/')) {
        foldersCount++
        const cleanKey = key.slice(0, -1)
        const lastSlash = cleanKey.lastIndexOf('/')
        const prefix = lastSlash >= 0 ? cleanKey.slice(0, lastSlash + 1) : ''
        const name = lastSlash >= 0 ? cleanKey.slice(lastSlash + 1) : cleanKey
        itemDetails.push({ key, isFolder: true, prefix, name: name + '/' })
      } else {
        filesCount++
        const obj = itemsMap.get(key)
        const size = obj?.Size ?? 0
        totalBytes += size
        const lastSlash = key.lastIndexOf('/')
        const prefix = lastSlash >= 0 ? key.slice(0, lastSlash + 1) : ''
        const name = lastSlash >= 0 ? key.slice(lastSlash + 1) : key
        itemDetails.push({
          key,
          isFolder: false,
          size,
          formattedSize: formatPreviewFileSize(size),
          prefix,
          name,
        })
      }
    }

    return {
      keys,
      count: selectedKeys.size,
      filesCount,
      foldersCount,
      totalBytes,
      formattedSize: formatPreviewFileSize(totalBytes),
      hasFolders: foldersCount > 0,
      items: itemDetails,
    }
  }, [selectedKeys, itemsMap])

  const toggleKey = useCallback(
    (key: string) => {
      const next = new Set(selectedKeys)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      setSelectedKeys(next)
    },
    [selectedKeys, setSelectedKeys],
  )

  const toggleAll = useCallback((currentItems: (S3Object | string)[], checked: boolean) => {
    if (checked) {
      const allKeys = new Set<string>()
      for (const item of currentItems) {
        allKeys.add(typeof item === 'string' ? item : item.Key)
      }
      setSelectedKeys(allKeys)
    } else {
      setSelectedKeys(new Set())
    }
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  const executeBulkDelete = useCallback(
    async (
      apiBase: string,
      bucketName: string,
      authFetch: (url: string, init?: RequestInit) => Promise<Response>,
      onSuccess?: () => void,
    ) => {
      if (selectedKeys.size === 0) return
      setIsDeleting(true)
      const keys = Array.from(selectedKeys)
      try {
        const res = await authFetch(`${apiBase}/admin/buckets/${bucketName}/objects/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys }),
        })
        if (!res.ok) {
          const err = await res.text().catch(() => '')
          throw new Error(err || `Failed with status ${res.status}`)
        }
        toast.success(`Successfully deleted ${keys.length} items`)
        clearSelection()
        onSuccess?.()
      } catch (err: any) {
        toast.error(`Bulk delete failed: ${err.message || err}`)
      } finally {
        setIsDeleting(false)
      }
    },
    [selectedKeys, clearSelection],
  )

  return {
    selectedKeys,
    setSelectedKeys,
    summary,
    toggleKey,
    toggleAll,
    clearSelection,
    executeBulkDelete,
    isDeleting,
    isUpdatingVisibility,
    setIsUpdatingVisibility,
  }
}
