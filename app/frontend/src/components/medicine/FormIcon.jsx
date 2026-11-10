/**
 * Rasmi yo'q dori uchun neytral shakl ikonkasi (soxta qadoq emas).
 */
export default function FormIcon({ form, className = "h-12 w-12", label }) {
  const key = String(form || "tablet").toLowerCase();
  const title = label || key;

  if (key === "capsule" || key.includes("kaps")) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden={!title} role={title ? "img" : "presentation"}>
        {title ? <title>{title}</title> : null}
        <rect x="18" y="10" width="28" height="44" rx="14" fill="currentColor" opacity="0.18" />
        <path d="M18 32h28" stroke="currentColor" strokeWidth="2" />
        <rect x="18" y="10" width="28" height="22" rx="14" fill="currentColor" opacity="0.45" />
      </svg>
    );
  }
  if (key === "syrup" || key.includes("sirop")) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden={!title} role={title ? "img" : "presentation"}>
        {title ? <title>{title}</title> : null}
        <rect x="22" y="8" width="20" height="10" rx="3" fill="currentColor" opacity="0.35" />
        <path d="M20 18h24l4 38H16l4-38z" fill="currentColor" opacity="0.2" />
        <path d="M24 34h16v18H24z" fill="currentColor" opacity="0.45" />
      </svg>
    );
  }
  if (key === "injection" || key === "infusion" || key.includes("inyeks") || key.includes("amp")) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden={!title} role={title ? "img" : "presentation"}>
        {title ? <title>{title}</title> : null}
        <path d="M38 8l10 10-22 22-6-6 18-26z" fill="currentColor" opacity="0.35" />
        <rect x="14" y="36" width="16" height="8" rx="2" transform="rotate(-45 22 40)" fill="currentColor" opacity="0.5" />
        <circle cx="16" cy="50" r="4" fill="currentColor" opacity="0.55" />
      </svg>
    );
  }
  if (key === "ointment" || key.includes("malham") || key.includes("krem") || key.includes("gel")) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden={!title} role={title ? "img" : "presentation"}>
        {title ? <title>{title}</title> : null}
        <rect x="18" y="14" width="28" height="36" rx="6" fill="currentColor" opacity="0.2" />
        <rect x="24" y="8" width="16" height="8" rx="2" fill="currentColor" opacity="0.4" />
        <path d="M24 30c4 6 12 6 16 0" stroke="currentColor" strokeWidth="3" fill="none" />
      </svg>
    );
  }
  if (key === "spray" || key.includes("sprey")) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden={!title} role={title ? "img" : "presentation"}>
        {title ? <title>{title}</title> : null}
        <rect x="22" y="20" width="20" height="32" rx="6" fill="currentColor" opacity="0.25" />
        <rect x="28" y="10" width="8" height="12" rx="2" fill="currentColor" opacity="0.45" />
        <circle cx="44" cy="14" r="3" fill="currentColor" opacity="0.35" />
        <circle cx="50" cy="10" r="2" fill="currentColor" opacity="0.25" />
      </svg>
    );
  }
  if (key === "drops" || key.includes("tomchi")) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden={!title} role={title ? "img" : "presentation"}>
        {title ? <title>{title}</title> : null}
        <path d="M32 8c10 14 16 22 16 30a16 16 0 1 1-32 0c0-8 6-16 16-30z" fill="currentColor" opacity="0.3" />
      </svg>
    );
  }

  // tablet (default)
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden={!title} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <ellipse cx="32" cy="32" rx="22" ry="14" fill="currentColor" opacity="0.22" />
      <path d="M12 32h40" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}
