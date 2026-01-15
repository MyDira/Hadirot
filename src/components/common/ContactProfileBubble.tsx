interface ContactProfileBubbleProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(name: string): string {
  if (!name || typeof name !== 'string') {
    return '?';
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  const firstInitial = words[0].charAt(0).toUpperCase();
  const lastInitial = words[words.length - 1].charAt(0).toUpperCase();

  return firstInitial + lastInitial;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

export function ContactProfileBubble({ name, size = 'md', className = '' }: ContactProfileBubbleProps) {
  const initials = getInitials(name);

  return (
    <div
      className={`
        ${sizeClasses[size]}
        bg-[#273140]
        ring-2 ring-accent-500/30
        text-white
        font-semibold
        rounded-full
        flex
        items-center
        justify-center
        flex-shrink-0
        ${className}
      `}
      aria-label={name || 'Contact'}
    >
      {initials}
    </div>
  );
}
