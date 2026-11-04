import Link from "next/link";

type BrandLogoProps = { href?: string; className?: string; label?: string };

export function BrandLogo({ href, className = "", label = "TestaFila" }: BrandLogoProps) {
  const mark = <>
    <svg className="brand-logo-mark" viewBox="0 0 27 28" aria-hidden="true" focusable="false">
      <path d="M3 25V3h21v10H12v12" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="24" cy="25" r="3" fill="currentColor" stroke="none" />
    </svg>
    <span className="brand-logo-name">testa<span className="wordmark-light">fila</span></span>
  </>;
  const classes = `brand-logo ${className}`.trim();
  return href
    ? <Link className={classes} href={href} aria-label={label}>{mark}</Link>
    : <div className={classes} role="img" aria-label={label}>{mark}</div>;
}
