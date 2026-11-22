export const encKey = (k: string) => k.split('/').map(encodeURIComponent).join('/')

export async function extractDroppedFiles(dataTransfer: DataTransfer): Promise<{ file: File; path: string }[]> {
  const items = dataTransfer.items
  if (!items || items.length === 0) return []

  const filesToUpload: { file: File; path: string }[] = []

  const traverseEntry = async (entry: any, path = '') => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject))
      filesToUpload.push({ file, path: path + file.name })
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader()
      const readAllEntries = async (): Promise<any[]> => {
        let allEntries: any[] = []
        const readBatch = async (): Promise<any[]> => {
          const batch = await new Promise<any[]>((resolve) => {
            dirReader.readEntries(resolve)
          })
          if (batch.length > 0) {
            allEntries = allEntries.concat(batch)
            return readBatch()
          }
          return allEntries
        }
        return readBatch()
      }
      const children = await readAllEntries()
      for (const child of children) {
        await traverseEntry(child, path + entry.name + '/')
      }
    }
  }

  const promises = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry()
      if (entry) {
        promises.push(traverseEntry(entry, ''))
      }
    }
  }

  await Promise.all(promises)
  return filesToUpload
}
