import { ref, computed } from 'vue'

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

const transfers = ref<TransferItem[]>([])
const showTransferManager = ref(false)

export const useTransfers = () => {
    const addTransfer = (item: Omit<TransferItem, 'progress' | 'status'>) => {
        transfers.value.unshift({
            ...item,
            progress: 0,
            status: item.type === 'upload' ? 'uploading' : 'downloading'
        })
        showTransferManager.value = true
    }

    const setAbort = (id: string, abort: () => void) => {
        const item = transfers.value.find(u => u.id === id)
        if (item) {
            item.abort = abort
        }
    }

    const updateProgress = (id: string, progress: number) => {
        const item = transfers.value.find(u => u.id === id)
        if (item) {
            item.progress = progress
            if (progress === 100) {
                item.status = 'completed'
            }
        }
    }

    const setError = (id: string, error: string) => {
        const item = transfers.value.find(u => u.id === id)
        if (item) {
            item.status = 'error'
            item.error = error
        }
    }

    const removeTransfer = (id: string) => {
        const index = transfers.value.findIndex(u => u.id === id)
        if (index !== -1) {
            const item = transfers.value[index]
            if (item && (item.status === 'uploading' || item.status === 'downloading') && item.abort) {
                item.abort()
                item.status = 'cancelled'
            } else {
                transfers.value.splice(index, 1)
            }
        }
    }

    const clearCompleted = () => {
        transfers.value = transfers.value.filter(u => u.status !== 'completed' && u.status !== 'cancelled')
    }

    const activeTransfersCount = computed(() =>
        transfers.value.filter(u => u.status === 'uploading' || u.status === 'downloading').length
    )

    const setPauseResume = (id: string, pause: () => void, resume: () => void) => {
        const item = transfers.value.find(u => u.id === id)
        if (item) {
            item.pause = pause
            item.resume = resume
        }
    }

    const pauseTransfer = (id: string) => {
        const item = transfers.value.find(u => u.id === id)
        if (item && item.pause && item.status === 'uploading') {
            item.pause()
            item.status = 'paused'
        }
    }

    const resumeTransfer = (id: string) => {
        const item = transfers.value.find(u => u.id === id)
        if (item && item.resume && item.status === 'paused') {
            item.status = 'uploading'
            item.resume()
        }
    }

    return {
        transfers,
        showTransferManager,
        addTransfer,
        setAbort,
        updateProgress,
        setError,
        removeTransfer,
        clearCompleted,
        activeTransfersCount,
        setPauseResume,
        pauseTransfer,
        resumeTransfer
    }
}
