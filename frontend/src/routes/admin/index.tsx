import { createFileRoute, redirect, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/dashboard' })
  },
  component: () => <Navigate to="/admin/dashboard" replace />,
})
