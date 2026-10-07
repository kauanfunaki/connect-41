import { Button } from "@/components/ui/Button";

type Props = {
  pending: boolean;
  submitLabel?: string;
  /** O rótulo enquanto envia — "Criando…", "Enviando…". Padrão: "Salvando…". */
  pendingLabel?: string;
  cancelLabel?: string;
  /** Cancelar que navega — formulário de página. */
  cancelHref?: string;
  /** Cancelar que fecha — modal, painel, edição na linha. Fica desabilitado
   *  enquanto envia, para não fechar com o pedido no meio do caminho. */
  onCancel?: () => void;
  /** Erro do envio, à esquerda dos botões. */
  erro?: React.ReactNode;
  /** Explicação curta à esquerda dos botões, quando não há erro. */
  nota?: React.ReactNode;
  /** Trava o envio além do `pending` (campo obrigatório vazio, por exemplo). */
  submitDisabled?: boolean;
  /** Sem a linha de cima: rodapé dentro de um bloco que já tem a sua. */
  semDivisoria?: boolean;
  /** `sm` para barra compacta (edição na linha, painel pequeno). */
  size?: "sm" | "md";
  /**
   * O botão de envio de uma ação destrutiva — Reprovar, Baixar por perda,
   * Cancelar lançamento (07/10/2026). Sem isto, esses modais escreviam o
   * rodapé à mão só para trocar a cor do botão.
   */
  submitVariant?: "primary" | "danger" | "dangerSolid";
};

// Rodapé padrão de formulário: [erro ou nota] … [Cancelar] [Salvar], à
// direita. Antes servia só à página com link; o mesmo rodapé era repetido à
// mão em ~30 modais, com erro em 12 ou 13px, "Salvando…" escrito à mão, o
// Cancelar às vezes travado no envio e às vezes não (02/10/2026).
export function FormFooter({
  pending,
  submitLabel = "Salvar",
  pendingLabel,
  cancelLabel = "Cancelar",
  cancelHref,
  onCancel,
  erro,
  nota,
  submitDisabled = false,
  semDivisoria = false,
  size = "md",
  submitVariant = "primary",
}: Props) {
  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-3 ${semDivisoria ? "" : "pt-4 mt-2 border-t border-border"}`.trim()}
    >
      {erro ? (
        <p className="mr-auto text-helper font-medium text-danger" role="alert">
          {erro}
        </p>
      ) : nota ? (
        <p className="mr-auto text-helper text-fg-muted">{nota}</p>
      ) : null}
      {cancelHref !== undefined ? (
        <Button href={cancelHref} variant="secondary" size={size}>
          {cancelLabel}
        </Button>
      ) : onCancel ? (
        <Button type="button" variant="secondary" size={size} onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="submit" variant={submitVariant} size={size} loading={pending} loadingLabel={pendingLabel} disabled={submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
}
