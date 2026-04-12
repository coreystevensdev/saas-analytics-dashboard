interface TellsightLogoProps {
  size?: number;
  className?: string;
}

export function TellsightLogo({ size = 20, className }: TellsightLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" className="fill-primary/15" />
      <rect x="8" y="22" width="6" height="12" rx="2" className="fill-primary/70" />
      <rect x="17" y="14" width="6" height="20" rx="2" className="fill-primary/85" />
      <rect x="26" y="8" width="6" height="26" rx="2" className="fill-primary" />
    </svg>
  );
}
