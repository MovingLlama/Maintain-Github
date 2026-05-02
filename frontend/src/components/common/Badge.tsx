import { clsx } from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', {
      'bg-gray-700 text-gray-300': variant === 'default',
      'bg-green-900/50 text-green-400': variant === 'success',
      'bg-yellow-900/50 text-yellow-400': variant === 'warning',
      'bg-red-900/50 text-red-400': variant === 'error',
      'bg-sky-900/50 text-sky-400': variant === 'info',
    })}>
      {children}
    </span>
  )
}
