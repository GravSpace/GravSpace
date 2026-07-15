import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthState } from '../hooks/useAuth'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      const auth = getAuthState()
      if (auth.isAuthenticated) {
        throw redirect({ to: '/admin/dashboard' })
      }
      throw redirect({ to: '/login' })
    }
  },
  component: () => null,
})
