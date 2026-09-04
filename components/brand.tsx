import { cn } from '@/lib/utils';

export function ScoutCrest({ className }: { className?: string }) {
  return (
    <svg className={cn('scout-crest', className)} viewBox="0 0 64 64">
      <title>TCG Scout compass-eye crest</title>
      <defs>
        <linearGradient id="crest-gold" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f1cf7a" />
          <stop offset="1" stopColor="#9b6a2f" />
        </linearGradient>
      </defs>
      <path
        d="M32 3 53 11v18c0 14-8 25-21 32C19 54 11 43 11 29V11Z"
        fill="#121713"
        stroke="url(#crest-gold)"
        strokeWidth="2"
      />
      <path d="M32 11v42M17 29h30" stroke="#765c9d" strokeOpacity=".55" />
      <path d="m32 14 4.3 10.5L32 29l-4.3-4.5Z" fill="#e4bd65" />
      <path
        d="M18 32c4.4-6.1 9.1-9.2 14-9.2s9.6 3.1 14 9.2c-4.4 6.1-9.1 9.2-14 9.2S22.4 38.1 18 32Z"
        fill="#211b17"
        stroke="#c99a43"
        strokeWidth="1.5"
      />
      <circle
        cx="32"
        cy="32"
        r="5"
        fill="#536fae"
        stroke="#e8ddc2"
        strokeWidth="1.5"
      />
      <circle cx="32" cy="32" r="1.7" fill="#080a0d" />
      <path
        d="m43 16 1.1 2.8L47 20l-2.9 1.1L43 24l-1.1-2.9L39 20l2.9-1.2Z"
        fill="#e4bd65"
      />
    </svg>
  );
}

export function RuneDivider({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('rune-divider', className)}
      viewBox="0 0 240 10"
      preserveAspectRatio="none"
    >
      <path
        d="M0 5h96l7-4 7 8 10-8 10 8 7-4h103"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="120" cy="5" r="2.2" fill="currentColor" />
    </svg>
  );
}
