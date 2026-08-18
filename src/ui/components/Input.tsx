import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const FIELD_STYLE =
  "w-full rounded-field border-hairline border-line-hairline bg-surface-card px-3 py-2 text-body text-content-primary placeholder:text-content-muted focus:outline-none focus:border-line-strong";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_STYLE} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_STYLE} ${className}`} {...props} />;
}
