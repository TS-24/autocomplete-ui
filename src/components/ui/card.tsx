import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, description, children, className = "" }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 ${className}`}
    >
      {(title || description) && (
        <header className="border-b border-zinc-800 px-5 py-4">
          {title && (
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
          )}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
