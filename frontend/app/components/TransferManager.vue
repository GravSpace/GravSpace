<template>
    <div v-if="transfers.length > 0"
        class="fixed bottom-6 right-6 w-96 max-h-[500px] flex flex-col bg-[#1e2329] border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-50 transition-all duration-300 transform scale-100">

        <!-- HEADER -->
        <header class="h-14 px-4 flex items-center justify-between border-b border-white/5 bg-white/2">
            <h2 class="text-sm font-bold text-slate-100 tracking-wide uppercase">Transfers</h2>
            <button @click="clearCompleted"
                class="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all group"
                title="Clear Completed">
                <XCircle class="w-5 h-5 group-active:scale-95" />
            </button>
        </header>

        <!-- LIST -->
        <div class="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div v-for="transfer in transfers" :key="transfer.id" class="group relative">
                <div class="flex items-start gap-3">
                    <!-- STATUS ICON -->
                    <div class="mt-0.5">
                        <CheckCircle v-if="transfer.status === 'completed'" class="w-5 h-5 text-emerald-500" />
                        <AlertCircle v-else-if="transfer.status === 'error'" class="w-5 h-5 text-rose-500" />
                        <div v-else class="relative w-5 h-5">
                            <div
                                class="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                            <component :is="transfer.type === 'upload' ? ArrowUp : ArrowDown"
                                class="absolute inset-0 m-auto w-2.5 h-2.5 text-primary" />
                        </div>
                    </div>

                    <!-- INFO -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <h3 class="text-sm font-bold text-slate-100 truncate pr-4" :title="transfer.name">
                                {{ transfer.name }}
                            </h3>
                            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button v-if="transfer.status === 'uploading' || transfer.status === 'downloading'"
                                    @click="removeTransfer(transfer.id)"
                                    class="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all"
                                    title="Cancel Transfer">
                                    <X class="w-3.5 h-3.5" />
                                </button>
                                <button @click="removeTransfer(transfer.id)" v-else
                                    class="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-all">
                                    <X class="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                        <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                            {{ transfer.type }}: <span class="text-slate-400">{{ transfer.bucket }}</span>
                        </p>

                        <!-- PROGRESS -->
                        <div class="mt-3 flex items-center gap-3">
                            <div class="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div class="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
                                    :style="{ width: `${transfer.progress}%` }" :class="{
                                        'bg-emerald-500 shadow-emerald-500/30': transfer.status === 'completed',
                                        'bg-rose-500 shadow-rose-500/30': transfer.status === 'error',
                                        'bg-slate-500 shadow-slate-500/30': transfer.status === 'cancelled',
                                        'bg-blue-400': transfer.type === 'download' && transfer.status === 'downloading'
                                    }" />
                            </div>
                            <span class="text-[11px] font-mono font-bold text-slate-300 w-10 text-right">
                                {{ Math.round(transfer.progress) }}%
                            </span>
                        </div>

                        <p v-if="transfer.error" class="text-[10px] text-rose-400 mt-1 font-medium truncate">
                            {{ transfer.error }}
                        </p>
                        <p v-else-if="transfer.status === 'cancelled'"
                            class="text-[10px] text-slate-400 mt-1 font-medium italic">
                            Transfer cancelled
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- FOOTER INFO -->
        <footer v-if="activeTransfersCount > 0" class="px-4 py-2 bg-primary/10 border-t border-primary/20">
            <p class="text-[10px] font-bold text-primary uppercase text-center tracking-widest animate-pulse">
                Processing {{ activeTransfersCount }} active transfers...
            </p>
        </footer>
    </div>
</template>

<script setup lang="ts">
import { CheckCircle, AlertCircle, XCircle, X, ArrowUp, ArrowDown } from 'lucide-vue-next'
import { useTransfers } from '@/composables/useTransfers'

const { transfers, removeTransfer, clearCompleted, activeTransfersCount } = useTransfers()
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}

.bg-primary {
    background-color: #00f2fe;
}

:root {
    --primary-rgb: 0, 242, 254;
}
</style>
