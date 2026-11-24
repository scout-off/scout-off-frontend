import React from 'react';

type Variant =
  | 'level0'
  | 'level1'
  | 'level2'
  | 'level3'
  | 'position'
  | 'region'
  | 'achievement'
  | 'academy';
type Size = 'sm' | 'md';

const BASE =
  'inline-flex items-center rounded-full font-medium leading-none align-middle whitespace-nowrap';

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

const VARIANT_CLASSES: Record<Variant, string> = {
  level0: 'bg-gray-100 text-gray-800',
  level1: 'bg-blue-100 text-blue-800',
  level2: 'bg-yellow-100 text-yellow-800',
  level3: 'bg-green-100 text-green-800',
  position: 'bg-indigo-100 text-indigo-800',
  region: 'bg-purple-100 text-purple-800',
  achievement: 'bg-brand-green/20 text-brand-green',
  academy: 'bg-sky-100 text-sky-800',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: Variant;
  label: string;
  size?: Size;
  /** Optional decorative icon rendered before the label. Purely visual — the
   * accessible name still comes from `label` via aria-label. */
  icon?: React.ReactNode;
}

export default function Badge({
  variant,
  label,
  size = 'sm',
  className,
  icon,
  ...rest
}: BadgeProps) {
  const classes = [
    BASE,
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    icon ? 'gap-1' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span aria-label={label} role="status" className={classes} {...rest}>
      {icon && (
        <span aria-hidden="true" className="flex-shrink-0">
          {icon}
        </span>
      )}
      {label}
    </span>
  );
}
