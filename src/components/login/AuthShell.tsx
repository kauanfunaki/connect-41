import { CampoForm } from "@/components/ui/CampoForm";

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
          <div className="mb-8 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-light.svg" alt="Connect" className="block dark:hidden h-8 w-auto object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-dark.svg" alt="Connect" className="hidden dark:block h-8 w-auto object-contain" />
          </div>

          <p className="text-fg-muted text-[13px] mb-7 text-center">{subtitle}</p>

          {children}

          <p className="text-[length:var(--fs-micro)] text-fg-muted mt-8 text-center">
            Connect
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
          <img src="/brand/symbol-color-dark-bg.svg" alt="Connect" className="h-10 w-10 object-contain mb-7" />
          <h2 className="text-[23px] font-semibold text-white tracking-[-0.01em] mb-3 leading-snug">
            Tudo o que sua empresa acompanha, num só lugar.
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.62)" }}>
            Contábil, Fiscal, Societário, DP/RH, Recrutamento e mais — o Connect
            centraliza empresas, pessoas e o fluxo de trabalho de todos os setores do seu negócio.
          </p>
        </div>
      </div>
    </div>
  );
}

// O rótulo é o do CampoForm, e a caixa copia a do ui/Input (borda, fundo e
// anel de foco): eram 12px no rótulo e no texto, e a caixa tinha o anel e o
// fundo próprios. O ícone dentro da caixa é o que fica só daqui.
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
    <CampoForm label={label} htmlFor={htmlFor}>
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border-strong bg-input-bg transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]">
        <span className="text-fg-muted flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        {children}
      </div>
    </CampoForm>
  );
}

// 16px (--fs-input), e não os 12px de antes: abaixo disso o Safari do iPhone
// dá zoom ao focar o campo — e o cliente do portal cai no esqueci-senha daqui.
export const AUTH_INPUT =
  "w-full min-w-0 h-full bg-transparent text-[length:var(--fs-input)] text-fg placeholder:text-fg-muted outline-none border-none";
