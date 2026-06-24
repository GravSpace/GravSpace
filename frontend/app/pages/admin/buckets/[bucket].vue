<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex items-center gap-4 overflow-hidden">
                <Button variant="ghost" size="icon" @click="router.push('/admin/buckets')"
                    class="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-800">
                    <ChevronLeft class="w-4 h-4" />
                </Button>
                <div class="flex items-center gap-2 overflow-hidden">
                    <Database class="w-4 h-4 text-primary shrink-0" />
                    <Breadcrumb class="overflow-hidden">
                        <BreadcrumbList class="flex-nowrap">
                            <BreadcrumbItem>
                                <BreadcrumbLink @click="navigateTo('')"
                                    class="cursor-pointer max-w-[120px] truncate font-semibold text-slate-900 dark:text-slate-100 italic">
                                    {{ bucketName }}
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <template v-for="(part, i) in currentPrefix.split('/').filter(p => p)" :key="part">
                                <BreadcrumbSeparator class="shrink-0" />
                                <BreadcrumbItem>
                                    <BreadcrumbLink
                                        @click="navigateTo(currentPrefix.split('/').slice(0, i + 1).join('/') + '/')"
                                        class="cursor-pointer max-w-[150px] truncate">
                                        {{ part }}
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                            </template>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <!-- Quota Usage Bar -->
                <div v-if="bucketInfo?.QuotaBytes > 0" class="hidden md:flex flex-col gap-1 w-48 mr-2">
                    <div class="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                        <span class="text-slate-500">Usage</span>
                        <span :class="usagePercentage > 90 ? 'text-rose-500' : 'text-slate-600'">
                            {{ formatSize(bucketInfo.CurrentSize) }} / {{ formatSize(bucketInfo.QuotaBytes) }}
                        </span>
                    </div>
                    <div
                        class="h-1.5 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800/50">
                        <div class="h-full transition-all duration-700 ease-out" :class="usageColor"
                            :style="{ width: `${usagePercentage}%` }"></div>
                    </div>
                </div>

                <div class="relative w-64 group">
                    <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input v-model="searchQuery" placeholder="Search objects..."
                        class="h-9 pl-9 bg-background/50 border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-primary/20" />
                </div>

                <Button variant="outline" size="sm" @click="showCreateFolderDialog = true"
                    class="h-9 border-slate-200 dark:border-slate-800">
                    <FolderPlus class="w-3.5 h-3.5 mr-2" /> New Folder
                </Button>
                <input type="file" multiple @change="uploadFiles" class="hidden" ref="fileInput">
                    <input type="file" webkitdirectory @change="uploadFolder" class="hidden" ref="folderInput">

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" :disabled="activeTransfersCount > 0"
                                    class="h-9 bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95">
                                    <Upload class="w-3.5 h-3.5 mr-2" v-if="activeTransfersCount === 0" />
                                    <Loader2 class="w-3.5 h-3.5 mr-2 animate-spin" v-else />
                                    {{ activeTransfersCount > 0 ? `Transferring...` : 'Upload' }}
                                    <ChevronDown class="w-3 h-3 ml-2 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" class="w-40">
                                <DropdownMenuItem @click="$refs.fileInput.click()">
                                    <FileIcon class="w-4 h-4 mr-2" />
                                    Upload Files
                                </DropdownMenuItem>
                                <DropdownMenuItem @click="$refs.folderInput.click()">
                                    <FolderUp class="w-4 h-4 mr-2" />
                                    Upload Folder
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button variant="outline" size="icon" @click="openBucketSettings"
                            class="h-9 w-9 border-slate-200 dark:border-slate-800">
                            <Settings class="w-4 h-4" />
                        </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto" @scroll="handleScroll" ref="scrollContainer">
            <div class="p-6">
                <Card class="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm relative">
                    <Table>
                        <TableHeader class="bg-muted/30 sticky top-0 z-10">
                            <TableRow>
                                <TableHead class="w-12 bg-muted/30 backdrop-blur-md">
                                    <Checkbox :checked="isAllSelected" @update:checked="toggleSelectAll" />
                                </TableHead>
                                <TableHead class="w-[40%] bg-muted/30 backdrop-blur-md">Name</TableHead>
                                <TableHead class="w-[15%] bg-muted/30 backdrop-blur-md">Size</TableHead>
                                <TableHead class="w-[15%] bg-muted/30 backdrop-blur-md">Type</TableHead>
                                <TableHead class="text-right w-[25%] px-6 bg-muted/30 backdrop-blur-md">Actions
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-if="currentPrefix" @click="navigateUp"
                                class="cursor-pointer hover:bg-muted/50 transition-colors group italic text-muted-foreground/80">
                                <TableCell colspan="5" class="py-2 px-4 flex items-center gap-2">
                                    <CornerLeftUp class="w-3.5 h-3.5" />
                                    <span class="text-xs font-medium">Go back</span>
                                </TableCell>
                            </TableRow>

                            <!-- VIRTUAL SPACER (Top) -->
                            <tr :style="{ height: `${offsetTop}px` }"></tr>

                            <template v-for="item in visibleItems" :key="item.Key || item">
                                <!-- FOLDER ITEM -->
                                <TableRow v-if="typeof item === 'string'"
                                    class="hover:bg-muted/50 transition-colors group cursor-pointer"
                                    :class="{ 'bg-indigo-50/20 dark:bg-indigo-950/20': selectedItems.has(item) }"
                                    @mouseenter="prefetchFolder(item)">
                                    <TableCell class="w-12 py-3" @click.stop>
                                        <Checkbox :checked="selectedItems.has(item)"
                                            @update:checked="toggleSelect(item)" />
                                    </TableCell>
                                    <TableCell class="font-medium py-3" @click="navigateTo(item)">
                                        <div class="flex items-center gap-3 cursor-pointer">
                                            <div
                                                class="p-1.5 rounded bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                                <Folder class="w-4 h-4 fill-current" />
                                            </div>
                                            <span class="truncate">{{item.split('/').filter(p => p).pop()}}/</span>
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-muted-foreground text-xs italic">-</TableCell>
                                    <TableCell>
                                        <Badge v-if="isPublic(item)" variant="success"
                                            class="text-[9px] uppercase font-bold py-0 h-4">Public</Badge>
                                        <span v-else
                                            class="text-[9px] text-muted-foreground/60 font-medium uppercase tracking-tighter">Directory</span>
                                    </TableCell>
                                    <TableCell class="text-right px-6">
                                        <DropdownMenu @click.stop>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon"
                                                    class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal class="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem @click="togglePublic(item)">
                                                    <component :is="isPublic(item) ? ShieldOff : ShieldCheck"
                                                        class="w-4 h-4 mr-2" />
                                                    {{ isPublic(item) ? 'Make Private' : 'Make Public' }}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>

                                <!-- OBJECT ITEM -->
                                <TableRow v-else class="group hover:bg-muted/40 transition-colors"
                                    :class="{ 'bg-indigo-50/20 dark:bg-indigo-950/20': selectedItems.has(item.Key) }">
                                    <TableCell class="w-12 py-3" @click.stop>
                                        <Checkbox :checked="selectedItems.has(item.Key)"
                                            @update:checked="toggleSelect(item.Key)" />
                                    </TableCell>
                                    <TableCell class="font-medium py-3">
                                        <div class="flex items-center gap-3">
                                            <div
                                                class="p-1.5 rounded bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                                <component :is="getFileIcon(item.Key)" class="w-4 h-4" />
                                            </div>
                                            <div class="flex items-center gap-1.5 min-w-0">
                                                <span class="truncate" :title="item.Key">{{ item.Key.split('/').pop()
                                                }}</span>
                                                <div v-if="isLocked(item)" class="flex items-center gap-1 shrink-0">
                                                    <Lock class="w-3 h-3 text-amber-500" />
                                                    <span class="text-[9px] font-bold text-amber-600 uppercase">{{
                                                        item.LockMode }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-muted-foreground text-xs font-mono tabular-nums">{{
                                        formatSize(item.Size) }}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline"
                                            class="text-[9px] uppercase font-bold py-0 h-4 bg-background/50 border-slate-200 dark:border-slate-800">
                                            {{ item.Key.split('.').pop() }}
                                        </Badge>
                                    </TableCell>
                                    <TableCell class="text-right px-6">
                                        <div
                                            class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon"
                                                class="h-8 w-8 text-muted-foreground hover:text-primary"
                                                @click="downloadObject(item.Key)">
                                                <Download class="w-3.5 h-3.5" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" class="h-8 w-8">
                                                        <MoreHorizontal class="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem @click="previewObject = item">
                                                        <Eye class="w-4 h-4 mr-2" /> Preview
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem @click="fetchVersions(item.Key)">
                                                        <History class="w-4 h-4 mr-2" /> Quick Versions
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem @click="openVersionExplorer(item)">
                                                        <Clock class="w-4 h-4 mr-2" /> Timeline Explorer
                                                    </DropdownMenuItem>
                                                    <!-- <DropdownMenuItem @click="copyPresignedUrl(item.Key)">
                                                        <LinkIcon class="w-4 h-4 mr-2" /> Quick Copy Link
                                                    </DropdownMenuItem> -->
                                                    <DropdownMenuItem @click="openTagDialog(item)">
                                                        <Tag class="w-4 h-4 mr-2" /> Edit Tags
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem @click="openShareDialog(item)">
                                                        <Share2 class="w-4 h-4 mr-2" /> Share Link
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem @click="openLockDialog(item)">
                                                        <ShieldAlert class="w-4 h-4 mr-2" /> Object Lock
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem @click="deleteObject(item.Key)"
                                                        class="text-destructive focus:text-destructive">
                                                        <Trash2 class="w-4 h-4 mr-2" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>

                                <!-- VERSION HISTORY (EXPANDED) -->
                                <TableRow v-if="typeof item !== 'string' && objectVersions[item.Key]"
                                    class="bg-muted/10">
                                    <TableCell colspan="4" class="py-4 px-6 border-l-2 border-primary/40">
                                        <div class="flex items-center justify-between mb-4">
                                            <div class="flex items-center gap-2">
                                                <History class="w-3.5 h-3.5" />
                                                <h4 class="text-xs font-bold uppercase tracking-widest">Version History
                                                </h4>
                                            </div>
                                            <Button variant="ghost" size="xs" @click="objectVersions[item.Key] = null">
                                                Collapse
                                            </Button>
                                        </div>
                                        <div class="space-y-3">
                                            <div v-for="v in objectVersions[item.Key]" :key="v.VersionID"
                                                class="flex items-center justify-between p-3 rounded-lg bg-background border shadow-xs transition-all hover:border-primary/30">
                                                <div class="flex items-center gap-6">
                                                    <div class="flex flex-col gap-0.5">
                                                        <div class="flex items-center gap-2">
                                                            <code
                                                                class="text-[10px] font-mono font-bold">{{ v.VersionID.slice(0, 12) }}...</code>
                                                            <Badge v-if="v.IsLatest" variant="default"
                                                                class="text-[8px] h-3.5 py-0">Latest</Badge>
                                                        </div>
                                                        <span class="text-[10px] text-muted-foreground">{{ new
                                                            Date(v.ModTime).toLocaleString() }}</span>
                                                    </div>
                                                    <span class="text-[10px] font-mono">{{ formatSize(v.Size) }}</span>
                                                </div>
                                                <div class="flex items-center gap-1">
                                                    <Button variant="outline" size="sm"
                                                        @click="downloadObject(item.Key, v.VersionID)">Download</Button>
                                                    <Button v-if="!v.IsLatest" variant="ghost" size="icon"
                                                        class="h-8 w-8 text-destructive"
                                                        @click="deleteObject(item.Key, v.VersionID)">
                                                        <Trash2 class="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            </template>

                            <!-- VIRTUAL SPACER (Bottom) -->
                            <tr :style="{ height: `${offsetBottom}px` }"></tr>

                            <TableRow v-if="allItems.length === 0 && !loading">
                                <TableCell colspan="4" class="h-32 text-center text-muted-foreground italic text-sm">
                                    <div class="flex flex-col items-center gap-2">
                                        <Inbox class="w-6 h-6 opacity-20" />
                                        <span>Folder is empty</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </main>

        <!-- DIALOGS -->
        <Dialog :open="showCreateFolderDialog" @update:open="showCreateFolderDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Virtual Directory</DialogTitle>
                    <DialogDescription>
                        Folders are simulated using zero-byte marker objects.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label for="folder-name">Directory Name</Label>
                        <Input id="folder-name" v-model="newFolderName" placeholder="logs/2026/01"
                            @keyup.enter="createFolder" autofocus class="h-10" />
                    </div>
                    <div class="flex justify-end gap-3 mt-4">
                        <Button variant="outline" @click="showCreateFolderDialog = false">Cancel</Button>
                        <Button @click="createFolder" :disabled="!newFolderName">Create Directory</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <Dialog :open="!!previewObject" @update:open="previewObject = null">
            <DialogContent :showCloseButton="false"
                class="sm:max-w-5xl p-0 overflow-hidden bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-900 rounded-2xl shadow-2xl">

                <!-- CUSTOM HEADER -->
                <DialogHeader
                    class="px-6 py-4 border-b border-slate-100 dark:border-slate-900 flex flex-row items-center justify-between bg-white dark:bg-slate-950">
                    <div class="flex items-center gap-3.5 min-w-0">
                        <div class="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                            <component :is="getFileIcon(previewObject?.Key || '')" class="w-5 h-5" />
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <DialogTitle
                                    class="text-sm font-bold text-slate-800 dark:text-slate-100 truncate max-w-sm sm:max-w-md md:max-w-lg font-sans tracking-tight">

                                    Preview
                                </DialogTitle>
                                <span
                                    class="hidden sm:inline-flex px-2 py-0.5 text-[9px] font-bold rounded-md bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 uppercase tracking-wide border border-slate-200/30 dark:border-slate-800/30">
                                    {{ previewObject?.Key?.split('.').pop() || 'file' }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2.5 shrink-0">
                        <Button size="sm" variant="ghost"
                            class="h-8 text-xs font-semibold rounded-lg transition-all duration-200 px-3 border border-transparent"
                            :class="showPreviewMeta ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-900/50 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'"
                            @click="showPreviewMeta = !showPreviewMeta">
                            <Info class="w-3.5 h-3.5 mr-1.5" /> Info
                        </Button>
                        <Button size="sm" variant="outline"
                            class="h-8 text-xs font-semibold border-slate-250 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg shadow-xs"
                            @click="downloadObject(previewObject?.Key, previewObject?.VersionID)">
                            <Download class="w-3.5 h-3.5 mr-1.5" /> Download
                        </Button>

                        <div class="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5"></div>

                        <Button size="icon" variant="ghost"
                            class="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900"
                            @click="previewObject = null">
                            <X class="w-4 h-4" />
                        </Button>
                    </div>
                </DialogHeader>

                <!-- CONTENT CONTAINER -->
                <div class="flex h-[62vh] overflow-hidden bg-slate-50/30 dark:bg-slate-950">
                    <!-- MAIN PREVIEW PANEL -->
                    <div
                        class="flex-1 bg-slate-900/5 dark:bg-slate-950/20 flex items-center justify-center p-6 relative overflow-hidden">
                        <div v-if="!previewType" class="flex flex-col items-center gap-4 animate-pulse">
                            <Loader2 class="w-8 h-8 animate-spin text-indigo-500" />
                            <span class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Loading
                                preview...</span>
                        </div>

                        <!-- Images (with Checkerboard background pattern) -->
                        <div v-else-if="previewType === 'image'"
                            class="relative max-w-full max-h-full flex items-center justify-center p-3 rounded-xl border border-slate-200/50 bg-[linear-gradient(45deg,#efefef_25%,transparent_25%),linear-gradient(-45deg,#efefef_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#efefef_75%),linear-gradient(-45deg,transparent_75%,#efefef_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] dark:bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] shadow-inner">
                            <img :src="previewUrl"
                                class="max-w-full max-h-[48vh] object-contain rounded-lg shadow-lg border border-white/80 dark:border-slate-900 transition-all duration-300 hover:scale-[1.01]" />
                        </div>

                        <!-- Audio Custom Player (Aesthetic Glass Widget) -->
                        <div v-else-if="previewType === 'audio'"
                            class="w-full max-w-sm p-6 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/60 flex flex-col items-center gap-6 shadow-xl relative overflow-hidden">
                            <div class="absolute -top-12 -left-12 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl">
                            </div>
                            <div class="absolute -bottom-12 -right-12 w-28 h-28 bg-violet-500/10 rounded-full blur-2xl">
                            </div>

                            <div
                                class="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shadow-sm">
                                <Music class="w-7 h-7" :class="{ 'animate-pulse text-indigo-550': mediaPlaying }" />
                            </div>

                            <div class="text-center w-full min-w-0 px-2">
                                <h4
                                    class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[220px] mx-auto">
                                    {{ previewObject?.Key?.split('/').pop() || '' }}</h4>
                                <p
                                    class="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 mt-1 font-mono uppercase tracking-wider">
                                    {{ formatSize(previewObject?.Size) }}</p>
                            </div>

                            <!-- Hidden native audio element -->
                            <audio ref="audioElement" :src="previewUrl" class="hidden" @timeupdate="onAudioTimeUpdate"
                                @loadedmetadata="onAudioMetadata" @ended="mediaPlaying = false"></audio>

                            <div class="w-full space-y-4 relative z-10">
                                <!-- Seek Bar -->
                                <div class="space-y-1.5">
                                    <div
                                        class="flex justify-between text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500">
                                        <span>{{ formatTime(mediaCurrentTime) }}</span>
                                        <span>{{ formatTime(mediaDuration) }}</span>
                                    </div>
                                    <input type="range" min="0" :max="mediaDuration || 100" :value="mediaCurrentTime"
                                        @input="seekAudio"
                                        class="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500 focus:outline-none" />
                                </div>

                                <!-- Controls Grid -->
                                <div class="flex items-center justify-between gap-4 pt-1">
                                    <select v-model="mediaPlaybackRate" @change="changePlaybackRate"
                                        class="text-[9px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-1.5 outline-none font-bold text-slate-600 dark:text-slate-350 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                        <option :value="0.5">0.5x</option>
                                        <option :value="1">1.0x</option>
                                        <option :value="1.5">1.5x</option>
                                        <option :value="2">2.0x</option>
                                    </select>

                                    <Button size="icon"
                                        class="h-10 w-10 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:scale-105 active:scale-95 transition-all flex items-center justify-center border border-indigo-500/10"
                                        @click="toggleAudio">
                                        <Play v-if="!mediaPlaying" class="w-4 h-4 fill-current ml-0.5 text-white" />
                                        <Pause v-else class="w-4 h-4 fill-current text-white" />
                                    </Button>

                                    <div class="flex items-center gap-1.5">
                                        <Button size="icon" variant="ghost"
                                            class="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                            @click="toggleMute">
                                            <Volume2 class="w-4 h-4" />
                                        </Button>
                                        <input type="range" min="0" max="1" step="0.1" v-model="mediaVolume"
                                            @input="changeVolume"
                                            class="w-14 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500 focus:outline-none" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Video -->
                        <div v-else-if="previewType === 'video'"
                            class="relative max-w-full max-h-full flex items-center justify-center p-1 bg-slate-950 rounded-xl border border-slate-850 shadow-2xl">
                            <video controls :src="previewUrl"
                                class="max-w-full max-h-[50vh] rounded-lg shadow-inner"></video>
                        </div>

                        <!-- PDF -->
                        <iframe v-else-if="previewType === 'pdf'" :src="previewUrl"
                            class="w-full h-full border-0 rounded-xl shadow-inner bg-slate-100 dark:bg-slate-900"></iframe>

                        <!-- Text / Code with Line Numbers -->
                        <div v-else-if="previewType === 'text'"
                            class="w-full h-full flex flex-col bg-slate-950 border border-slate-850 rounded-xl overflow-hidden shadow-2xl">
                            <div
                                class="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-slate-900/50">
                                <span
                                    class="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-sans">Text
                                    Inspector</span>
                                <Button size="xs" variant="ghost"
                                    class="h-6 text-[10px] text-slate-400 hover:text-white rounded px-2 hover:bg-slate-800"
                                    @click="copyToClipboard(previewTextContent, 'Content copied to clipboard')">
                                    <Copy class="w-3 h-3 mr-1.5" /> Copy Code
                                </Button>
                            </div>
                            <div class="flex-1 overflow-auto flex font-mono text-xs select-text scrollbar-thin">
                                <div
                                    class="text-right pr-3 pl-2 py-4 border-r border-slate-900 text-slate-600 bg-slate-950 select-none min-w-[3rem]">
                                    <div v-for="n in previewTextContent.split('\n').length" :key="n">{{ n }}</div>
                                </div>
                                <pre class="flex-1 p-4 overflow-x-auto text-slate-350 bg-slate-950/40">{{ previewTextContent }}
                        </pre>
                            </div>
                        </div>

                        <!-- Markdown -->
                        <div v-else-if="previewType === 'markdown'"
                            class="w-full h-full flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl overflow-hidden shadow-md">
                            <div
                                class="flex items-center justify-between px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/30">
                                <span
                                    class="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Markdown
                                    Document</span>
                                <Button size="xs" variant="ghost"
                                    class="h-6 text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded px-2"
                                    @click="copyToClipboard(previewTextContent, 'Content copied to clipboard')">
                                    <Copy class="w-3 h-3 mr-1.5" /> Copy Content
                                </Button>
                            </div>
                            <div
                                class="flex-1 p-6 overflow-auto select-text prose dark:prose-invert max-w-none text-sm scrollbar-thin">
                                <pre
                                    class="font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-900/30 p-4 rounded-lg border border-slate-100 dark:border-slate-900/50">
                            {{ previewTextContent }}</pre>
                            </div>
                        </div>

                        <div v-else-if="previewType === 'error'"
                            class="flex flex-col items-center gap-3 text-rose-500 max-w-sm text-center">
                            <div class="p-3 rounded-full bg-rose-500/10 text-rose-500">
                                <ShieldAlert class="w-8 h-8" />
                            </div>
                            <h5 class="text-xs font-bold mt-1">Failed to load preview</h5>
                            <p class="text-[10px] text-muted-foreground leading-normal">There was an error retrieving
                                the object
                                data from the server.</p>
                        </div>

                        <div v-else
                            class="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500 max-w-xs text-center">
                            <div class="p-3.5 rounded-full bg-slate-100 dark:bg-slate-900/80 text-slate-400">
                                <FileIcon class="w-8 h-8" />
                            </div>
                            <h5 class="text-xs font-bold mt-1 text-slate-700 dark:text-slate-300">Preview not available
                            </h5>
                            <p class="text-[10px] text-muted-foreground leading-normal">This file format is not
                                supported for
                                inline viewing. Please download the file to view its content.</p>
                        </div>
                    </div>

                    <!-- METADATA INFO SIDEBAR -->
                    <div v-if="showPreviewMeta"
                        class="w-80 shrink-0 border-l border-slate-200/50 dark:border-slate-800/50 p-5 overflow-y-auto bg-slate-50/40 dark:bg-slate-950/40 flex flex-col gap-5 select-text scrollbar-thin">
                        <h3
                            class="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
                            Object Properties</h3>

                        <div class="space-y-4">
                            <!-- GENERAL INFO CARD -->
                            <div
                                class="rounded-xl border border-slate-200/50 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4 shadow-sm space-y-4">
                                <h4
                                    class="text-[9px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
                                    General Info</h4>

                                <!-- OBJECT KEY -->
                                <div class="space-y-1.5">
                                    <div class="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                        <Key class="w-3.5 h-3.5 shrink-0" />
                                        <span class="text-[9px] font-bold uppercase tracking-wider">Object Key</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <div
                                            class="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-900/40 px-2 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50 overflow-x-auto whitespace-nowrap scrollbar-none select-all flex-1 pb-1">
                                            {{ previewObject?.Key }}
                                        </div>
                                        <Button size="icon" variant="ghost"
                                            class="h-7 w-7 shrink-0 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                            @click="copyToClipboard(previewObject?.Key, 'Key copied to clipboard')">
                                            <Copy class="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                <!-- SIZE & MIME TYPE GRID -->
                                <div
                                    class="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-900">
                                    <div class="space-y-1">
                                        <div class="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                            <Database class="w-3.5 h-3.5 shrink-0" />
                                            <span class="text-[9px] font-bold uppercase tracking-wider">Size</span>
                                        </div>
                                        <p class="text-xs font-semibold text-slate-850 dark:text-slate-200 mt-0.5">
                                            {{ formatSize(previewObject?.Size) }}
                                        </p>
                                    </div>
                                    <div class="space-y-1">
                                        <div class="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                            <FileText class="w-3.5 h-3.5 shrink-0" />
                                            <span class="text-[9px] font-bold uppercase tracking-wider">Mime Type</span>
                                        </div>
                                        <p class="text-xs font-semibold text-slate-850 dark:text-slate-200 mt-0.5 truncate"
                                            :title="previewObject?.ContentType">
                                            {{ previewObject?.ContentType || 'binary/octet-stream' }}
                                        </p>
                                    </div>
                                </div>

                                <!-- LAST MODIFIED -->
                                <div class="space-y-1 pt-3 border-t border-slate-100 dark:border-slate-900">
                                    <div class="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                        <Clock class="w-3.5 h-3.5 shrink-0" />
                                        <span class="text-[9px] font-bold uppercase tracking-wider">Last Modified</span>
                                    </div>
                                    <p class="text-xs font-semibold text-slate-850 dark:text-slate-200 mt-0.5">
                                        {{ previewObject?.LastModified ? new
                                            Date(previewObject.LastModified).toLocaleString() :
                                            '-' }}
                                    </p>
                                </div>
                            </div>

                            <!-- TECHNICAL DETAILS CARD -->
                            <div
                                class="rounded-xl border border-slate-200/50 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4 shadow-sm space-y-4">
                                <h4
                                    class="text-[9px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
                                    Technical Details</h4>

                                <!-- ETAG -->
                                <div class="space-y-1.5">
                                    <div class="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                        <Tag class="w-3.5 h-3.5 shrink-0" />
                                        <span class="text-[9px] font-bold uppercase tracking-wider">ETag (MD5)</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <div
                                            class="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-900/40 px-2 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50 overflow-x-auto whitespace-nowrap scrollbar-none select-all flex-1 pb-1">
                                            {{ previewObject?.ETag || '-' }}
                                        </div>
                                        <Button v-if="previewObject?.ETag" size="icon" variant="ghost"
                                            class="h-7 w-7 shrink-0 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                            @click="copyToClipboard(previewObject?.ETag, 'ETag copied to clipboard')">
                                            <Copy class="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                <!-- VERSION ID -->
                                <div class="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-900">
                                    <div class="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                        <History class="w-3.5 h-3.5 shrink-0" />
                                        <span class="text-[9px] font-bold uppercase tracking-wider">Version ID</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <div
                                            class="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-900/40 px-2 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50 overflow-x-auto whitespace-nowrap scrollbar-none select-all flex-1 pb-1">
                                            {{ previewObject?.VersionID || 'Latest' }}
                                        </div>
                                        <Button v-if="previewObject?.VersionID" size="icon" variant="ghost"
                                            class="h-7 w-7 shrink-0 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                            @click="copyToClipboard(previewObject?.VersionID, 'Version ID copied to clipboard')">
                                            <Copy class="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <Dialog :open="showLockDialog" @update:open="showLockDialog = false">
            <DialogContent class="sm:max-w-lg">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Lock class="w-5 h-5 text-primary" />
                    </div>
                    <DialogTitle>Object Lock Configuration</DialogTitle>
                    <DialogDescription>
                        Manage Write-Once-Read-Many protection for<br />
                        <code class="text-xs font-mono break-all text-slate-900 dark:text-slate-100">{{ selectedLockObject?.Key
                        }}</code>
                    </DialogDescription>
                </DialogHeader>

                <div class="space-y-6 py-6 border-y border-slate-100 dark:border-slate-800">
                    <div
                        class="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2">
                                <ShieldAlert class="w-4 h-4 text-amber-500" />
                                <span class="text-sm font-bold">Legal Hold</span>
                            </div>
                            <span class="text-[10px] text-muted-foreground">Prevents deletion even if retention
                                expires.</span>
                        </div>
                        <Switch v-model:modelValue="lockSettings.legalHold" />
                    </div>

                    <div v-if="lockSettings.legalHold" class="space-y-2">
                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Reason for Hold</Label>
                        <Input v-model="lockSettings.reason" placeholder="e.g. Compliance Audit 2026" />
                    </div>

                    <div class="space-y-4">
                        <div class="flex items-center gap-2 px-1">
                            <Clock class="w-4 h-4 text-primary" />
                            <span class="text-sm font-bold">Retention Period</span>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <Label class="text-[10px] uppercase font-bold text-muted-foreground">Mode</Label>
                                <select v-model="lockSettings.mode"
                                    class="w-full h-9 rounded-md border border-slate-200 dark:border-slate-800 bg-background px-3 py-1 text-sm shadow-sm transition-colors cursor-pointer">
                                    <option value="GOVERNANCE">Governance</option>
                                    <option value="COMPLIANCE">Compliance</option>
                                </select>
                            </div>
                            <div class="space-y-2">
                                <Label class="text-[10px] uppercase font-bold text-muted-foreground">Retain
                                    Until</Label>
                                <Input type="datetime-local" v-model="lockSettings.retainUntilDate" class="h-9" />
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex justify-between items-center pt-2">
                    <Badge v-if="isLocked(selectedLockObject)" variant="success" class="text-[9px] uppercase font-bold">
                        Active Lock
                    </Badge>
                    <Badge v-else variant="secondary" class="text-[9px] uppercase font-bold">No Active Lock</Badge>
                    <div class="flex gap-3">
                        <Button variant="outline" @click="showLockDialog = false">Cancel</Button>
                        <Button @click="updateLockSettings">Save Changes</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- TAG EDITOR DIALOG -->
        <Dialog :open="showTagDialog" @update:open="showTagDialog = false">
            <DialogContent class="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Metadata Tags</DialogTitle>
                    <DialogDescription>
                        Object: {{ selectedTagObject?.Key }}
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    <div v-for="(tag, index) in objectTags" :key="index" class="flex items-center gap-2 group">
                        <Input v-model="tag.key" placeholder="Key" class="h-9" />
                        <Input v-model="tag.value" placeholder="Value" class="h-9" />
                        <Button variant="ghost" size="icon" @click="removeTag(index)"
                            class="h-9 w-9 text-muted-foreground hover:text-destructive">
                            <Trash2 class="w-4 h-4" />
                        </Button>
                    </div>
                    <Button variant="outline" size="sm" @click="addTag"
                        class="w-full h-9 border-dashed text-xs uppercase font-bold tracking-wider">
                        <Plus class="w-3 h-3 mr-2" /> Add Tag
                    </Button>
                </div>
                <div class="flex justify-end gap-3 mt-2 border-t pt-4">
                    <Button variant="outline" @click="showTagDialog = false">Cancel</Button>
                    <Button @click="saveTags">Update Tags</Button>
                </div>
            </DialogContent>
        </Dialog>

        <!-- SHARING DIALOG -->
        <Dialog :open="showShareDialog" @update:open="showShareDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2">
                        <Share2 class="w-5 h-5 text-primary" />
                        Generate Sharing Link
                    </DialogTitle>
                    <DialogDescription>Create a secure, time-limited presigned URL for this object.</DialogDescription>
                </DialogHeader>
                <div class="space-y-6 py-4">
                    <div class="space-y-2">
                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Expiry Duration</Label>
                        <select v-model="shareExpiry"
                            class="w-full h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-sm shadow-sm transition-all focus:ring-1 focus:ring-primary/20 outline-hidden">
                            <option value="3600">1 Hour</option>
                            <option value="43200">12 Hours</option>
                            <option value="86400">1 Day</option>
                            <option value="604800">7 Days</option>
                        </select>
                    </div>

                    <div class="space-y-4">
                        <div class="space-y-2">
                            <Label class="text-[10px] uppercase font-bold text-muted-foreground">Allowed IP
                                (Optional)</Label>
                            <Input v-model="shareAllowedIP" placeholder="e.g. 192.168.1.1" class="h-10" />
                        </div>
                        <div class="flex items-center gap-3">
                            <Switch v-model:model-value="shareOneTimeUse" />
                            <div class="space-y-0.5">
                                <Label
                                    class="text-[10px] uppercase font-bold text-muted-foreground leading-none">One-time
                                    Use</Label>
                                <p class="text-[10px] text-muted-foreground">URL becomes invalid after first successful
                                    access.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div v-if="generatedUrl" class="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Public URL</Label>
                        <div class="flex gap-2">
                            <Input :modelValue="generatedUrl" readOnly
                                class="h-10 bg-muted/50 font-mono text-[10px] flex-1 border-primary/20" />
                            <Button @click="copyToClipboard(generatedUrl)" variant="ghost">
                                <LinkIcon class="w-4 h-4" />
                            </Button>
                        </div>
                        <!-- QR Code generator card -->
                        <div v-if="qrCodeDataUrl"
                            class="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <span class="text-[10px] uppercase font-bold text-muted-foreground font-bold">Scan to
                                Download</span>
                            <div class="p-2 bg-white rounded-lg border border-slate-200 shadow-xs">
                                <img :src="qrCodeDataUrl" alt="QR Code" class="w-40 h-40" />
                            </div>
                        </div>
                        <p class="text-[10px] text-muted-foreground italic text-center">Copy this link to share the
                            file. It
                            will expire automatically.</p>
                    </div>

                    <div class="flex justify-end gap-3 mt-4 border-t pt-4">
                        <Button variant="outline" @click="showShareDialog = false">Close</Button>
                        <Button @click="generateShareLink" v-if="!generatedUrl" variant="default">Generate
                            Link</Button>
                        <Button variant="default" @click="generatedUrl = ''" v-else
                            class="text-xs font-bold uppercase tracking-wider">Reset Expiry</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- VERSION EXPLORER DIALOG -->
        <Dialog :open="showVersionExplorer" @update:open="showVersionExplorer = false">
            <DialogContent class="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader class="pb-4 border-b">
                    <DialogTitle class="flex items-center gap-2">
                        <Clock class="w-5 h-5 text-primary" />
                        Version History
                    </DialogTitle>
                    <DialogDescription>
                        Timeline for <span class="font-mono text-primary font-bold">{{ selectedExplorerItem?.Key
                            }}</span>
                    </DialogDescription>
                </DialogHeader>

                <div class="flex-1 overflow-y-auto py-6 px-2">
                    <div v-if="loadingVersions" class="flex justify-center py-10">
                        <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                    <div v-else-if="!explorerVersions?.length" class="text-center py-10 text-muted-foreground">
                        No version history found.
                    </div>
                    <div v-else class="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3 space-y-8">
                        <div v-for="(v, index) in explorerVersions" :key="v.VersionID" class="relative pl-6">
                            <!-- Timeline Dot -->
                            <div class="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 border-background"
                                :class="v.IsLatest ? 'bg-primary' : (v.IsDeleteMarker ? 'bg-rose-500' : 'bg-slate-400')">
                            </div>

                            <div
                                class="flex flex-col gap-1 p-3 rounded-lg border bg-card/50 shadow-xs hover:border-primary/30 transition-colors">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <Badge v-if="v.IsLatest" class="text-[9px] h-4">Current</Badge>
                                        <Badge v-if="v.IsDeleteMarker" variant="destructive" class="text-[9px] h-4">
                                            Deleted
                                        </Badge>
                                        <span class="text-xs font-medium text-muted-foreground">
                                            {{ new Date(v.ModTime).toLocaleString() }}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <span class="text-[10px] font-mono mr-2">{{ v.IsDeleteMarker ? '-' :
                                            formatSize(v.Size)
                                            }}</span>
                                        <Button v-if="!v.IsDeleteMarker" variant="outline" size="sm" class="h-7 text-xs"
                                            @click="downloadObject(selectedExplorerItem?.Key, v.VersionID)">
                                            <Download class="w-3 h-3 mr-1" /> Get
                                        </Button>
                                        <Button
                                            v-if="!v.IsDeleteMarker && !v.IsLatest && (getPreviewType(selectedExplorerItem?.Key) === 'text' || getPreviewType(selectedExplorerItem?.Key) === 'markdown')"
                                            variant="outline" size="sm"
                                            class="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
                                            @click="openDiff(selectedExplorerItem?.Key, v.VersionID)">
                                            Diff
                                        </Button>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between mt-1">
                                    <code class="text-[10px] text-muted-foreground bg-muted px-1 rounded">{{ v.VersionID
                                    }}</code>
                                    <span v-if="index === 0" class="text-[10px] italic text-muted-foreground">Most
                                        recent</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- BUCKET SETTINGS DIALOG -->
        <Dialog :open="showBucketSettings" @update:open="showBucketSettings = false">
            <DialogContent class="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2">
                        <Settings class="w-5 h-5" />
                        Bucket Settings: <span class="text-primary italic">{{ bucketName }}</span>
                    </DialogTitle>
                    <DialogDescription>Configure advanced features and notifications for this bucket.
                    </DialogDescription>
                </DialogHeader>

                <Tabs v-model="activeSettingsTab" class="mt-4">
                    <TabsList class="grid w-full grid-cols-6">
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="notifications">Webhooks</TabsTrigger>
                        <TabsTrigger value="security">Security</TabsTrigger>
                        <TabsTrigger value="website">Website</TabsTrigger>
                        <TabsTrigger value="cors">CORS</TabsTrigger>
                        <TabsTrigger value="replication">Replication</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general" class="space-y-6 py-4">
                        <div class="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                            <div class="space-y-0.5">
                                <Label class="text-sm font-bold">Bucket Versioning</Label>
                                <p class="text-xs text-muted-foreground">Keep multiple versions of an object in the same
                                    bucket.
                                </p>
                            </div>
                            <Switch :modelValue="bucketInfo?.VersioningEnabled" :disabled="updatingSettings.versioning"
                                @update:model-value="(v) => toggleVersioning(v)" />
                        </div>

                        <div class="space-y-4 pt-4 border-t">
                            <div class="flex items-center justify-between">
                                <div class="space-y-0.5">
                                    <Label class="text-sm font-bold">Soft Delete (Recycle Bin)</Label>
                                    <p class="text-xs text-muted-foreground">Keep deleted objects for a defined period
                                        for
                                        recovery.
                                    </p>
                                </div>
                                <Switch :modelValue="bucketInfo?.SoftDeleteEnabled"
                                    :disabled="updatingSettings.softDelete"
                                    @update:model-value="(v) => toggleSoftDelete(v)" />
                            </div>

                            <div v-if="bucketInfo?.SoftDeleteEnabled"
                                class="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <Label class="text-[10px] uppercase font-bold text-muted-foreground">Retention Period
                                    (Days)</Label>
                                <div class="flex gap-2">
                                    <Input type="number" :modelValue="bucketInfo?.SoftDeleteRetention"
                                        :disabled="updatingSettings.softDelete"
                                        @update:model-value="(v) => updateSoftDeleteRetention(v)"
                                        class="h-10 w-24 bg-background border-slate-200 dark:border-slate-800" />
                                    <span class="text-xs text-muted-foreground flex items-center">days</span>
                                </div>
                                <p class="text-[10px] text-muted-foreground italic">Objects in trash will be permanently
                                    removed after this period.</p>
                            </div>
                        </div>

                        <!-- Bucket Quota -->
                        <div class="space-y-4 pt-4 border-t">
                            <div class="flex items-center justify-between">
                                <div class="space-y-0.5">
                                    <Label class="text-sm font-bold">Bucket Quota</Label>
                                    <p class="text-xs text-muted-foreground">Limit total storage capacity. Current: {{
                                        formatSize(bucketInfo?.CurrentSize || 0) }} used.</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <Input type="number" v-model="quotaInput"
                                        class="h-9 w-24 bg-background border-slate-200 dark:border-slate-800"
                                        placeholder="0" />
                                    <select v-model="quotaUnit"
                                        class="h-9 rounded-md border border-slate-200 dark:border-slate-800 bg-background px-2 text-xs focus:ring-1 focus:ring-primary/20 outline-hidden">
                                        <option value="1048576">MB</option>
                                        <option value="1073741824">GB</option>
                                        <option value="1099511627776">TB</option>
                                    </select>
                                    <Button size="sm" @click="saveQuota" :disabled="updatingSettings.quota"
                                        class="h-9 px-4">
                                        <Loader2 v-if="updatingSettings.quota" class="w-3 h-3 mr-2 animate-spin" />
                                        Save
                                    </Button>
                                </div>
                            </div>
                            <p class="text-[10px] text-muted-foreground italic">Set to 0 for unlimited storage. Changes
                                apply to
                                future uploads.</p>
                        </div>
                    </TabsContent>

                    <TabsContent value="notifications" class="space-y-4 py-4">
                        <div class="flex items-center justify-between">
                            <h4 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notification
                                Endpoints
                            </h4>
                            <Button size="sm" @click="showAddWebhookDialog = true">
                                <Plus class="w-3 h-3 mr-1" /> Add Webhook
                            </Button>
                        </div>

                        <div class="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                            <div v-if="!bucketWebhooks || bucketWebhooks.length === 0"
                                class="text-center py-8 border-2 border-dashed rounded-xl opacity-40">
                                <BellOff class="w-8 h-8 mx-auto mb-2" />
                                <p class="text-xs">No webhooks configured</p>
                            </div>
                            <div v-for="hook in bucketWebhooks" :key="hook.ID"
                                class="p-3 rounded-lg border bg-card hover:border-primary/30 transition-all group">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-2 overflow-hidden">
                                        <div class="p-1.5 rounded bg-blue-500/10 text-blue-500">
                                            <Webhook class="w-3.5 h-3.5" />
                                        </div>
                                        <span class="text-xs font-medium truncate max-w-[200px]">{{ hook.URL }}</span>
                                    </div>
                                    <Button variant="ghost" size="icon"
                                        class="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100"
                                        @click="deleteWebhook(hook.ID)">
                                        <Trash2 class="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                                <div class="flex flex-wrap gap-1">
                                    <Badge v-for="event in JSON.parse(hook.Events)" :key="event" variant="secondary"
                                        class="text-[8px] h-4">
                                        {{ event }}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <!-- Webhook DLQ Manager -->
                        <div class="space-y-4 pt-4 border-t mt-4">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <h4 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Dead-Letter
                                        Queue (DLQ)</h4>
                                    <Badge variant="destructive" class="text-[9px] px-1.5 py-0.5 rounded-full"
                                        v-if="dlqRecords.length > 0">
                                        {{ dlqRecords.length }} failed
                                    </Badge>
                                </div>
                                <Button size="xs" variant="outline" @click="fetchDLQ"
                                    class="h-7 text-[10px]">Refresh</Button>
                            </div>

                            <div class="border rounded-lg overflow-hidden bg-card/50">
                                <div v-if="dlqRecords.length === 0"
                                    class="p-6 text-center text-xs text-muted-foreground">
                                    No failed webhook deliveries in DLQ.
                                </div>
                                <div v-else class="max-h-[30vh] overflow-y-auto divide-y">
                                    <div v-for="record in dlqRecords" :key="record.id"
                                        class="p-3 text-xs flex flex-col gap-2 hover:bg-muted/30 transition-colors">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-1.5 flex-wrap">
                                                <Badge variant="outline"
                                                    class="text-[8px] border-rose-500/20 text-rose-500 bg-rose-500/5">
                                                    {{ record.event_name }}
                                                </Badge>
                                                <span
                                                    class="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]"
                                                    :title="record.url">
                                                    {{ record.url }}
                                                </span>
                                            </div>
                                            <div class="flex items-center gap-1.5">
                                                <Button size="xs" variant="ghost"
                                                    class="h-6 px-2 text-primary hover:text-primary hover:bg-primary/5 font-bold"
                                                    @click="retryDLQ(record.id)">
                                                    Retry
                                                </Button>
                                                <Button size="xs" variant="ghost"
                                                    class="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/5 font-bold"
                                                    @click="deleteDLQ(record.id)">
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>

                                        <div class="grid grid-cols-1 gap-1 text-[10px]">
                                            <div class="flex gap-1.5 items-start">
                                                <span
                                                    class="font-semibold text-muted-foreground whitespace-nowrap">Error:</span>
                                                <span class="text-rose-600 dark:text-rose-400 font-mono break-all">{{
                                                    record.error_message }}</span>
                                            </div>
                                            <div class="flex gap-1.5 items-center">
                                                <span class="font-semibold text-muted-foreground">Time:</span>
                                                <span class="text-muted-foreground font-mono">{{ new
                                                    Date(record.failed_at).toLocaleString() }}</span>
                                            </div>
                                        </div>

                                        <details class="cursor-pointer group">
                                            <summary
                                                class="text-[9px] text-muted-foreground hover:text-foreground select-none flex items-center gap-1">
                                                Show Payload
                                            </summary>
                                            <pre
                                                class="mt-1 p-2 rounded bg-slate-950 text-emerald-400 font-mono text-[9px] overflow-x-auto max-h-[100px] select-text">
                                        {{ formatPayload(record.payload) }}</pre>
                                        </details>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="security" class="space-y-6 py-4">
                        <div class="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                            <div class="space-y-0.5">
                                <Label class="text-sm font-bold">Object Lock</Label>
                                <p class="text-xs text-muted-foreground">Prevent objects from being deleted or
                                    overwritten for a
                                    fixed amount of time.</p>
                            </div>
                            <Switch :modelValue="bucketInfo?.ObjectLockEnabled" :disabled="updatingSettings.objectLock"
                                @update:model-value="(v) => toggleObjectLock(v)" />
                        </div>

                        <div v-if="bucketInfo?.ObjectLockEnabled" class="mt-6 space-y-4 pt-4 border-t">
                            <h4 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Default
                                Retention</h4>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-2">
                                    <Label class="text-[10px] font-bold uppercase">Retention Mode</Label>
                                    <select v-model="bucketInfo.DefaultRetentionMode"
                                        :disabled="updatingSettings.retention"
                                        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        @change="updateDefaultRetention">
                                        <option value="">None</option>
                                        <option value="GOVERNANCE">Governance</option>
                                        <option value="COMPLIANCE">Compliance</option>
                                    </select>
                                </div>
                                <div class="space-y-2">
                                    <Label class="text-[10px] font-bold uppercase">Retention Period (Days)</Label>
                                    <Input v-model.number="bucketInfo.DefaultRetentionDays" type="number" min="1"
                                        :disabled="updatingSettings.retention" class="h-10"
                                        @change="updateDefaultRetention" />
                                </div>
                            </div>

                            <div
                                class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                                <ShieldAlert class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div class="text-[10px] text-amber-700 leading-relaxed">
                                    <strong>Compliance Mode:</strong> No user, including the root account, can delete
                                    objects for the duration of the retention.
                                    <br />
                                    <strong>Governance Mode:</strong> Only users with special permissions can bypass the
                                    retention.
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="website" class="space-y-6 py-4">
                        <div class="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                            <div class="space-y-0.5">
                                <Label class="text-sm font-bold">Static Website Hosting</Label>
                                <p class="text-xs text-muted-foreground">Host a static website directly from this
                                    bucket.</p>
                            </div>
                            <Switch :modelValue="websiteConfig.enabled" :disabled="updatingSettings.website"
                                @update:model-value="toggleWebsiteHosting" />
                        </div>

                        <div v-if="websiteConfig.enabled" class="mt-6 space-y-4 pt-4 border-t">
                            <h4 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Document
                                Configuration
                            </h4>

                            <div class="space-y-4">
                                <div class="space-y-2">
                                    <Label class="text-[10px] font-bold uppercase">Index Document</Label>
                                    <Input v-model="websiteConfig.indexDocument" placeholder="index.html"
                                        class="h-10" />
                                    <p class="text-[10px] text-muted-foreground">The default page served for directory
                                        requests.
                                    </p>
                                </div>
                                <div class="space-y-2">
                                    <Label class="text-[10px] font-bold uppercase">Error Document (Optional)</Label>
                                    <Input v-model="websiteConfig.errorDocument" placeholder="error.html"
                                        class="h-10" />
                                    <p class="text-[10px] text-muted-foreground">The page served when an object is not
                                        found
                                        (404).</p>
                                </div>
                            </div>

                            <Button @click="saveWebsiteConfig" :disabled="updatingSettings.website" class="w-full mt-4">
                                <Loader2 v-if="updatingSettings.website" class="w-4 h-4 mr-2 animate-spin" />
                                Save Website Configuration
                            </Button>

                            <div class="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-4">
                                <div class="flex items-start gap-3">
                                    <Share2 class="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                    <div class="flex-1">
                                        <p class="text-[10px] font-bold text-blue-700 mb-1">Website Endpoint</p>
                                        <code class="text-[10px] text-blue-600 break-all">{{ websiteURL }}</code>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="cors"
                        class="space-y-6 py-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar animate-in fade-in duration-200">
                        <div class="flex items-center justify-between border-b pb-3">
                            <div>
                                <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200">Cross-Origin Resource
                                    Sharing
                                    (CORS)</h3>
                                <p class="text-xs text-muted-foreground">Configure access permissions from other
                                    domains.</p>
                            </div>
                            <Button variant="outline" size="sm" @click="addCorsRule" class="h-8 border-dashed">
                                <Plus class="w-3.5 h-3.5 mr-1.5" /> Add Rule
                            </Button>
                        </div>

                        <div v-if="corsRules.length === 0"
                            class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground bg-muted/20 border border-dashed rounded-xl">
                            <Globe class="w-8 h-8 opacity-20 mb-2 animate-pulse text-indigo-500" />
                            <span class="text-xs font-semibold">No CORS Configuration Active</span>
                            <p class="text-[10px] text-muted-foreground/60 max-w-xs mt-1">Configure CORS rules to allow
                                requests
                                from external web clients.</p>
                        </div>

                        <div v-else class="space-y-6">
                            <div v-for="(rule, index) in corsRules" :key="index"
                                class="p-4 rounded-xl border bg-card/50 relative group/rule hover:border-primary/20 transition-all space-y-4 shadow-2xs">
                                <div class="absolute top-4 right-4 flex items-center gap-2">
                                    <span
                                        class="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-semibold">Rule
                                        #{{ index + 1 }}</span>
                                    <Button variant="ghost" size="icon" @click="removeCorsRule(index)"
                                        class="h-7 w-7 text-muted-foreground hover:text-destructive">
                                        <Trash2 class="w-3.5 h-3.5" />
                                    </Button>
                                </div>

                                <div class="grid gap-4 md:grid-cols-2">
                                    <div class="space-y-1.5">
                                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Allowed
                                            Origins</Label>
                                        <Input v-model="rule.originsInput" placeholder="e.g. *, https://example.com"
                                            class="h-9" />
                                        <p class="text-[9px] text-muted-foreground italic">Comma-separated domains or *
                                        </p>
                                    </div>
                                    <div class="space-y-1.5">
                                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Allowed
                                            Headers</Label>
                                        <Input v-model="rule.headersInput"
                                            placeholder="e.g. *, Authorization, Content-Type" class="h-9" />
                                        <p class="text-[9px] text-muted-foreground italic">Comma-separated headers or *
                                        </p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <Label class="text-[10px] uppercase font-bold text-muted-foreground">Allowed
                                        Methods</Label>
                                    <div class="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                                        <label v-for="m in ['GET', 'PUT', 'POST', 'DELETE', 'HEAD']" :key="m"
                                            class="flex items-center gap-2 cursor-pointer text-xs">
                                            <input type="checkbox" :value="m" v-model="rule.allowed_methods"
                                                class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer bg-white" />
                                            <span class="font-bold text-slate-700 dark:text-slate-300">{{ m }}</span>
                                        </label>
                                    </div>
                                </div>

                                <div class="grid gap-4 md:grid-cols-2">
                                    <div class="space-y-1.5">
                                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Max Age
                                            (Seconds)</Label>
                                        <Input type="number" v-model.number="rule.max_age_seconds" placeholder="3000"
                                            class="h-9" />
                                    </div>
                                    <div class="space-y-1.5">
                                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Expose
                                            Headers
                                            (Optional)</Label>
                                        <Input v-model="rule.exposeHeadersInput"
                                            placeholder="e.g. ETag, x-amz-request-id" class="h-9" />
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center justify-between border-t pt-4">
                                <Button variant="outline" size="sm" @click="deleteCors"
                                    class="h-9 text-destructive border-destructive/20 hover:bg-destructive/10">
                                    Remove CORS Policy
                                </Button>
                                <Button @click="saveCors" :disabled="savingCorsState" class="h-9 font-bold">
                                    <Loader2 v-if="savingCorsState" class="w-3.5 h-3.5 mr-2 animate-spin" />
                                    Save CORS Configuration
                                </Button>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="replication" class="space-y-4 py-4">
                        <div class="space-y-4">
                            <div class="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-4">
                                <h3
                                    class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                                    Create
                                    Replication Rule</h3>
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-2">
                                        <Label class="text-xs font-semibold">Destination Bucket</Label>
                                        <select v-model="newReplicationRule.destinationBucket"
                                            class="w-full text-xs h-9 bg-background border border-input rounded-md px-3 outline-none focus:ring-1 focus:ring-ring">
                                            <option value="" disabled>Select target bucket...</option>
                                            <option v-for="b in bucketsList" :key="b" :value="b"
                                                :disabled="b === bucketName">{{
                                                    b }}</option>
                                        </select>
                                    </div>
                                    <div class="space-y-2">
                                        <Label class="text-xs font-semibold">Prefix Filter (Optional)</Label>
                                        <Input v-model="newReplicationRule.prefix" placeholder="e.g. logs/"
                                            class="text-xs h-9" />
                                    </div>
                                </div>
                                <div class="flex justify-end">
                                    <Button @click="createReplicationRule"
                                        :disabled="!newReplicationRule.destinationBucket"
                                        class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9">
                                        Add Rule
                                    </Button>
                                </div>
                            </div>

                            <!-- Rules Table / State -->
                            <div class="space-y-2">
                                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">Active Rules</h3>
                                <div v-if="replicationRules.length === 0"
                                    class="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-muted-foreground gap-2">
                                    <Database class="w-8 h-8 text-slate-300" />
                                    <span class="text-xs font-semibold">No active replication rules</span>
                                    <span class="text-[10px] text-muted-foreground/80">Configure cross-bucket
                                        replication for
                                        data redundancy.</span>
                                </div>
                                <div v-else class="border rounded-lg overflow-hidden bg-card">
                                    <Table>
                                        <TableHeader class="bg-muted/30">
                                            <TableRow>
                                                <TableHead class="text-xs">Destination</TableHead>
                                                <TableHead class="text-xs">Prefix</TableHead>
                                                <TableHead class="text-xs">Status</TableHead>
                                                <TableHead class="text-right text-xs">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow v-for="rule in replicationRules" :key="rule.id">
                                                <TableCell class="font-medium text-xs font-mono">{{
                                                    rule.destination_bucket }}
                                                </TableCell>
                                                <TableCell class="text-xs font-mono">{{ rule.prefix || '*' }}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        class="text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10 border-0">
                                                        Active
                                                    </Badge>
                                                </TableCell>
                                                <TableCell class="text-right">
                                                    <Button size="icon" variant="ghost"
                                                        class="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-500/10"
                                                        @click="deleteReplicationRule(rule.id)">
                                                        <Trash2 class="w-3.5 h-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>

        <!-- ADD WEBHOOK DIALOG -->
        <Dialog :open="showAddWebhookDialog" @update:open="showAddWebhookDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Register New Webhook</DialogTitle>
                    <DialogDescription>Receive real-time notifications when files are created or deleted.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label class="text-xs font-bold uppercase">Endpoint URL</Label>
                        <Input v-model="newWebhook.url" placeholder="https://api.myapp.com/webhooks/s3" class="h-10" />
                    </div>
                    <div class="space-y-2">
                        <Label class="text-xs font-bold uppercase">HMAC Secret (Optional)</Label>
                        <Input v-model="newWebhook.secret" type="password" placeholder="••••••••" class="h-10" />
                    </div>
                    <div class="space-y-3">
                        <Label class="text-xs font-bold uppercase">Events to listen</Label>
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <label
                                class="flex items-center gap-2 p-2 rounded-md border text-[10px] cursor-pointer hover:bg-muted/50 transition-colors">
                                <input type="checkbox" v-model="newWebhook.events" value="ObjectCreated:Put"
                                    class="rounded border-slate-300" />
                                Object Created (Put)
                            </label>
                            <label
                                class="flex items-center gap-2 p-2 rounded-md border text-[10px] cursor-pointer hover:bg-muted/50 transition-colors">
                                <input type="checkbox" v-model="newWebhook.events" value="ObjectCreated:Post"
                                    class="rounded border-slate-300" />
                                Object Created (Post)
                            </label>
                            <label
                                class="flex items-center gap-2 p-2 rounded-md border text-[10px] cursor-pointer hover:bg-muted/50 transition-colors">
                                <input type="checkbox" v-model="newWebhook.events"
                                    value="ObjectCreated:CompleteMultipartUpload" class="rounded border-slate-300" />
                                Multipart Complete
                            </label>
                            <label
                                class="flex items-center gap-2 p-2 rounded-md border text-[10px] cursor-pointer hover:bg-muted/50 transition-colors">
                                <input type="checkbox" v-model="newWebhook.events" value="ObjectRemoved:Delete"
                                    class="rounded border-slate-300" />
                                Object Deleted
                            </label>
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 mt-6">
                        <Button variant="outline" @click="showAddWebhookDialog = false">Cancel</Button>
                        <Button @click="addWebhook" :disabled="!newWebhook.url || newWebhook.events.length === 0"
                            class="bg-primary font-bold">Register Hook</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- BULK COPY DIALOG -->
        <Dialog :open="showBulkCopyModal" @update:open="showBulkCopyModal = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Bulk Copy Objects</DialogTitle>
                    <DialogDescription>Copy {{ selectedItemsCount }} selected items to another bucket.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label class="text-xs font-semibold">Destination Bucket</Label>
                        <select v-model="bulkCopyDestBucket"
                            class="w-full text-xs h-9 bg-background border border-input rounded-md px-3 outline-none focus:ring-1 focus:ring-ring">
                            <option value="" disabled>Select target bucket...</option>
                            <option v-for="b in bucketsList" :key="b" :value="b" :disabled="b === bucketName">{{ b }}
                            </option>
                        </select>
                    </div>
                    <div class="space-y-2">
                        <Label class="text-xs font-semibold">Destination Prefix (Optional)</Label>
                        <Input v-model="bulkCopyDestPrefix" placeholder="e.g. archive/" class="text-xs h-9" />
                    </div>
                    <div class="flex justify-end gap-3 mt-4">
                        <Button variant="outline" @click="showBulkCopyModal = false">Cancel</Button>
                        <Button @click="executeBulkCopy" :disabled="!bulkCopyDestBucket"
                            class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Copy Items</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- BULK TAG DIALOG -->
        <Dialog :open="showBulkTagModal" @update:open="showBulkTagModal = false">
            <DialogContent class="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Bulk Tag Objects</DialogTitle>
                    <DialogDescription>Apply metadata tags to {{ selectedItemsCount }} selected items.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <Label class="text-xs font-semibold">Tags</Label>
                            <Button size="xs" variant="outline" @click="addBulkTagRow">
                                <Plus class="w-3 h-3 mr-1" /> Add Tag
                            </Button>
                        </div>
                        <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                            <div v-for="(tag, idx) in bulkTags" :key="idx" class="flex gap-2 items-center">
                                <Input v-model="tag.key" placeholder="Key" class="text-xs h-9 flex-1" />
                                <Input v-model="tag.value" placeholder="Value" class="text-xs h-9 flex-1" />
                                <Button size="icon" variant="ghost"
                                    class="h-8 w-8 text-rose-500 hover:bg-rose-500/10 shrink-0"
                                    @click="removeBulkTagRow(idx)">
                                    <Trash2 class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 mt-4">
                        <Button variant="outline" @click="showBulkTagModal = false">Cancel</Button>
                        <Button @click="executeBulkTag" :disabled="bulkTags.some(t => !t.key)"
                            class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Apply Tags</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- FLOATING BOTTOM TOOLBAR -->
        <Transition enter-active-class="transition duration-300 ease-out"
            enter-from-class="transform translate-y-10 opacity-0" enter-to-class="transform translate-y-0 opacity-100"
            leave-active-class="transition duration-200 ease-in" leave-from-class="transform translate-y-0 opacity-100"
            leave-to-class="transform translate-y-10 opacity-0">
            <div v-if="selectedItemsCount > 0"
                class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-slate-900/90 text-white px-6 py-3 rounded-full shadow-2xl border border-slate-800 backdrop-blur-md">
                <span class="text-xs font-mono font-bold">{{ selectedItemsCount }} items selected</span>
                <div class="w-[1px] h-4 bg-slate-800"></div>
                <div class="flex items-center gap-2">
                    <Button size="xs" variant="ghost"
                        class="text-white hover:bg-slate-800 hover:text-white text-[10px] font-bold"
                        @click="showBulkCopyModal = true">
                        <Copy class="w-3 h-3 mr-1.5" /> Copy
                    </Button>
                    <Button size="xs" variant="ghost"
                        class="text-white hover:bg-slate-800 hover:text-white text-[10px] font-bold"
                        @click="showBulkTagModal = true">
                        <Tag class="w-3 h-3 mr-1.5" /> Tag
                    </Button>
                    <Button size="xs" variant="ghost"
                        class="text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 text-[10px] font-bold"
                        @click="executeBulkDelete">
                        <Trash2 class="w-3 h-3 mr-1.5" /> Delete
                    </Button>
                </div>
                <div class="w-[1px] h-4 bg-slate-800"></div>
                <Button size="icon" variant="ghost"
                    class="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full"
                    @click="clearSelection">
                    <X class="w-3.5 h-3.5" />
                </Button>
            </div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, shallowRef, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    ChevronLeft, Database, Plus, MoreHorizontal, MoreVertical, FolderPlus, Upload,
    Eye, Download, History, LinkIcon, Trash2, Loader2, File, Folder, CornerLeftUp,
    ExternalLink, Share2, Globe, Lock, Shield, Settings2, Info, ListFilter,
    ArrowUpRight, Copy, Check, Search, Filter, AlertTriangle, Webhook, BellOff,
    Settings, FileText, FileImage, FileAudio, FileVideo, FileCode, FileArchive,
    Clock, ShieldAlert, ShieldOff, ShieldCheck, Tag, PlusCircle, UserCircle,
    UserPlus, UserMinus, Key, ShieldCheck as ShieldCheckIcon, Save,
    Music, File as FileIcon, Inbox,
    FolderUp,
    ChevronDown, Video, Volume2, Play, Pause, X
} from 'lucide-vue-next'
import { Checkbox } from '@/components/ui/checkbox'
import { debounce } from 'perfect-debounce'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
    Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/composables/useAuth'
import { useTransfers } from '@/composables/useTransfers'
import QRCode from 'qrcode'

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
const { authState, authFetch } = useAuth()
const { addTransfer, updateProgress, setAbort, setError, activeTransfersCount, setPauseResume } = useTransfers()
const route = useRoute()
const router = useRouter()

const bucketName = ref(route.params.bucket)

useSeoMeta({
    title: () => `Bucket: ${bucketName.value} | GravSpace`,
    description: () => `Explore objects and manage settings for the bucket "${bucketName.value}" in GravSpace.`,
})
const currentPrefix = ref('')
const objects = ref([])
const commonPrefixes = ref([])
const objectVersions = ref({})
const loading = ref(false)
const users = ref({})

const previewObject = ref(null)
const previewUrl = ref(null)
const previewTextContent = ref('')
const previewType = ref('')

const showCreateFolderDialog = ref(false)
const newFolderName = ref('')
const fileInput = ref(null)
const folderInput = ref(null)

const searchQuery = ref('')
watch(searchQuery, () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
        fetchObjects()
    }, 500)
})

const getFileIcon = (key) => {
    const ext = key.split('.').pop().toLowerCase()
    switch (ext) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'webp':
        case 'svg':
            return FileImage
        case 'mp4':
        case 'webm':
        case 'mov':
        case 'avi':
            return FileVideo
        case 'mp3':
        case 'wav':
        case 'ogg':
        case 'flac':
            return FileAudio
        case 'pdf':
        case 'doc':
        case 'docx':
        case 'txt':
        case 'rtf':
        case 'md':
            return FileText
        case 'zip':
        case 'rar':
        case '7z':
        case 'tar':
        case 'gz':
            return FileArchive
        case 'js':
        case 'ts':
        case 'vue':
        case 'json':
        case 'html':
        case 'css':
        case 'go':
        case 'py':
        case 'rs':
        case 'sql':
            return FileCode
        default:
            return File
    }
}

const showBucketSettings = ref(false)
const activeSettingsTab = ref('general')
const bucketInfo = ref(null)
const updatingSettings = ref({
    versioning: false,
    softDelete: false,
    objectLock: false,
    retention: false,
    website: false,
    quota: false
})

const quotaInput = ref(0)
const quotaUnit = ref('1073741824') // GB

const usagePercentage = computed(() => {
    if (!bucketInfo.value || !bucketInfo.value.QuotaBytes || bucketInfo.value.QuotaBytes <= 0) return 0
    return Math.min(100, (bucketInfo.value.CurrentSize / bucketInfo.value.QuotaBytes) * 100)
})

const usageColor = computed(() => {
    const p = usagePercentage.value
    if (p < 70) return 'bg-emerald-500'
    if (p < 90) return 'bg-amber-500'
    return 'bg-secondary'
})
const bucketWebhooks = ref([])
const showAddWebhookDialog = ref(false)
const newWebhook = ref({
    url: '',
    events: ['ObjectCreated:Put', 'ObjectRemoved:Delete'],
    secret: '',
    active: true
})

const dlqRecords = ref([])

function formatPayload(payload) {
    if (!payload) return ''
    try {
        return JSON.stringify(JSON.parse(payload), null, 2)
    } catch (e) {
        return payload
    }
}

async function fetchDLQ() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/webhooks/dlq`)
        if (res.ok) dlqRecords.value = (await res.json()) || []
    } catch (e) {
        toast.error('Failed to load webhook DLQ')
    }
}

async function retryDLQ(id) {
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/webhooks/dlq/${id}/retry`, {
                method: 'POST'
            })
            if (!res.ok) {
                const errText = await res.text()
                throw new Error(errText || 'Failed to retry webhook')
            }
            await fetchDLQ()
        },
        {
            loading: 'Retrying webhook delivery...',
            success: 'Webhook retried successfully',
            error: (err) => `Failed: ${err.message}`
        }
    )
}

async function deleteDLQ(id) {
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/webhooks/dlq/${id}`, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('Failed to remove DLQ record')
            await fetchDLQ()
        },
        {
            loading: 'Removing record from DLQ...',
            success: 'Record removed from DLQ',
            error: 'Failed to remove DLQ record'
        }
    )
}

async function openBucketSettings() {
    await fetchBucketInfo()
    await fetchWebhooks()
    await fetchWebsiteConfig()
    await fetchCorsConfig()
    await fetchDLQ()

    // Initialize quota inputs from bucket info
    if (bucketInfo.value && bucketInfo.value.QuotaBytes > 0) {
        const bytes = bucketInfo.value.QuotaBytes
        if (bytes >= 1099511627776) {
            quotaUnit.value = '1099511627776'
            quotaInput.value = Math.round(bytes / 1099511627776)
        } else if (bytes >= 1073741824) {
            quotaUnit.value = '1073741824'
            quotaInput.value = Math.round(bytes / 1073741824)
        } else {
            quotaUnit.value = '1048576'
            quotaInput.value = Math.round(bytes / 1048576)
        }
    } else {
        quotaInput.value = 0
    }

    showBucketSettings.value = true
}

async function saveQuota() {
    const bytes = parseInt(quotaInput.value) * parseInt(quotaUnit.value)
    await updateBucketSetting(
        'quota',
        `${API_BASE}/admin/buckets/${bucketName.value}/quota`,
        { quota_bytes: bytes },
        'Bucket quota updated successfully',
        'Failed to update bucket quota'
    )
}

async function fetchBucketInfo() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/info`)
        if (res.ok) bucketInfo.value = await res.json()
    } catch (e) {
        toast.error('Failed to load bucket info')
    }
}

async function fetchWebhooks() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/webhooks`)
        if (res.ok) bucketWebhooks.value = (await res.json()) || []
    } catch (e) {
        toast.error('Failed to load webhooks')
    }
}

async function addWebhook() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/webhooks`, {
            method: 'POST',
            body: newWebhook.value
        })
        if (res.ok) {
            toast.success('Webhook registered successfully')
            showAddWebhookDialog.value = false
            fetchWebhooks()
            newWebhook.value = { url: '', events: ['ObjectCreated:Put', 'ObjectRemoved:Delete'], secret: '', active: true }
        }
    } catch (e) {
        toast.error('Failed to register webhook')
    }
}

async function deleteWebhook(id) {
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/webhooks/${id}`, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('Failed to remove webhook')
            await fetchWebhooks()
        },
        {
            loading: 'Removing webhook...',
            success: 'Webhook removed successfully',
            error: 'Failed to remove webhook'
        }
    )
}

const websiteConfig = ref({
    enabled: false,
    indexDocument: 'index.html',
    errorDocument: 'error.html'
})

const websiteURL = computed(() => {
    if (!websiteConfig.value.enabled) return ''
    const host = window.location.host
    const protocol = window.location.protocol
    return `${protocol}//${host}/website/${bucketName.value}/`
})

async function fetchWebsiteConfig() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/website`)
        if (res.ok) {
            const config = await res.json()
            websiteConfig.value = {
                enabled: true,
                indexDocument: config.index_document?.suffix || 'index.html',
                errorDocument: config.error_document?.key || 'error.html'
            }
        } else {
            websiteConfig.value = { enabled: false, indexDocument: 'index.html', errorDocument: 'error.html' }
        }
    } catch (e) {
        websiteConfig.value = { enabled: false, indexDocument: 'index.html', errorDocument: 'error.html' }
    }
}

async function toggleWebsiteHosting(enabled) {
    if (!enabled) {
        // Disable website hosting
        await updateBucketSetting(
            'website',
            `${API_BASE}/admin/buckets/${bucketName.value}/website`,
            null, // Helper will handle stringify
            'Website hosting disabled',
            'Failed to disable website hosting',
            false // Don't need full refresh here as websiteConfig is local
        )
        if (!updatingSettings.value.website) {
            websiteConfig.value.enabled = false
        }
    } else {
        websiteConfig.value.enabled = true
        toast.info('Configure and save your website settings')
    }
}

async function saveWebsiteConfig() {
    if (!websiteConfig.value.indexDocument) {
        toast.error('Index document is required')
        return
    }

    const payload = {
        index_document: { suffix: websiteConfig.value.indexDocument },
        error_document: websiteConfig.value.errorDocument ? { key: websiteConfig.value.errorDocument } : null
    }

    await updateBucketSetting(
        'website',
        `${API_BASE}/admin/buckets/${bucketName.value}/website`,
        payload,
        'Website configuration saved successfully',
        'Failed to save website configuration',
        false
    )
}

async function updateBucketSetting(key, url, payload, successMsg, errorMsg, refresh = true) {
    if (updatingSettings.value[key]) return
    updatingSettings.value[key] = true
    try {
        const res = await authFetch(url, {
            method: 'PUT',
            body: payload
        })
        if (res.ok) {
            if (successMsg) toast.success(successMsg)
            if (refresh) await fetchBucketInfo()
        } else {
            const errBody = await res.text()
            throw new Error(errBody || 'Update failed')
        }
    } catch (e) {
        toast.error(errorMsg || `Failed to update ${key}`)
        console.error(`Error updating ${key}:`, e)
    } finally {
        updatingSettings.value[key] = false
    }
}

async function toggleObjectLock(val) {
    await updateBucketSetting(
        'objectLock',
        `${API_BASE}/admin/buckets/${bucketName.value}/object-lock`,
        { enabled: val },
        `Object Lock ${val ? 'enabled' : 'disabled'}`,
        'Failed to update Object Lock'
    )
}

const debouncedDefaultRetention = debounce(async () => {
    await updateBucketSetting(
        'retention',
        `${API_BASE}/admin/buckets/${bucketName.value}/retention/default`,
        {
            mode: bucketInfo.value.DefaultRetentionMode,
            days: bucketInfo.value.DefaultRetentionDays
        },
        'Default retention updated',
        'Failed to update default retention',
        false
    )
}, 500)

async function updateDefaultRetention() {
    await debouncedDefaultRetention()
}

async function toggleVersioning(val) {
    await updateBucketSetting(
        'versioning',
        `${API_BASE}/admin/buckets/${bucketName.value}/versioning`,
        { enabled: val },
        `Versioning ${val ? 'enabled' : 'disabled'}`,
        'Failed to update versioning'
    )
}

async function toggleSoftDelete(val) {
    await updateBucketSetting(
        'softDelete',
        `${API_BASE}/admin/buckets/${bucketName.value}/soft-delete`,
        {
            enabled: val,
            retention_days: bucketInfo.value?.SoftDeleteRetention || 30
        },
        `Soft Delete ${val ? 'enabled' : 'disabled'}`,
        'Failed to update soft delete'
    )
}

const debouncedSoftDeleteRetention = debounce(async (val) => {
    const days = parseInt(val)
    if (isNaN(days)) return

    await updateBucketSetting(
        'softDelete',
        `${API_BASE}/admin/buckets/${bucketName.value}/soft-delete`,
        {
            enabled: bucketInfo.value?.SoftDeleteEnabled ?? true,
            retention_days: days
        },
        'Retention period updated',
        'Failed to update soft delete period'
    )
}, 500)

async function updateSoftDeleteRetention(val) {
    // Immediate local update for UI responsiveness
    if (bucketInfo.value) {
        bucketInfo.value.SoftDeleteRetention = parseInt(val) || 0
    }
    await debouncedSoftDeleteRetention(val)
}






// VIRTUAL SCROLLING
const scrollContainer = ref(null)
const scrollTop = ref(0)
const rowHeight = 57 // px
const viewportHeight = ref(800) // fallback

const allItems = computed(() => {
    return [...commonPrefixes.value, ...objects.value.filter(o => !o.Key.endsWith('/'))]
})

const startIndex = computed(() => Math.floor(scrollTop.value / rowHeight))
const endIndex = computed(() => startIndex.value + Math.ceil(viewportHeight.value / rowHeight) + 10)

const visibleItems = computed(() => allItems.value.slice(startIndex.value, endIndex.value))
const offsetTop = computed(() => startIndex.value * rowHeight)
const offsetBottom = computed(() => Math.max(0, (allItems.value.length - endIndex.value) * rowHeight))

function handleScroll(e) {
    scrollTop.value = e.target.scrollTop
    viewportHeight.value = e.target.clientHeight
}

const showLockDialog = ref(false)
const selectedLockObject = ref(null)
const lockSettings = ref({
    mode: 'GOVERNANCE',
    retainUntilDate: '',
    legalHold: false,
    reason: ''
})

async function fetchObjects() {
    if (!bucketName.value) return
    loading.value = true
    try {
        const url = `${API_BASE}/admin/buckets/${bucketName.value}/objects?delimiter=/&prefix=${encodeURIComponent(currentPrefix.value)}&search=${encodeURIComponent(searchQuery.value)}`
        const res = await authFetch(url)
        if (res.ok) {
            const data = await res.json()
            objects.value = (data.objects || []).filter(o => o.Key !== currentPrefix.value)
            commonPrefixes.value = (data.common_prefixes || []).filter(p => p !== currentPrefix.value)
        } else {
            throw new Error('Access denied or bucket not found')
        }
    } catch (e) {
        toast.error('Failed to load storage objects.')
    } finally {
        loading.value = false
    }
}

const prefetchCache = ref({})
async function prefetchFolder(prefix) {
    if (prefetchCache.value[prefix] || searchQuery.value) return

    try {
        const url = `${API_BASE}/admin/buckets/${bucketName.value}/objects?delimiter=/&prefix=${encodeURIComponent(prefix)}`
        const res = await authFetch(url)
        if (res.ok) {
            prefetchCache.value[prefix] = await res.json()
        }
    } catch (e) {
        // Silent fail for prefetch
    }
}

async function fetchUsers() {
    try {
        const res = await authFetch(`${API_BASE}/admin/users`)
        if (res.ok) users.value = await res.json()
    } catch (e) {
        console.error('Failed to load permissions context')
    }
}

function navigateTo(p) {
    currentPrefix.value = p
    objectVersions.value = {}

    if (prefetchCache.value[p]) {
        const data = prefetchCache.value[p]
        objects.value = (data.objects || []).filter(o => o.Key !== p)
        commonPrefixes.value = (data.common_prefixes || []).filter(p_ => p_ !== p)
        return
    }

    fetchObjects()
}

function navigateUp() {
    if (!currentPrefix.value) return
    const parts = currentPrefix.value.split('/').filter(p => p)
    parts.pop()
    navigateTo(parts.length > 0 ? parts.join('/') + '/' : '')
}

async function createFolder() {
    const name = newFolderName.value.trim()
    if (!name) return
    const key = currentPrefix.value + name + (name.endsWith('/') ? '' : '/')
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}`, { method: 'PUT' })
        if (res.ok) {
            showCreateFolderDialog.value = false
            newFolderName.value = ''
            toast.success(`Virtual directory "${name}" formed.`)
            await fetchObjects()
        }
    } catch (e) {
        toast.error('Failed to create folder.')
    }
}

async function uploadFiles(event) {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
            performMultipartUpload(file, file.name)
        } else {
            performUpload(file, file.name)
        }
    }
    event.target.value = ''
}

async function uploadFolder(event) {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    // Identify and create unique directory markers first
    const foldersToCreate = new Set()
    for (const file of files) {
        const path = file.webkitRelativePath || file.name
        const parts = path.split('/').map(p => p.trim().replace(/\s+/g, '_'))
        let currentPath = ""
        for (let i = 0; i < parts.length - 1; i++) {
            currentPath += parts[i] + "/"
            foldersToCreate.add(currentPath)
        }
    }

    // Sort folders by length to create parents before children
    const sortedFolders = Array.from(foldersToCreate).sort((a, b) => a.length - b.length)

    for (const folder of sortedFolders) {
        const key = currentPrefix.value + folder
        try {
            await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}`, {
                method: 'PUT'
            })
        } catch (e) {
            console.error('Failed to create folder marker:', key, e)
        }
    }

    // Now perform file uploads
    for (const file of files) {
        const path = file.webkitRelativePath || file.name
        if (file.size > 5 * 1024 * 1024) {
            performMultipartUpload(file, path)
        } else {
            performUpload(file, path)
        }
    }
    event.target.value = ''
}

async function performUpload(file, path) {
    const transferId = Math.random().toString(36).substring(7)
    const sanitizedPath = path.split('/').map(p => p.trim().replace(/\s+/g, '_')).join('/')
    const key = currentPrefix.value + sanitizedPath

    addTransfer({ id: transferId, name: sanitizedPath, bucket: bucketName.value, size: file.size, type: 'upload' })

    try {
        const xhr = new XMLHttpRequest()
        setAbort(transferId, () => xhr.abort())
        xhr.open('PUT', `${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}`)
        const token = authState.value.token
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) updateProgress(transferId, (e.loaded / e.total) * 100)
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                updateProgress(transferId, 100)
                if (bucketName.value === route.params.bucket) fetchObjects()
            } else {
                setError(transferId, `Upload failed: ${xhr.statusText}`)
            }
        }
        xhr.onerror = () => setError(transferId, 'Network error')
        xhr.send(file)
    } catch (err) { setError(transferId, err.message) }
}

async function performMultipartUpload(file, path) {
    const transferId = Math.random().toString(36).substring(7)
    const sanitizedPath = path.split('/').map(p => p.trim().replace(/\s+/g, '_')).join('/')
    const key = currentPrefix.value + sanitizedPath

    addTransfer({ id: transferId, name: sanitizedPath, bucket: bucketName.value, size: file.size, type: 'upload', isMultipart: true })

    try {
        const initRes = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}?uploads=`, { method: 'POST' })
        if (!initRes.ok) throw new Error('Failed to initiate')
        const { UploadId } = await initRes.json()

        const CHUNK_SIZE = 5 * 1024 * 1024
        const totalParts = Math.ceil(file.size / CHUNK_SIZE)
        const parts = []
        let uploadedSize = 0
        const CONCURRENCY = 3
        const activeXhrs = new Set()
        let isAborted = false
        let isPaused = false

        // Generate part indices
        const pendingParts = Array.from({ length: totalParts }, (_, idx) => idx)

        setAbort(transferId, () => {
            isAborted = true
            activeXhrs.forEach(xhr => xhr.abort())
            activeXhrs.clear()
        })

        const pauseHandler = () => {
            isPaused = true
            activeXhrs.forEach(xhr => xhr.abort())
            activeXhrs.clear()
        }

        const resumeHandler = () => {
            isPaused = false
            runUpload().catch(err => setError(transferId, err.message))
        }

        setPauseResume(transferId, pauseHandler, resumeHandler)

        async function uploadWorker() {
            while (pendingParts.length > 0 && !isAborted && !isPaused) {
                const i = pendingParts.shift()
                const partNumber = i + 1
                const start = i * CHUNK_SIZE
                const end = Math.min((i + 1) * CHUNK_SIZE, file.size)
                const chunk = file.slice(start, end)

                try {
                    const chunkEtag = await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest()
                        activeXhrs.add(xhr)
                        xhr.open('PUT', `${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}?uploadId=${UploadId}&partNumber=${partNumber}`)
                        const token = authState.value.token
                        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

                        xhr.onload = () => {
                            activeXhrs.delete(xhr)
                            if (xhr.status >= 200 && xhr.status < 300) {
                                resolve(xhr.getResponseHeader('ETag'))
                            } else reject(new Error(`Part ${partNumber} failed: ${xhr.status}`))
                        }
                        xhr.onerror = () => {
                            activeXhrs.delete(xhr)
                            reject(new Error(`Network error on part ${partNumber}`))
                        }
                        xhr.onabort = () => {
                            activeXhrs.delete(xhr)
                            reject(new Error('aborted'))
                        }
                        xhr.send(chunk)
                    })

                    if (!isAborted) {
                        parts.push({ PartNumber: partNumber, ETag: chunkEtag })
                        uploadedSize += (end - start)
                        updateProgress(transferId, (uploadedSize / file.size) * 100)
                    }
                } catch (err) {
                    if (isPaused || err.message === 'aborted') {
                        pendingParts.unshift(i)
                        return
                    } else {
                        throw err
                    }
                }
            }
        }

        async function runUpload() {
            const workers = []
            for (let w = 0; w < Math.min(CONCURRENCY, pendingParts.length); w++) {
                workers.push(uploadWorker())
            }
            await Promise.all(workers)

            if (isAborted) return
            if (isPaused) return

            if (parts.length === totalParts) {
                const completeRes = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeURIComponent(key)}?uploadId=${UploadId}`, {
                    method: 'POST',
                    body: { parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) }
                })

                if (completeRes.ok) {
                    updateProgress(transferId, 100)
                    if (bucketName.value === route.params.bucket) fetchObjects()
                } else {
                    throw new Error('Failed to complete upload')
                }
            }
        }

        // Start upload
        await runUpload()

    } catch (err) {
        setError(transferId, err.message)
    }
}

async function downloadObject(key, versionId = '') {
    const transferId = Math.random().toString(36).substring(7)
    addTransfer({ id: transferId, name: key.split('/').pop(), bucket: bucketName.value, size: 0, type: 'download' })

    try {
        let url = `${API_BASE}/admin/buckets/${bucketName.value}/download/${encodeS3Key(key)}`
        if (versionId) url += `?versionId=${versionId}`

        const xhr = new XMLHttpRequest()
        setAbort(transferId, () => xhr.abort())
        xhr.open('GET', url)
        const token = authState.value.token
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.responseType = 'blob'

        xhr.onprogress = (e) => {
            if (e.lengthComputable) updateProgress(transferId, (e.loaded / e.total) * 100)
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                updateProgress(transferId, 100)
                const downloadUrl = URL.createObjectURL(xhr.response)
                const a = document.createElement('a')
                a.href = downloadUrl
                a.download = key.split('/').pop()
                a.click()
            }
        }
        xhr.send()
    } catch (err) { setError(transferId, err.message) }
}

async function deleteObject(key, versionId = null) {
    toast.promise(
        async () => {
            let url = `${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}`
            if (versionId) url += `?versionId=${versionId}`
            const res = await authFetch(url, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to delete object')

            if (versionId && objectVersions.value[key]) {
                await fetchVersions(key)
            } else {
                await fetchObjects()
            }
        },
        {
            loading: `Deleting ${key}...`,
            success: `${key} deleted successfully`,
            error: 'Failed to delete object'
        }
    )
}


async function fetchVersions(key) {
    if (objectVersions.value[key]) {
        objectVersions.value[key] = null
        return
    }
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects?versions&prefix=${encodeS3Key(key)}`)
        if (res.ok) {
            const data = await res.json()
            objectVersions.value[key] = data.versions || []
            if (objectVersions.value[key].length === 0) objectVersions.value[key] = null
        }
    } catch (e) { toast.error('Failed to fetch versions') }
}

async function copyPresignedUrl(key, versionId = null) {
    try {
        let url = `${API_BASE}/admin/presign?bucket=${bucketName.value}&key=${encodeS3Key(key)}`
        if (versionId) url += `&versionId=${versionId}`
        const res = await authFetch(url)
        if (res.ok) {
            const data = await res.json()
            await navigator.clipboard.writeText(data.url)
            toast.success("Link copied")
        }
    } catch (err) { toast.error("Failed to sign URL") }
}

function isPublic(prefix = "") {
    const anon = users.value['anonymous']
    if (!anon || !anon.policies) return false

    // Construct the resource pattern we're looking for
    // For directories (ending in /), we look for a wildcard match
    // For files, we look for an exact or wildcard match
    const resource = "arn:aws:s3:::" + bucketName.value + (prefix ? "/" + prefix : "")
    const wildcardResource = resource + "*"

    return anon.policies.some(p => p.statement.some(s =>
        s.effect === "Allow" &&
        s.action.includes("s3:GetObject") &&
        s.resource.some(r => r === "*" || r === resource || r === wildcardResource)
    ))
}

async function togglePublic(prefix = "") {
    const currentlyPublic = isPublic(prefix)

    // Exact resource for matching and deletion
    const isDirectory = prefix.endsWith('/') || prefix === ""
    const resource = "arn:aws:s3:::" + bucketName.value + (prefix ? "/" + prefix : "")
    const finalResource = isDirectory ? resource + "*" : resource

    // Deterministic policy name based on resource to avoid duplicates or orphans
    const pName = `Public-${bucketName.value}-${prefix.replace(/[\/\.]/g, "-") || 'Root'}`

    try {
        if (currentlyPublic) {
            // Find the policy that actually grants this access by name or content
            // For simplicity, we try to delete by our naming convention
            await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
        } else {
            await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
                method: 'POST',
                body: {
                    name: pName,
                    version: "2012-10-17",
                    statement: [{
                        effect: "Allow",
                        action: ["s3:GetObject", "s3:ListBucket"],
                        resource: [finalResource]
                    }]
                }
            })
        }
        await fetchUsers()
    } catch (e) {
        toast.error('Failed to update public access')
        console.error(e)
    }
}

// TAGGING
const showTagDialog = ref(false)
const selectedTagObject = ref(null)
const objectTags = ref([]) // Array of { key, value }

async function openTagDialog(item) {
    selectedTagObject.value = item
    objectTags.value = []
    showTagDialog.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/tags/${encodeS3Key(item.Key)}`)
        if (res.ok) {
            const tags = await res.json()
            objectTags.value = Object.entries(tags).map(([key, value]) => ({ key, value }))
        }
        if (objectTags.value.length === 0) {
            addTag()
        }
    } catch (e) {
        toast.error('Failed to load tags')
    }
}

function addTag() {
    objectTags.value.push({ key: '', value: '' })
}

function removeTag(index) {
    objectTags.value.splice(index, 1)
}

async function saveTags() {
    const tagMap = {}
    objectTags.value.forEach(t => {
        if (t.key.trim()) tagMap[t.key.trim()] = t.value.trim()
    })

    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/tags/${encodeS3Key(selectedTagObject.value.Key)}`, {
            method: 'PUT',
            body: tagMap
        })
        if (res.ok) {
            toast.success('Tags updated successfully')
            showTagDialog.value = false
        }
    } catch (e) {
        toast.error('Failed to save tags')
    }
}

// SHARING
const showShareDialog = ref(false)
const selectedShareObject = ref(null)
const shareExpiry = ref('3600')
const shareAllowedIP = ref('')
const shareOneTimeUse = ref(false)
const generatedUrl = ref('')
const qrCodeDataUrl = ref('')

function openShareDialog(item) {
    selectedShareObject.value = item
    shareExpiry.value = '3600'
    generatedUrl.value = ''
    qrCodeDataUrl.value = ''
    showShareDialog.value = true
}

// VERSION EXPLORER
const showVersionExplorer = ref(false)
const selectedExplorerItem = ref(null)
const explorerVersions = ref([])
const loadingVersions = ref(false)

async function openVersionExplorer(item) {
    selectedExplorerItem.value = item
    explorerVersions.value = []
    loadingVersions.value = true
    showVersionExplorer.value = true

    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects?versions&prefix=${encodeS3Key(item.Key)}`)
        if (res.ok) {
            const data = await res.json()
            // Should verify if data.versions is array, api might return null
            explorerVersions.value = data.versions || []

            // Sort by ModTime desc just in case
            explorerVersions.value.sort((a, b) => new Date(b.ModTime) - new Date(a.ModTime))
        }
    } catch (e) {
        toast.error('Failed to load version history')
    } finally {
        loadingVersions.value = false
    }
}

async function generateShareLink() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/share`, {
            method: 'POST',
            body: {
                key: selectedShareObject.value.Key,
                versionId: selectedShareObject.value.VersionID,
                expirySeconds: parseInt(shareExpiry.value),
                allowedIp: shareAllowedIP.value,
                oneTimeUse: shareOneTimeUse.value
            }
        })
        if (res.ok) {
            const data = await res.json()
            generatedUrl.value = data.url
            try {
                qrCodeDataUrl.value = await QRCode.toDataURL(data.url, {
                    width: 200,
                    margin: 2,
                    color: {
                        dark: '#0f172a',
                        light: '#ffffff'
                    }
                })
            } catch (err) {
                console.error('Failed to generate QR Code:', err)
                qrCodeDataUrl.value = ''
            }
        }
    } catch (e) { toast.error('Failed to generate link') }
}

function copyToClipboard(text, msg = 'Link copied to clipboard') {
    navigator.clipboard.writeText(text)
    toast.success(msg)
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]
}

function encodeS3Key(key) {
    if (!key) return ''
    return key.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function isImage(key) {
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(key?.split('.').pop().toLowerCase())
}



const isLocked = (obj) => obj?.LegalHold || (obj?.RetainUntilDate && new Date(obj.RetainUntilDate) > new Date())

function openLockDialog(obj) {
    selectedLockObject.value = obj
    lockSettings.value = {
        mode: obj.LockMode || 'GOVERNANCE',
        retainUntilDate: obj.RetainUntilDate || '',
        legalHold: obj.LegalHold || false,
        reason: obj.LegalHoldReason || ''
    }
    showLockDialog.value = true
}

async function updateLockSettings() {
    try {
        const key = encodeURIComponent(selectedLockObject.value.Key)
        const vid = selectedLockObject.value.VersionID
        await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/legal-hold?key=${key}&versionId=${vid}`, {
            method: 'PUT',
            body: {
                hold: lockSettings.value.legalHold,
                reason: lockSettings.value.reason
            }
        })
        if (lockSettings.value.retainUntilDate) {
            await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/retention?key=${key}&versionId=${vid}`, { method: 'PUT', body: { retainUntilDate: new Date(lockSettings.value.retainUntilDate).toISOString(), mode: lockSettings.value.mode } })
        }
        toast.success('Updated')
        showLockDialog.value = false
        fetchObjects()
    } catch (e) { toast.error('Failed') }
}

// ==========================================
// CORS CONFIGURATION
// ==========================================
const corsRules = ref([])
const savingCorsState = ref(false)

function addCorsRule() {
    corsRules.value.push({
        originsInput: '*',
        headersInput: '*',
        allowed_methods: ['GET'],
        max_age_seconds: 3000,
        exposeHeadersInput: ''
    })
}

function removeCorsRule(index) {
    corsRules.value.splice(index, 1)
}

async function fetchCorsConfig() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/cors`)
        if (res.ok) {
            const data = await res.json()
            if (data && data.cors_rules) {
                corsRules.value = data.cors_rules.map(rule => ({
                    originsInput: (rule.allowed_origins || []).join(', '),
                    headersInput: (rule.allowed_headers || []).join(', '),
                    allowed_methods: rule.allowed_methods || [],
                    max_age_seconds: rule.max_age_seconds || 3000,
                    exposeHeadersInput: (rule.expose_headers || []).join(', ')
                }))
            } else {
                corsRules.value = []
            }
        } else {
            corsRules.value = []
        }
    } catch (e) {
        corsRules.value = []
    }
}

async function saveCors() {
    savingCorsState.value = true
    try {
        const rules = corsRules.value.map(rule => ({
            allowed_origins: rule.originsInput.split(',').map(s => s.trim()).filter(Boolean),
            allowed_methods: rule.allowed_methods,
            allowed_headers: rule.headersInput.split(',').map(s => s.trim()).filter(Boolean),
            max_age_seconds: parseInt(rule.max_age_seconds) || 3000,
            expose_headers: rule.exposeHeadersInput.split(',').map(s => s.trim()).filter(Boolean)
        }))

        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/cors`, {
            method: 'PUT',
            body: { cors_rules: rules }
        })
        if (res.ok) {
            toast.success('CORS Configuration saved successfully')
            await fetchCorsConfig()
        } else {
            const err = await res.text()
            throw new Error(err || 'Failed to save CORS configuration')
        }
    } catch (e) {
        toast.error(e.message)
    } finally {
        savingCorsState.value = false
    }
}

async function deleteCors() {
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/cors`, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('Failed to delete CORS configuration')
            corsRules.value = []
        },
        {
            loading: 'Deleting CORS Policy...',
            success: 'CORS Policy deleted successfully',
            error: 'Failed to delete CORS configuration'
        }
    )
}

// ==========================================
// VERSION DIFF VIEWER
// ==========================================
const showDiffDialog = ref(false)
const diffLoading = ref(false)
const diffRows = ref([])
const diffInfo = ref({
    key: '',
    oldVersion: '',
    newVersion: 'Current'
})

function computeDiff(oldText, newText) {
    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')

    const m = oldLines.length
    const n = newLines.length

    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
            }
        }
    }

    let i = m, j = n
    const diff = []

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            diff.unshift({
                type: 'equal',
                oldLine: oldLines[i - 1],
                newLine: newLines[j - 1],
                oldNum: i,
                newNum: j
            })
            i--
            j--
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diff.unshift({
                type: 'added',
                oldLine: '',
                newLine: newLines[j - 1],
                oldNum: null,
                newNum: j
            })
            j--
        } else {
            diff.unshift({
                type: 'removed',
                oldLine: oldLines[i - 1],
                newLine: '',
                oldNum: i,
                newNum: null
            })
            i--
        }
    }
    return diff
}

async function openDiff(key, oldVersionId) {
    showDiffDialog.value = true
    diffLoading.value = true
    diffRows.value = []
    diffInfo.value = {
        key: key,
        oldVersion: oldVersionId.slice(0, 12) + '...',
        newVersion: 'Current'
    }

    try {
        const oldRes = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}?versionId=${oldVersionId}`)
        if (!oldRes.ok) throw new Error('Failed to fetch historical version')
        const oldText = await oldRes.text()

        const newRes = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}`)
        if (!newRes.ok) throw new Error('Failed to fetch current version')
        const newText = await newRes.text()

        diffRows.value = computeDiff(oldText, newText)
    } catch (e) {
        toast.error('Failed to compute version diff: ' + e.message)
        showDiffDialog.value = false
    } finally {
        diffLoading.value = false
    }
}

// ============================================================================
// OBJECT PREVIEW & CUSTOM MEDIA PLAYER
// ============================================================================
const showPreviewMeta = ref(true)
const mediaPlaying = ref(false)
const mediaCurrentTime = ref(0)
const mediaDuration = ref(0)
const mediaPlaybackRate = ref(1)
const mediaVolume = ref(1)
const mediaMuted = ref(false)
const audioElement = ref(null)

function toggleAudio() {
    if (!audioElement.value) return
    if (mediaPlaying.value) {
        audioElement.value.pause()
        mediaPlaying.value = false
    } else {
        audioElement.value.play()
        mediaPlaying.value = true
    }
}

function seekAudio(e) {
    if (!audioElement.value) return
    const val = parseFloat(e.target.value)
    audioElement.value.currentTime = val
    mediaCurrentTime.value = val
}

function onAudioTimeUpdate() {
    if (audioElement.value) {
        mediaCurrentTime.value = audioElement.value.currentTime
    }
}

function onAudioMetadata() {
    if (audioElement.value) {
        mediaDuration.value = audioElement.value.duration
    }
}

function changePlaybackRate() {
    if (audioElement.value) {
        audioElement.value.playbackRate = mediaPlaybackRate.value
    }
}

function changeVolume() {
    if (audioElement.value) {
        audioElement.value.volume = mediaVolume.value
        mediaMuted.value = mediaVolume.value === 0
    }
}

function toggleMute() {
    if (audioElement.value) {
        mediaMuted.value = !mediaMuted.value
        audioElement.value.muted = mediaMuted.value
        if (mediaMuted.value) {
            mediaVolume.value = 0
        } else {
            mediaVolume.value = 1
            audioElement.value.volume = 1
        }
    }
}

function formatTime(secs) {
    if (isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
}

function getPreviewType(key) {
    const ext = key.split('.').pop().toLowerCase()
    const textExts = ['txt', 'json', 'yaml', 'yml', 'xml', 'csv', 'ini', 'conf', 'log', 'js', 'ts', 'go', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html', 'sql', 'sh', 'bat', 'env']
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio'
    if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) return 'video'
    if (ext === 'pdf') return 'pdf'
    if (ext === 'md') return 'markdown'
    if (textExts.includes(ext)) return 'text'
    return 'unsupported'
}


// ============================================================================
// BUCKET REPLICATION
// ============================================================================
const replicationRules = ref([])
const newReplicationRule = ref({ destinationBucket: '', prefix: '' })
const bucketsList = ref([])

async function fetchBuckets() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets`)
        if (res.ok) {
            const data = await res.json()
            bucketsList.value = data.map(b => b.Name)
        }
    } catch (e) {
        console.error('Failed to fetch buckets:', e)
    }
}

async function fetchReplicationRules() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/replication`)
        if (res.ok) {
            replicationRules.value = await res.json()
        }
    } catch (e) {
        console.error('Failed to fetch replication rules:', e)
    }
}

async function createReplicationRule() {
    if (!newReplicationRule.value.destinationBucket) return
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/replication`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destinationBucket: newReplicationRule.value.destinationBucket,
                prefix: newReplicationRule.value.prefix
            })
        })
        if (res.ok) {
            toast.success('Replication rule added successfully')
            newReplicationRule.value = { destinationBucket: '', prefix: '' }
            fetchReplicationRules()
        } else {
            const txt = await res.text()
            toast.error('Failed to add rule: ' + txt)
        }
    } catch (e) {
        toast.error('Error adding rule: ' + e.message)
    }
}

async function deleteReplicationRule(id) {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/replication/${id}`, {
            method: 'DELETE'
        })
        if (res.ok) {
            toast.success('Replication rule removed')
            fetchReplicationRules()
        } else {
            toast.error('Failed to remove replication rule')
        }
    } catch (e) {
        toast.error('Error deleting rule: ' + e.message)
    }
}


// ============================================================================
// BULK OPERATIONS
// ============================================================================
const selectedItems = shallowRef(new Set())
const showBulkCopyModal = ref(false)
const bulkCopyDestBucket = ref('')
const bulkCopyDestPrefix = ref('')
const showBulkTagModal = ref(false)
const bulkTags = ref([{ key: '', value: '' }])

const selectedItemsCount = computed(() => selectedItems.value.size)

const isAllSelected = computed(() => {
    if (!visibleItems.value || visibleItems.value.length === 0) return false
    return visibleItems.value.every(item => {
        const k = typeof item === 'string' ? item : item.Key
        return selectedItems.value.has(k)
    })
})

function toggleSelect(key) {
    const newSet = new Set(selectedItems.value)
    if (newSet.has(key)) {
        newSet.delete(key)
    } else {
        newSet.add(key)
    }
    selectedItems.value = newSet
}

function toggleSelectAll() {
    const newSet = new Set(selectedItems.value)
    if (isAllSelected.value) {
        visibleItems.value.forEach(item => {
            const k = typeof item === 'string' ? item : item.Key
            newSet.delete(k)
        })
    } else {
        visibleItems.value.forEach(item => {
            const k = typeof item === 'string' ? item : item.Key
            newSet.add(k)
        })
    }
    selectedItems.value = newSet
}

function clearSelection() {
    selectedItems.value = new Set()
}

function addBulkTagRow() {
    bulkTags.value.push({ key: '', value: '' })
}

function removeBulkTagRow(idx) {
    if (bulkTags.value.length > 1) {
        bulkTags.value.splice(idx, 1)
    } else {
        bulkTags.value = [{ key: '', value: '' }]
    }
}

async function executeBulkCopy() {
    if (!bulkCopyDestBucket.value || selectedItems.value.size === 0) return
    try {
        const keysArray = Array.from(selectedItems.value)
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keys: keysArray,
                destinationBucket: bulkCopyDestBucket.value,
                destinationPrefix: bulkCopyDestPrefix.value
            })
        })
        if (res.ok) {
            toast.success(`Successfully copied ${keysArray.length} items`)
            showBulkCopyModal.value = false
            bulkCopyDestBucket.value = ''
            bulkCopyDestPrefix.value = ''
            clearSelection()
            fetchObjects()
        } else {
            const txt = await res.text()
            toast.error('Bulk copy failed: ' + txt)
        }
    } catch (e) {
        toast.error('Error during bulk copy: ' + e.message)
    }
}

async function executeBulkTag() {
    if (selectedItems.value.size === 0) return
    const tagMap = {}
    bulkTags.value.forEach(t => {
        if (t.key.trim()) tagMap[t.key.trim()] = t.value.trim()
    })

    try {
        const keysArray = Array.from(selectedItems.value)
        let successCount = 0
        const promises = keysArray.map(async (key) => {
            const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/tags/${encodeS3Key(key)}`, {
                method: 'PUT',
                body: tagMap
            })
            if (res.ok) successCount++
        })

        await Promise.all(promises)
        toast.success(`Applied tags to ${successCount} items`)
        showBulkTagModal.value = false
        bulkTags.value = [{ key: '', value: '' }]
        clearSelection()
    } catch (e) {
        toast.error('Error applying bulk tags: ' + e.message)
    }
}

async function executeBulkDelete() {
    if (selectedItems.value.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedItems.value.size} selected items?`)) return

    try {
        const keysArray = Array.from(selectedItems.value)
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/delete-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keys: keysArray
            })
        })

        if (res.ok) {
            toast.success(`Successfully deleted selected items`)
            clearSelection()
            fetchObjects()
        } else {
            const txt = await res.text()
            toast.error('Bulk deletion failed: ' + txt)
        }
    } catch (e) {
        toast.error('Error during bulk delete: ' + e.message)
    }
}

// Clear selection whenever the folder or search changes
watch([currentPrefix, searchQuery], () => {
    selectedItems.value = new Set()
})

// ============================================================================
// WATCHERS & MOUNTED
// ============================================================================
watch(previewObject, async (newVal) => {
    if (previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value)
        previewUrl.value = null
    }
    previewTextContent.value = ''
    previewType.value = ''
    mediaPlaying.value = false
    mediaCurrentTime.value = 0
    mediaDuration.value = 0
    mediaPlaybackRate.value = 1

    if (!newVal) return

    const type = getPreviewType(newVal.Key)
    if (type === 'unsupported') {
        previewType.value = 'unsupported'
        return
    }

    try {
        let url = `${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(newVal.Key)}`
        if (newVal.VersionID) {
            url += `?versionId=${newVal.VersionID}`
        }

        const res = await authFetch(url)
        if (!res.ok) {
            previewType.value = 'error'
            return
        }

        if (type === 'image' || type === 'audio' || type === 'video' || type === 'pdf') {
            const blob = await res.blob()
            previewUrl.value = URL.createObjectURL(blob)
            previewType.value = type
        } else if (type === 'text' || type === 'markdown') {
            const text = await res.text()
            previewTextContent.value = text
            previewType.value = type
        }
    } catch (e) {
        console.error(e)
        previewType.value = 'error'
    }
})

onMounted(() => {
    fetchObjects()
    fetchUsers()
    fetchBuckets()
    fetchReplicationRules()
})
</script>
