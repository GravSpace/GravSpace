import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconsaxDir = path.resolve(__dirname, '../node_modules/iconsax-react')

if (fs.existsSync(iconsaxDir)) {
  const dirs = ['dist/esm', 'dist/cjs']
  let totalPatched = 0

  for (const subDir of dirs) {
    const fullDir = path.join(iconsaxDir, subDir)
    if (!fs.existsSync(fullDir)) continue

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith('.js'))
    for (const file of files) {
      const filePath = path.join(fullDir, file)
      let content = fs.readFileSync(filePath, 'utf8')

      // Ensure React 19 compatibility by providing defaults for color, variant, and size
      let changed = false
      if (content.includes('.color') && !content.includes(".color || 'currentColor'")) {
        content = content.replace(/(color = _ref\d*\.color)(?! \|\| 'currentColor')/g, "$1 || 'currentColor'")
        changed = true
      }
      if (content.includes('.variant') && !content.includes(".variant || 'Linear'")) {
        content = content.replace(/(variant = _ref\d*\.variant)(?! \|\| 'Linear')/g, "$1 || 'Linear'")
        changed = true
      }
      if (content.includes('.size') && !content.includes(".size || '24'")) {
        content = content.replace(/(size = _ref\d*\.size)(?! \|\| '24')/g, "$1 || '24'")
        changed = true
      }

      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8')
        totalPatched++
      }
    }
  }

  console.log(`[patch-iconsax] Patched ${totalPatched} icons in iconsax-react for React 19 compatibility.`)
}
