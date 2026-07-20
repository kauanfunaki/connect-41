import Link from "next/link";
import { Button } from "@/components/ui/Button";

type Props = {
  cancelHref: string;
  pending: boolean;
  submitLabel?: string;
  cancelLabel?: string;
};

// Rodapé padrão de formulário simples: [Cancelar] [Salvar], alinhado à
// direita — antes cada form de cadastro (turno/benefício/departamento/cargo/
// documento) reimplementava esses dois botões à mão, com classes ligeiramente
// diferentes e ordem/alinhamento inconsistente entre eles (e um sem Cancelar).
export function FormFooter({ cancelHref, pending, submitLabel = "Salvar", cancelLabel = "Cancelar" }: Props) {
  return (
    <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-border">
      <Link
        href={cancelHref}
        className="h-9 px-4 rounded-[10px] border border-border-strong text-[length:var(--fs-button)] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors inline-flex items-center"
      >
        {cancelLabel}
      </Link>
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </div>
  );
}
