import { useCallback, useEffect, useState } from 'react'

export interface TransferItem {
  id: string
  name: string
  bucket: string
  progress: number
  status: 'uploading' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'paused'
  type: 'upload' | 'download'
  error?: string
  size: number
  abort?: () => void
  isMultipart?: boolean
  pause?: () => void
  resume?: () => void
}

// Global state singleton
let _transfers: TransferItem[] = []
let _showManager = false
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
}

function useGlobalTransfers() {
  const [transfers, setTransfers] = useState<TransferItem[]>(() => [..._transfers])
  const [showTransferManager, setShow] = useState(() => _showManager)

  useEffect(() => {
    const update = () => {
      setTransfers([..._transfers])
      setShow(_showManager)
    }
    _listeners.add(update)
    return () => { _listeners.delete(update) }
  }, [])

  return { transfers, showTransferManager }
}

export function useTransfers() {
  const { transfers, showTransferManager } = useGlobalTransfers()

  const setShowTransferManager = useCallback((val: boolean) => {
    _showManager = val
    notify()
  }, [])

  const addTransfer = useCallback(
    (item: Omit<TransferItem, 'progress' | 'status'>) => {
      _transfers = [
        {
          ...item,
          progress: 0,
          status: item.type === 'upload' ? 'uploading' : 'downloading',
        },
        ..._transfers,
      ]
      _showManager = true
      notify()
    },
    [],
  )

  const setAbort = useCallback((id: string, abort: () => void) => {
    const item = _transfers.find((t) => t.id === id)
    if (item) {
      item.abort = abort
      notify()
    }
  }, [])

  const updateProgress = useCallback((id: string, progress: number) => {
    const item = _transfers.find((t) => t.id === id)
    if (item) {
      item.progress = progress
      if (progress >= 100) item.status = 'completed'
      notify()
    }
  }, [])

  const setError = useCallback((id: string, error: string) => {
    const item = _transfers.find((t) => t.id === id)
    if (item) {
      item.status = 'error'
      item.error = error
      notify()
    }
  }, [])

  const removeTransfer = useCallback((id: string) => {
    const index = _transfers.findIndex((t) => t.id === id)
    if (index !== -1) {
      const item = _transfers[index]!
      if (
        (item.status === 'uploading' || item.status === 'downloading') &&
        item.abort
      ) {
        item.abort()
        item.status = 'cancelled'
      } else {
        _transfers = _transfers.filter((t) => t.id !== id)
      }
      notify()
    }
  }, [])

  const clearCompleted = useCallback(() => {
    _transfers = _transfers.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled',
    )
    notify()
  }, [])

  const setPauseResume = useCallback(
    (id: string, pause: () => void, resume: () => void) => {
      const item = _transfers.find((t) => t.id === id)
      if (item) {
        item.pause = pause
        item.resume = resume
        notify()
      }
    },
    [],
  )

  const pauseTransfer = useCallback((id: string) => {
    const item = _transfers.find((t) => t.id === id)
    if (item && item.pause && item.status === 'uploading') {
      item.pause()
      item.status = 'paused'
      notify()
    }
  }, [])

  const resumeTransfer = useCallback((id: string) => {
    const item = _transfers.find((t) => t.id === id)
    if (item && item.resume && item.status === 'paused') {
      item.status = 'uploading'
      item.resume()
      notify()
    }
  }, [])

  const activeTransfersCount = transfers.filter(
    (t) => t.status === 'uploading' || t.status === 'downloading',
  ).length

  return {
    transfers,
    showTransferManager,
    setShowTransferManager,
    addTransfer,
    setAbort,
    updateProgress,
    setError,
    removeTransfer,
    clearCompleted,
    activeTransfersCount,
    setPauseResume,
    pauseTransfer,
    resumeTransfer,
  }
}
