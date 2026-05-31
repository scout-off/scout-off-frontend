import React from 'react'

type Variant = 'level0' | 'level1' | 'level2' | 'level3' | 'position' | 'region'
type Size = 'sm' | 'md'

const BASE = 'inline-flex items-center rounded-full font-medium leading-none align-middle whitespace-nowrap'

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

const VARIANT_CLASSES: Record<Variant, string> = {
  level0: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  level1: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  level2: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  level3: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  position: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  region: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: Variant
  label: string
  size?: Size
}

export default function Badge({ variant, label, size = 'sm', className, ...rest }: BadgeProps) {
  const classes = [BASE, SIZE_CLASSES[size], VARIANT_CLASSES[variant], className]
    .filter(Boolean)
    .join(' ')

  return (
    <span aria-label={label} role="status" className={classes} {...rest}>
      {label}
    </span>
  )
}
