import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { ChevronRight, Loader2, ShieldAlert } from 'lucide-react'
import { useAuth, getAuthState } from '../hooks/useAuth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Button } from '../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      if (getAuthState().isAuthenticated) {
        throw redirect({ to: '/admin/dashboard' })
      }
    }
  },
  component: LoginPage,
  head: () => ({
    meta: [
      { title: 'Sign In | GravSpace' },
      {
        name: 'description',
        content: 'Access your administrative credentials for GravSpace Enterprise S3 Management Suite.',
      },
    ],
  }),
})

function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertTitle, setAlertTitle] = useState('')
  const [alertDesc, setAlertDesc] = useState('')

  function showAlert(title: string, desc: string) {
    setAlertTitle(title)
    setAlertDesc(desc)
    setAlertOpen(true)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!accessKeyId || !secretAccessKey) return
    setIsLoading(true)
    try {
      const success = await login(accessKeyId, secretAccessKey)
      if (success) {
        navigate({ to: '/admin/dashboard' })
      } else {
        showAlert('Authentication Failed', 'Please check your administrative credentials.')
      }
    } catch {
      showAlert('Login Error', 'An unexpected error occurred during login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] relative overflow-hidden font-sans">
      {/* Animated Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse" />
        <div
          className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse"
          style={{ animationDelay: '2s' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] bg-indigo-600/5 blur-[100px] rounded-full" />
      </div>

      <div className="w-full max-w-sm px-6 z-10 scale-95 md:scale-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/20 mb-4 transition-transform hover:scale-105 duration-300 p-2">
            <img src="/logo.png" alt="GravSpace Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">GravSpace</h1>
          <p className="text-slate-500 text-xs mt-1">Enterprise S3 Management Suite</p>
        </div>

        <Card className="border-white/10 bg-slate-900/40 backdrop-blur-2xl shadow-2xl overflow-hidden ring-1 ring-white/5">
          <CardHeader className="pb-2 space-y-0 text-left">
            <CardTitle className="text-lg font-semibold text-white">Sign In</CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              Enter your administrative credentials
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 pb-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="accessKeyId"
                  className="text-slate-400 text-[10px] font-bold uppercase tracking-wider ml-1"
                >
                  Access Key ID
                </Label>
                <Input
                  id="accessKeyId"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="e.g. root"
                  required
                  autoComplete="username"
                  className="h-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-700 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50 transition-all text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="secretAccessKey"
                  className="text-slate-400 text-[10px] font-bold uppercase tracking-wider ml-1"
                >
                  Secret Access Key
                </Label>
                <Input
                  id="secretAccessKey"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  type="password"
                  placeholder="••••••••••••••••"
                  required
                  autoComplete="current-password"
                  className="h-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-700 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50 transition-all text-sm"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10 mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
                disabled={isLoading}
              >
                {!isLoading ? (
                  <span className="flex items-center gap-2">
                    Login to Console
                    <ChevronRight className="w-4 h-4" />
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-10 flex flex-col items-center gap-2">
          <div className="flex items-center gap-4 text-[10px] text-slate-600 font-medium uppercase tracking-widest">
            <span>Hardware Acceleration</span>
            <span className="w-1 h-1 rounded-full bg-slate-800" />
            <span>Encrypted Session</span>
          </div>
          <p className="text-[10px] text-slate-700">
            Built with Gravity Engine &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>

      {/* Alert Dialog */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className="border-white/10 bg-slate-900/90 backdrop-blur-2xl shadow-2xl text-white">
          <AlertDialogHeader className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 ring-4 ring-red-500/5 animate-pulse">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-center">
              {alertTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-sm text-center">
              {alertDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center mt-2">
            <AlertDialogAction
              onClick={() => setAlertOpen(false)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-8 h-10 shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
