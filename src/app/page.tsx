export default function Home() {
  return (
    <main className="flex-1 grid place-items-center p-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-base font-semibold text-on-brand">
            C
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Connect 41</h1>
            <p className="text-[13px] text-fg-secondary">CRM interno · 41 Tech</p>
          </div>
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-fg-secondary">
          Fundação técnica no ar. Tokens de design, tipografia IBM Plex e tema
          claro/escuro carregados.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-on-brand">
            Etapa 5 · setup
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-fg-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            ambiente operante
          </span>
          <span className="tnum rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-fg-muted">
            v0.1.0
          </span>
        </div>
      </div>
    </main>
  );
}
