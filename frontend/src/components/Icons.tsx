interface IconProps {
  size?: number
  className?: string
}

function base(size = 18) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }
}

export function IconUpload({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export function IconTable({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M9.5 9.5V20" />
    </svg>
  )
}

export function IconSearch({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.2 16.2 4 4" />
    </svg>
  )
}

export function IconPlus({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconTrash({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 6.5h16M9 6.5V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8v1.7" />
      <path d="M18.5 6.5 17.7 19a1.8 1.8 0 0 1-1.8 1.7H8.1A1.8 1.8 0 0 1 6.3 19L5.5 6.5" />
      <path d="M10 10.5v5.5M14 10.5v5.5" />
    </svg>
  )
}

export function IconEdit({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 20h8.5" />
      <path d="M16.6 3.9a2.1 2.1 0 0 1 3 3L7.4 19.1 3.5 20l.9-3.9Z" />
    </svg>
  )
}

export function IconRefresh({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 5.5V10h-4.5" />
      <path d="M4 18.5V14h4.5" />
      <path d="M18.4 9.2A7 7 0 0 0 6 7.3L4 10" />
      <path d="M5.6 14.8A7 7 0 0 0 18 16.7L20 14" />
    </svg>
  )
}

export function IconPlay({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 4.8v14.4L19.5 12 7 4.8Z" />
    </svg>
  )
}

export function IconDownload({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" />
      <path d="M4 19h16" />
    </svg>
  )
}

export function IconCopy({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
  )
}

export function IconCheck({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m20 6-10.5 11L4 11.5" />
    </svg>
  )
}

export function IconX({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function IconChevronLeft({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  )
}

export function IconChevronRight({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  )
}

export function IconChevronDown({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  )
}

export function IconArrowUp({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 19V5m0 0-5 5m5-5 5 5" />
    </svg>
  )
}

export function IconArrowDown({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14m0 0 5-5m-5 5-5-5" />
    </svg>
  )
}

export function IconDatabase({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v13c0 1.65 3.36 3 7.5 3s7.5-1.35 7.5-3v-13" />
      <path d="M4.5 12c0 1.65 3.36 3 7.5 3s7.5-1.35 7.5-3" />
    </svg>
  )
}

export function IconSparkles({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
      <path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
    </svg>
  )
}

export function IconTerminal({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5 8 4 4-4 4" />
      <path d="M12.5 16H19" />
    </svg>
  )
}

export function IconAlert({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V13M12 16.4h.01" />
    </svg>
  )
}

export function IconInfo({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6h.01" />
    </svg>
  )
}

export function IconFileExcel({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="m9 12 6 6m0-6-6 6" />
    </svg>
  )
}

export function IconPanelLeft({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
      <path d="M6 9h.5M6 12h.5M6 15h.5" />
    </svg>
  )
}

export function IconRows({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
    </svg>
  )
}
