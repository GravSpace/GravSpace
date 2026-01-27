export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig()
    const backendUrl = config.backendUrl

    // Ambil path setelah /api
    // Contoh: /api/login -> /login
    // Contoh: /api/admin/users -> /admin/users
    const target = event.path.replace(/^\/api/, '')

    // Teruskan request ke backend secara dinamis
    return proxyRequest(event, `${backendUrl}${target}`)
})
