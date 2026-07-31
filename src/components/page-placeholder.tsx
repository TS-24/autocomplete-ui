interface PagePlaceholderProps {
  title: string;
  description: string;
  note: string;
}

export function PagePlaceholder({
  title,
  description,
  note,
}: PagePlaceholderProps) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          {title}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">{description}</p>
      </header>
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-10 text-center">
        <p className="text-sm text-zinc-400">
          This view is part of the upcoming phases.
        </p>
        <p className="max-w-md text-xs text-zinc-600">{note}</p>
      </div>
    </div>
  );
}
