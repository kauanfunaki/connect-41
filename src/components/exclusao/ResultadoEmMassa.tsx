"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { formatarNumero } from "@/lib/format";
import type { ResultadoEmMassa } from "@/lib/exclusao/tipos";

const empresas = (n: number) => `${formatarNumero(n, 0)} empresa${n === 1 ? "" : "s"}`;

/**
 * O fim da exclusão em massa de empresas: o que saiu e o que ficou, com o
 * porquê. Antes a tela disparava a exclusão sem esperar, e uma empresa com
 * histórico fazia o lote inteiro falhar sem aviso nenhum.
 */
export function ResultadoDaExclusaoEmMassa({ resultado, onFechar }: { resultado: ResultadoEmMassa | null; onFechar: () => void }) {
  if (!resultado) return null;
  const { excluidas, recusadas } = resultado;
  return (
    <Modal open onClose={onFechar} title="Exclusão em massa" maxWidth="max-w-lg">
      <div className="space-y-3">
        <p className="text-ui text-fg">
          {excluidas.length > 0 ? `${empresas(excluidas.length)} excluída${excluidas.length === 1 ? "" : "s"} de vez.` : "Nenhuma empresa foi excluída."}
          {recusadas.length > 0 && ` ${empresas(recusadas.length)} ficou${recusadas.length === 1 ? "" : "aram"}.`}
        </p>

        {excluidas.length > 0 && (
          <BlocoRecolhivel titulo="Excluídas" cor="var(--c41-danger)" resumo={empresas(excluidas.length)}>
            <ul className="space-y-1 text-ui text-fg-secondary">
              {excluidas.map((e) => (
                <li key={e.id}>{e.nome}</li>
              ))}
            </ul>
          </BlocoRecolhivel>
        )}

        {recusadas.length > 0 && (
          <BlocoRecolhivel titulo="Ficaram" cor="var(--c41-fg-muted)" resumo={empresas(recusadas.length)}>
            <ul className="space-y-2 text-ui">
              {recusadas.map((e) => (
                <li key={e.id}>
                  <span className="font-medium text-fg">{e.nome}</span>
                  <span className="block text-helper text-fg-muted">{e.motivo}</span>
                </li>
              ))}
            </ul>
          </BlocoRecolhivel>
        )}

        <p className="text-helper text-fg-muted">Cada exclusão ficou registrada na auditoria.</p>
        <div className="flex justify-end pt-1">
          <Button variant="primary" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
