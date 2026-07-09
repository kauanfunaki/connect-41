export function AuthShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-canvas">
      {/* Coluna do formulário */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-9 flex items-center justify-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Connect" className="h-8 w-8 object-contain flex-shrink-0" />
            <span className="text-fg font-semibold text-[14px] tracking-[-0.01em]">
              41 Tech
            </span>
          </div>

          <h1 className="text-fg font-semibold text-[20px] tracking-[-0.01em] mb-1.5 text-center">
            Connect
          </h1>
          <p className="text-fg-muted text-[13px] mb-7 text-center">{subtitle}</p>

          {children}

          <p className="text-[10px] text-fg-muted mt-8 text-center">
            Connect · Uso interno 41 Tech
          </p>
        </div>
      </div>

      {/* Painel de marca */}
      <div
        className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center p-14"
        style={{ background: "var(--c41-brand-900)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative max-w-[360px] text-center flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Connect" className="h-10 w-10 object-contain mb-7" />
          <h2 className="text-[23px] font-semibold text-white tracking-[-0.01em] mb-3 leading-snug">
            Tudo o que a 41 Tech acompanha, num só lugar.
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.62)" }}>
            Contábil, Fiscal, Societário, DP/RH, Recrutamento e mais — o Connect
            centraliza empresas, pessoas e o fluxo de trabalho de todos os setores da 41 Tech.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthField({
  label,
  htmlFor,
  icon,
  children,
}: {
  label: string;
  htmlFor: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-canvas focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-colors">
        <span className="text-fg-muted flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        {children}
      </div>
    </div>
  );
}

export const AUTH_INPUT =
  "w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none";
