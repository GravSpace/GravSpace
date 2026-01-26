import { ref, computed } from 'vue'

export interface TransferItem {
    id: string
    name: string
    bucket: string
    progress: number
    status: 'uploading' | 'downloading' | 'completed' | 'error'
    type: 'upload' | 'download'
    error?: string
    size: number
}

const transfers = ref<TransferItem[]>([])

export const useTransfers = () => {
    const addTransfer = (item: Omit<TransferItem, 'progress' | 'status'>) => {
        transfers.value.unshift({
            ...item,
            progress: 0,
            status: item.type === 'upload' ? 'uploading' : 'downloading'
        })
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
            transfers.value.splice(index, 1)
        }
    }

    const clearCompleted = () => {
        transfers.value = transfers.value.filter(u => u.status !== 'completed')
    }

    const activeTransfersCount = computed(() =>
        transfers.value.filter(u => u.status === 'uploading' || u.status === 'downloading').length
    )

    return {
        transfers,
        addTransfer,
        updateProgress,
        setError,
        removeTransfer,
        clearCompleted,
        activeTransfersCount
    }
}
