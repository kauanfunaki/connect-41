import { CampoForm } from "@/components/ui/CampoForm";

// Até 06/10/2026 este arquivo tinha também o `AuthShell`, a moldura das telas
// de entrada da equipe (o formulário e um painel azul fixo). Saiu quando a
// equipe passou a usar a moldura do portal — ver `login/MolduraDaEquipe`. Ficam
// aqui a caixa com ícone e a classe do campo, que os formulários da equipe usam.

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
