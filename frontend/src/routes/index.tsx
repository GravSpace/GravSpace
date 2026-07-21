import { createFileRoute, redirect, Navigate } from '@tanstack/react-router'
import { getAuthState } from '../hooks/useAuth'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const auth = getAuthState()
    if (auth.isAuthenticated) {
      throw redirect({ to: '/admin/dashboard' })
    }
    throw redirect({ to: '/login' })
  },
  component: IndexComponent,
})

function IndexComponent() {
  const auth = getAuthState()
  return <Navigate to={auth.isAuthenticated ? '/admin/dashboard' : '/login'} replace />
}
