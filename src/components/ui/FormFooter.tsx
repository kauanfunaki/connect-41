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
      {/* Era um Link com classes próprias — 15px e font-medium ao lado de um
          Salvar de 13px semibold (apontado por 4 agentes na revisão de 30/09). */}
      <Button href={cancelHref} variant="secondary">
        {cancelLabel}
      </Button>
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </div>
  );
}
