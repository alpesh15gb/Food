/** Market Table design: reusable paper stamps and ingredient linework keep transactional screens restaurant-led. */
import type { ReactNode } from "react";

export function TicketStamp({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[#c8916b] bg-[#fff5e9] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#a65a37] shadow-[2px_2px_0_rgba(182,116,76,0.12)] ${className}`}>{children}</span>;
}

export function IngredientSprig({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 160 120" fill="none" className={`pointer-events-none ${className}`}>
    <path d="M16 110C44 92 63 71 82 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M42 86C24 77 21 61 31 54C43 61 48 73 42 86Z" stroke="currentColor" strokeWidth="1.2" />
    <path d="M55 65C69 54 81 57 85 68C73 76 61 75 55 65Z" stroke="currentColor" strokeWidth="1.2" />
    <path d="M68 42C55 34 55 20 67 15C78 26 79 37 68 42Z" stroke="currentColor" strokeWidth="1.2" />
    <path d="M33 104C30 92 39 83 51 86C52 98 43 106 33 104Z" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="104" cy="31" r="16" stroke="currentColor" strokeWidth="1.2" />
    <path d="M94 31h20M104 21v20" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M122 97c10-12 13-28 5-43" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M127 72c-12 1-17-6-15-14 11-2 18 4 15 14Z" stroke="currentColor" strokeWidth="1.2" />
  </svg>;
}
