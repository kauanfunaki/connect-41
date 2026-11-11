import { CircleHelp } from "lucide-react";

/**
 * O "?" que explica uma linha da DRE para o cliente (11/11/2026, P16). Botão de
 * verdade: o `DicaFlutuante` abre a frase no toque, no foco por teclado e ao
 * passar o mouse. O nome acessível leva a frase inteira, porque a dica em si
 * não é lida pelo leitor de tela.
 *
 * `sobreAzul`: no cartão de destaque, o "?" em branco.
 */
export function BotaoDaDica({ rotulo, dica, sobreAzul = false }: { rotulo: string; dica: string; sobreAzul?: boolean }) {
  return (
    <button
      type="button"
      data-dica={dica}
      aria-label={`O que é ${rotulo.toLowerCase()}: ${dica}`}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        sobreAzul ? "text-on-brand/90 hover:bg-on-brand/15" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
      }`}
    >
      <CircleHelp size={15} aria-hidden />
    </button>
  );
}
