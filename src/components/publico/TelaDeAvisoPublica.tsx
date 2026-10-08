import type { ReactNode } from "react";

type Tom = "neutro" | "sucesso" | "perigo";

const COR_DO_ICONE: Record<Tom, string> = {
  neutro: "bg-surface-2 text-fg-muted",
  sucesso: "bg-success/10 text-success-fg",
  perigo: "bg-danger/10 text-danger",
};

/**
 * A tela inteira de aviso das rotas públicas: link inválido, expirado, já
 * respondido e o `error.tsx` (07/10/2026, auditoria DRG-28).
 *
 * Na mesma rota conviviam dois desenhos — o aviso de link inválido sem ícone e
 * a tela de erro com o ícone numa caixa vermelha —, e o `TokenInvalido` estava
 * copiado em /admissao e em /teste, e o `error.tsx` em três rotas. Agora é um
 * desenho só: ícone em caixa, título, texto e, quando houver, a ação.
 *
 * Sem "use client": serve à página (servidor) e ao `error.tsx` (cliente).
 */
export function TelaDeAvisoPublica({
  titulo,
  texto,
  icone,
  tom = "neutro",
  children,
}: {
  titulo: string;
  texto: string;
  icone: ReactNode;
  tom?: Tom;
  /** A ação embaixo do texto ("Tentar novamente"). */
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px] ${COR_DO_ICONE[tom]}`}>
          {icone}
        </span>
        <h1 className="text-section font-semibold text-fg">{titulo}</h1>
        <p className="text-ui text-fg-muted">{texto}</p>
        {children}
      </div>
    </div>
  );
}
