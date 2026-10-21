"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import type { EmpresaDaCeci } from "@/lib/portal/ceci";

type Resultado = { ok: true } | { erro: string };

type Props = {
  empresas: EmpresaDaCeci[];
  /** `definirCeciDaEmpresa`, que confere de novo o papel e o escritório. */
  definirAction: (companyId: string, ligada: boolean) => Promise<Resultado>;
  somenteLeitura?: boolean;
};

/**
 * A Ceci no portal, empresa a empresa (21/10/2026), em Administração › Portal
 * do cliente › Ceci. O mesmo jeito das telas liberadas: um interruptor por
 * linha, que vale na hora; um erro volta o interruptor para onde estava.
 */
export function CeciDoPortalAdmin({ empresas, definirAction, somenteLeitura = false }: Props) {
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const [trocadas, setTrocadas] = useState<Record<string, boolean>>({});
  const ligadaAgora = (e: EmpresaDaCeci) => trocadas[e.id] ?? e.ligada;

  function trocar(e: EmpresaDaCeci, ligada: boolean) {
    const antes = ligadaAgora(e);
    setTrocadas((atual) => ({ ...atual, [e.id]: ligada }));
    startTransition(async () => {
      const r = await definirAction(e.id, ligada).catch(() => ({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }));
      if ("erro" in r) {
        setTrocadas((atual) => ({ ...atual, [e.id]: antes }));
        toast.error(r.erro);
        return;
      }
      toast.success(ligada ? `Ceci ligada para ${e.nome}.` : `Ceci desligada para ${e.nome}.`);
    });
  }

  if (empresas.length === 0) {
    return (
      <Card className="px-4 py-6 text-fs-2 text-fg-muted">
        Nenhuma empresa tem acesso ao portal ainda. Crie um acesso na aba Acessos ou na ficha da empresa.
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      {empresas.map((e) => {
        const id = `ceci-${e.id}`;
        return (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-64" id={id}>
              <p className="text-fs-3 text-fg">{e.nome}</p>
              <p className="text-fs-1 text-fg-muted">
                {e.acessos} {e.acessos === 1 ? "acesso" : "acessos"} no portal
                {e.filiais > 0 && ` · ${e.filiais} ${e.filiais === 1 ? "filial vem junto" : "filiais vêm junto"}`}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={ligadaAgora(e)}
                onCheckedChange={(v) => trocar(e, v)}
                disabled={somenteLeitura || pendente}
                rotulo={ligadaAgora(e) ? "Ligada" : "Desligada"}
                aria-label={`Ceci no portal para ${e.nome}`}
                aria-describedby={id}
              />
            </div>
          </div>
        );
      })}
    </Card>
  );
}
