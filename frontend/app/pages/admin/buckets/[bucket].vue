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
                                <TableHead class="w-[45%] bg-muted/30 backdrop-blur-md">Name</TableHead>
                                <TableHead class="w-[15%] bg-muted/30 backdrop-blur-md">Size</TableHead>
                                <TableHead class="w-[15%] bg-muted/30 backdrop-blur-md">Type</TableHead>
                                <TableHead class="text-right w-[25%] px-6 bg-muted/30 backdrop-blur-md">Actions
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-if="currentPrefix" @dblclick="navigateUp"
                                class="cursor-pointer hover:bg-muted/50 transition-colors group italic text-muted-foreground/80">
                                <TableCell colspan="4" class="py-2 px-4 flex items-center gap-2">
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
                                    @mouseenter="prefetchFolder(item)">
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
                                <TableRow v-else class="group hover:bg-muted/40 transition-colors">
                                    <TableCell class="font-medium py-3">
                                        <div class="flex items-center gap-3">
                                            <div
                                                class="p-1.5 rounded bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                                <File class="w-4 h-4" />
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
                                                    <DropdownMenuItem @click="copyPresignedUrl(item.Key)">
                                                        <LinkIcon class="w-4 h-4 mr-2" /> Quick Copy Link
                                                    </DropdownMenuItem>
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
            <DialogContent class=" p-0 overflow-hidden bg-white/95 border-0 rounded-xl shadow-2xl">
                <DialogHeader class="sr-only">
                    <DialogTitle>Object Preview</DialogTitle>
                    <DialogDescription>Viewing preview for {{ previewObject?.Key }}</DialogDescription>
                </DialogHeader>
                <div class="relative h-[85vh] flex items-center justify-center">
                    <div v-if="!previewUrl" class="flex flex-col items-center gap-4 animate-pulse">
                        <Loader2 class="w-10 h-10 animate-spin text-primary" />
                        <span class="text-sm font-medium tracking-wide">SECURE STREAMING IN PROGRESS...</span>
                    </div>
                    <img v-else :src="previewUrl" class="max-w-full max-h-full object-contain p-4" />

                    <div
                        class="absolute bottom-0 left-1 right-0 p-6 bg-linear-to-t from-white via-white/80 to-transparent">
                        <div class="flex flex-col items-center justify-between">
                            <div class="flex items-center gap-4">
                                <div class="flex flex-col justify-center max-w-[70%]">
                                    <span
                                        class="text-[10px] font-bold text-primary tracking-widest uppercase mb-1">Preview
                                        Mode</span>
                                    <span class="text-sm font-mono truncate">{{ previewObject?.Key }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <Button size="sm" variant="secondary" class="font-bold border-0 h-9"
                                    @click="downloadObject(previewObject?.Key, previewObject?.VersionID)">
                                    <Download class="w-4 h-4 mr-2" /> Download
                                </Button>
                                <Button size="sm" variant="ghost" @click="previewObject = null">
                                    Dismiss
                                </Button>
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

                    <div v-if="generatedUrl" class="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                        <Label class="text-[10px] uppercase font-bold text-muted-foreground">Public URL</Label>
                        <div class="flex gap-2">
                            <Input :modelValue="generatedUrl" readOnly
                                class="h-10 bg-muted/50 font-mono text-[10px] flex-1 border-primary/20" />
                            <Button @click="copyToClipboard(generatedUrl)" variant="ghost">
                                <LinkIcon class="w-4 h-4" />
                            </Button>
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
                    <TabsList class="grid w-full grid-cols-4">
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="notifications">Webhooks</TabsTrigger>
                        <TabsTrigger value="security">Security</TabsTrigger>
                        <TabsTrigger value="website">Website</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general" class="space-y-6 py-4">
                        <div class="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                            <div class="space-y-0.5">
                                <Label class="text-sm font-bold">Bucket Versioning</Label>
                                <p class="text-xs text-muted-foreground">Keep multiple versions of an object in the same
                                    bucket.
                                </p>
                            </div>
                            <Switch :modelValue="bucketInfo?.VersioningEnabled"
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
                                    @update:model-value="(v) => toggleSoftDelete(v)" />
                            </div>

                            <div v-if="bucketInfo?.SoftDeleteEnabled"
                                class="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <Label class="text-[10px] uppercase font-bold text-muted-foreground">Retention Period
                                    (Days)</Label>
                                <div class="flex gap-2">
                                    <Input type="number" :modelValue="bucketInfo?.SoftDeleteRetention"
                                        @update:model-value="(v) => updateSoftDeleteRetention(v)"
                                        class="h-10 w-24 bg-background border-slate-200 dark:border-slate-800" />
                                    <span class="text-xs text-muted-foreground flex items-center">days</span>
                                </div>
                                <p class="text-[10px] text-muted-foreground italic">Objects in trash will be permanently
                                    removed after this period.</p>
                            </div>
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
                    </TabsContent>

                    <TabsContent value="security" class="space-y-6 py-4">
                        <div class="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                            <div class="space-y-0.5">
                                <Label class="text-sm font-bold">Object Lock</Label>
                                <p class="text-xs text-muted-foreground">Prevent objects from being deleted or
                                    overwritten for a
                                    fixed amount of time.</p>
                            </div>
                            <Switch :modelValue="bucketInfo?.ObjectLockEnabled"
                                @update:model-value="(v) => toggleObjectLock(v)" />
                        </div>

                        <div v-if="bucketInfo?.ObjectLockEnabled" class="mt-6 space-y-4 pt-4 border-t">
                            <h4 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Default
                                Retention</h4>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-2">
                                    <Label class="text-[10px] font-bold uppercase">Retention Mode</Label>
                                    <select v-model="bucketInfo.DefaultRetentionMode"
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
                                        class="h-10" @change="updateDefaultRetention" />
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
                            <Switch :modelValue="websiteConfig.enabled" @update:model-value="toggleWebsiteHosting" />
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

                            <Button @click="saveWebsiteConfig" class="w-full mt-4">
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
    </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    ChevronLeft, Database, Plus, MoreHorizontal, MoreVertical, FolderPlus, Upload,
    Eye, Download, History, LinkIcon, Trash2, Loader2, File, Folder, CornerLeftUp,
    Inbox, ShieldCheck, ShieldOff, Clock, Lock, ShieldAlert, ChevronDown, File as FileIcon, FolderUp, Search, Tag, Share2,
    Settings, Webhook, BellOff
} from 'lucide-vue-next'
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

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
const { authState, authFetch } = useAuth()
const { addTransfer, updateProgress, setAbort, setError, activeTransfersCount } = useTransfers()
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

const showCreateFolderDialog = ref(false)
const newFolderName = ref('')
const fileInput = ref(null)
const folderInput = ref(null)

const searchQuery = ref('')
let searchTimeout = null

watch(searchQuery, () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
        fetchObjects()
    }, 500)
})

const showBucketSettings = ref(false)
const activeSettingsTab = ref('general')
const bucketInfo = ref(null)
const bucketWebhooks = ref([])
const showAddWebhookDialog = ref(false)
const newWebhook = ref({
    url: '',
    events: ['ObjectCreated:Put', 'ObjectRemoved:Delete'],
    secret: '',
    active: true
})

async function openBucketSettings() {
    await fetchBucketInfo()
    await fetchWebhooks()
    await fetchWebsiteConfig()
    showBucketSettings.value = true
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
            body: JSON.stringify(newWebhook.value)
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
        try {
            const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/website`, {
                method: 'DELETE'
            })
            if (res.ok) {
                websiteConfig.value.enabled = false
                toast.success('Website hosting disabled')
            }
        } catch (e) {
            toast.error('Failed to disable website hosting')
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
    try {
        const payload = {
            index_document: { suffix: websiteConfig.value.indexDocument },
            error_document: websiteConfig.value.errorDocument ? { key: websiteConfig.value.errorDocument } : null
        }
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/website`, {
            method: 'PUT',
            body: payload
        })
        if (res.ok) {
            toast.success('Website configuration saved successfully')
        } else {
            toast.error('Failed to save website configuration')
        }
    } catch (e) {
        toast.error('Failed to save website configuration')
    }
}

async function toggleObjectLock(val) {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/object-lock`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: val })
        })
        if (res.ok) {
            toast.success(`Object Lock ${val ? 'enabled' : 'disabled'}`)
            fetchBucketInfo()
        }
    } catch (e) {
        toast.error('Failed to update Object Lock')
    }
}

async function updateDefaultRetention() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/retention/default`, {
            method: 'PUT',
            body: JSON.stringify({
                mode: bucketInfo.value.DefaultRetentionMode,
                days: bucketInfo.value.DefaultRetentionDays
            })
        })
        if (res.ok) {
            toast.success('Default retention updated')
        }
    } catch (e) {
        toast.error('Failed to update default retention')
    }
}

async function toggleVersioning(val) {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/versioning`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: val })
        })
        if (res.ok) {
            toast.success(`Versioning ${val ? 'enabled' : 'disabled'}`)
            fetchBucketInfo()
        }
    } catch (e) {
        toast.error('Failed to update versioning')
    }
}

async function toggleSoftDelete(val) {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/soft-delete`, {
            method: 'PUT',
            body: {
                enabled: val,
                retention_days: bucketInfo.value?.SoftDeleteRetention || 30
            }
        })
        if (res.ok) {
            toast.success(`Soft Delete ${val ? 'enabled' : 'disabled'}`)
            fetchBucketInfo()
        }
    } catch (e) {
        toast.error('Failed to update soft delete')
    }
}

async function updateSoftDeleteRetention(val) {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/soft-delete`, {
            method: 'PUT',
            body: {
                enabled: bucketInfo.value?.SoftDeleteEnabled,
                retention_days: parseInt(val)
            }
        })
        if (res.ok) {
            toast.success('Retention period updated')
            fetchBucketInfo()
        }
    } catch (e) {
        toast.error('Failed to update soft delete period')
    }
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
    legalHold: false
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

    addTransfer({ id: transferId, name: sanitizedPath, bucket: bucketName.value, size: file.size, type: 'upload' })

    try {
        const initRes = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}?uploads=`, { method: 'POST' })
        if (!initRes.ok) throw new Error('Failed to initiate')
        const { UploadId } = await initRes.json()

        const CHUNK_SIZE = 5 * 1024 * 1024
        const totalParts = Math.ceil(file.size / CHUNK_SIZE)
        const parts = []
        let uploadedSize = 0
        const CONCURRENCY = 3
        let currentPartIdx = 0
        let isAborted = false
        const activeXhrs = new Set()

        setAbort(transferId, () => {
            isAborted = true
            activeXhrs.forEach(xhr => xhr.abort())
        })

        async function uploadWorker() {
            while (currentPartIdx < totalParts && !isAborted) {
                const i = currentPartIdx++
                const partNumber = i + 1
                const start = i * CHUNK_SIZE
                const end = Math.min((i + 1) * CHUNK_SIZE, file.size)
                const chunk = file.slice(start, end)

                const chunkEtag = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest()
                    activeXhrs.add(xhr)
                    xhr.open('PUT', `${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(key)}?uploadId=${UploadId}&partNumber=${partNumber}`)
                    const token = authState.value.token
                    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

                    xhr.onload = () => {
                        activeXhrs.delete(xhr)
                        if (xhr.status >= 200 && xhr.status < 300) {
                            uploadedSize += (end - start)
                            updateProgress(transferId, (uploadedSize / file.size) * 100)
                            resolve(xhr.getResponseHeader('ETag'))
                        } else reject(new Error(`Part ${partNumber} failed`))
                    }
                    xhr.onerror = () => {
                        activeXhrs.delete(xhr)
                        reject(new Error(`Network error on part ${partNumber}`))
                    }
                    xhr.send(chunk)
                })
                if (!isAborted) parts.push({ PartNumber: partNumber, ETag: chunkEtag })
            }
        }

        // Start workers
        const workers = []
        for (let w = 0; w < Math.min(CONCURRENCY, totalParts); w++) {
            workers.push(uploadWorker())
        }
        await Promise.all(workers)

        const completeRes = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeURIComponent(key)}?uploadId=${UploadId}`, {
            method: 'POST',
            body: JSON.stringify({ parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) })
        })

        if (completeRes.ok) {
            updateProgress(transferId, 100)
            if (bucketName.value === route.params.bucket) fetchObjects()
        } else {
            throw new Error('Failed to complete upload')
        }
    } catch (err) { setError(transferId, err.message) }
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
    const resource = "arn:aws:s3:::" + bucketName.value + (prefix ? "/" + prefix : "/*")
    return anon.policies.some(p => p.statement.some(s => s.effect === "Allow" && s.action.includes("s3:GetObject")))
}

async function togglePublic(prefix = "") {
    const currentlyPublic = isPublic(prefix)
    const resource = "arn:aws:s3:::" + bucketName.value + (prefix.length > 0 ? "/" + prefix + "*" : "/*")
    const pName = `PublicAccess-${bucketName.value}-${prefix.replace(/\//g, "") || 'Root'}`
    try {
        if (currentlyPublic) {
            await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
        } else {
            await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
                method: 'POST',
                body: { name: pName, version: "2012-10-17", statement: [{ effect: "Allow", action: ["s3:GetObject", "s3:ListBucket"], resource: [resource] }] }
            })
        }
        await fetchUsers()
    } catch (e) { toast.error('Failed') }
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
            body: JSON.stringify(tagMap)
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
const generatedUrl = ref('')

function openShareDialog(item) {
    selectedShareObject.value = item
    shareExpiry.value = '3600'
    generatedUrl.value = ''
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
        const body = {
            key: selectedShareObject.value.Key,
            versionId: selectedShareObject.value.VersionID || null,
            expirySeconds: parseInt(shareExpiry.value)
        }

        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/share`, {
            method: 'POST',
            body: body
        })

        if (!res.ok) throw new Error('Failed to generate link')
        const data = await res.json()
        generatedUrl.value = data.url
    } catch (e) {
        toast.error('Failed to generate link')
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
    toast.success('Link copied to clipboard')
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

watch(previewObject, async (newVal) => {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    if (newVal && isImage(newVal.Key)) {
        try {
            const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${encodeS3Key(newVal.Key)}`)
            if (res.ok) previewUrl.value = URL.createObjectURL(await res.blob())
        } catch (e) { console.error(e) }
    }
})

onMounted(() => { fetchObjects(); fetchUsers() })

const isLocked = (obj) => obj?.LegalHold || (obj?.RetainUntilDate && new Date(obj.RetainUntilDate) > new Date())

function openLockDialog(obj) {
    selectedLockObject.value = obj
    lockSettings.value = { mode: obj.LockMode || 'GOVERNANCE', retainUntilDate: obj.RetainUntilDate || '', legalHold: obj.LegalHold || false }
    showLockDialog.value = true
}

async function updateLockSettings() {
    try {
        const key = encodeURIComponent(selectedLockObject.value.Key)
        const vid = selectedLockObject.value.VersionID
        await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/legal-hold?key=${key}&versionId=${vid}`, { method: 'PUT', body: { hold: lockSettings.value.legalHold } })
        if (lockSettings.value.retainUntilDate) {
            await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/retention?key=${key}&versionId=${vid}`, { method: 'PUT', body: { retainUntilDate: new Date(lockSettings.value.retainUntilDate).toISOString(), mode: lockSettings.value.mode } })
        }
        toast.success('Updated')
        showLockDialog.value = false
        fetchObjects()
    } catch (e) { toast.error('Failed') }
}
</script>
