"use client";

import { Button } from "@/components/ui/Button";

type Props = {
  /** Quem está fora de operação (inativo, cancelado) volta com "Reativar". */
  foraDeOperacao: boolean;
  onToggle: () => void;
  editarHref: string;
  className?: string;
};

/**
 * O par Inativar/Editar que fecha a linha de /empresas, /pessoas e /clientes.
 *
 * Eram três cópias do mesmo markup, e já tinham começado a divergir — uma com
 * `whitespace-nowrap` no span, as outras sem. Com os cartões de mobile seriam
 * seis. O rótulo é a única regra que mora aqui: "Reativar" quando está fora de
 * operação, "Inativar" quando está dentro.
 *
 * `linkMuted` é o que os três já eram escritos à mão: texto apagado que
 * escurece no hover, sem caixa. O tamanho vem daqui e não da variante porque a
 * variante não fixa fonte de propósito.
 */
export function AcoesDeLinha({ foraDeOperacao, onToggle, editarHref, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 whitespace-nowrap ${className}`.trim()}>
      <Button variant="linkMuted" className="text-[13px] font-medium" onClick={onToggle}>
        {foraDeOperacao ? "Reativar" : "Inativar"}
      </Button>
      <Button variant="linkMuted" href={editarHref} className="text-[13px] font-medium">
        Editar
      </Button>
    </span>
  );
}
