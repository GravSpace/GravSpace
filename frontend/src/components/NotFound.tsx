import { useNavigate, useRouter, Link } from '@tanstack/react-router'
import {
  FileQuestion,
  Home,
  ArrowLeft,
  FolderSearch,
  Trash2,
  ShieldCheck,
  Compass,
  Copy,
  Check,
  Database,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { getAuthState } from '../hooks/useAuth'

export function NotFound() {
  const navigate = useNavigate()
  const router = useRouter()
  const auth = getAuthState()
  const [copied, setCopied] = useState(false)
  const [currentPath, setCurrentPath] = useState('')

  useEffect(() => {
    setCurrentPath(window.location.pathname)
  }, [])

  const handleCopyPath = () => {
    if (currentPath) {
      navigator.clipboard.writeText(currentPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.history.back()
    } else {
      navigate({ to: auth.isAuthenticated ? '/admin/dashboard' : '/login' })
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-[#0a1418] text-foreground flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden">
      {/* Background Decorative Ambient Lights & Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8de5db0a_1px,transparent_1px),linear-gradient(to_bottom,#8de5db0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="relative z-10 max-w-3xl w-full flex flex-col items-center text-center space-y-8">

        {/* Animated Visual Hero Card */}
        <div className="relative group w-full max-w-2xl">
          <div className="absolute -inset-1 bg-gradient-to-r from-teal-500/30 via-emerald-500/30 to-cyan-500/30 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse" />

          <div className="relative bg-[#101d22]/90 border border-[#8de5db]/20 rounded-3xl p-8 sm:p-10 backdrop-blur-md shadow-2xl flex flex-col items-center">
            {/* S3 Storage Object Badge / Radar visual */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center mb-6">
              {/* Radar pulse rings */}
              <div className="absolute inset-0 rounded-full border border-teal-500/30 animate-ping opacity-25" />
              <div className="absolute -inset-3 rounded-full border border-emerald-500/20 animate-pulse" />

              <div className="w-full h-full rounded-2xl bg-gradient-to-br from-teal-900/40 via-emerald-950/60 to-slate-900 border border-teal-500/40 flex items-center justify-center shadow-inner">
                <FileQuestion className="w-14 h-14 text-teal-400 animate-bounce" style={{ animationDuration: '3s' }} />
              </div>

              {/* Mini Status Tag */}
              <span className="absolute -bottom-2 px-3 py-0.5 rounded-full text-[10px] font-mono tracking-wider bg-rose-500/20 border border-rose-500/40 text-rose-300 font-semibold shadow-sm">
                HTTP 404
              </span>
            </div>

            {/* Glowing 404 Big Text */}
            <h1 className="text-7xl sm:text-8xl font-extrabold tracking-tight bg-gradient-to-r from-teal-300 via-emerald-400 to-cyan-300 bg-clip-text text-transparent drop-shadow-sm font-sans">
              404
            </h1>

            {/* Title & Description */}
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
              Object / Page Not Found
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-400 max-w-lg leading-relaxed">
              The page or storage object you are looking for is unavailable, has been moved, or the path is invalid on the GravSpace S3 cluster.
            </p>

            {/* Path indicator widget */}
            {currentPath && (
              <div className="mt-5 w-full max-w-md bg-[#0a1418]/80 border border-teal-500/20 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono text-slate-300 gap-2">
                <div className="flex items-center gap-2 truncate">
                  <Compass className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="truncate text-slate-400">{currentPath}</span>
                </div>
                <button
                  onClick={handleCopyPath}
                  type="button"
                  className="px-2 py-1 bg-teal-950/60 hover:bg-teal-900/80 border border-teal-500/30 rounded text-[11px] text-teal-300 flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                  title="Copy Path"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
              <Button
                onClick={() => navigate({ to: auth.isAuthenticated ? '/admin/dashboard' : '/login' })}
                size="lg"
                className="w-full sm:w-auto bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-semibold px-6 shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                Back to Dashboard
              </Button>

              <Button
                onClick={handleGoBack}
                variant="outline"
                size="lg"
                className="w-full sm:w-auto border-teal-500/30 bg-teal-950/30 hover:bg-teal-900/40 text-slate-200 hover:text-white px-6 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-teal-400" />
                Go Back
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Links Suggestions Grid */}
        <div className="w-full max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-center gap-2">
            <Compass className="w-3.5 h-3.5 text-teal-400" />
            Quick Navigation
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/admin/buckets"
              className="group p-4 bg-[#101d22]/60 hover:bg-[#101d22] border border-[#8de5db]/10 hover:border-teal-500/40 rounded-xl text-left transition-all duration-200 hover:shadow-lg hover:shadow-teal-500/5 flex flex-col"
            >
              <div className="p-2 w-fit rounded-lg bg-teal-500/10 text-teal-400 mb-2 group-hover:scale-110 transition-transform">
                <FolderSearch className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold text-slate-200 group-hover:text-teal-300">
                Storage Buckets
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Browse & manage S3 buckets
              </span>
            </Link>

            <Link
              to="/admin/trash"
              className="group p-4 bg-[#101d22]/60 hover:bg-[#101d22] border border-[#8de5db]/10 hover:border-teal-500/40 rounded-xl text-left transition-all duration-200 hover:shadow-lg hover:shadow-teal-500/5 flex flex-col"
            >
              <div className="p-2 w-fit rounded-lg bg-emerald-500/10 text-emerald-400 mb-2 group-hover:scale-110 transition-transform">
                <Trash2 className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold text-slate-200 group-hover:text-emerald-300">
                Trash Bin
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Recently deleted objects
              </span>
            </Link>

            <Link
              to="/admin/audit"
              className="group p-4 bg-[#101d22]/60 hover:bg-[#101d22] border border-[#8de5db]/10 hover:border-teal-500/40 rounded-xl text-left transition-all duration-200 hover:shadow-lg hover:shadow-teal-500/5 flex flex-col"
            >
              <div className="p-2 w-fit rounded-lg bg-cyan-500/10 text-cyan-400 mb-2 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300">
                Audit Logs
              </span>
              <span className="text-xs text-slate-400 mt-1">
                System activity audit trail
              </span>
            </Link>
          </div>
        </div>

        {/* Footer Brand note */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Database className="w-3.5 h-3.5 text-teal-500" />
          <span>GravSpace Enterprise Object Storage</span>
          <span>•</span>
          {/* <span className="font-mono text-slate-400">v1.0</span> */}
        </div>

      </div>
    </div>
  )
}
