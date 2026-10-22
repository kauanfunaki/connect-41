"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { formatInstantDateTime } from "@/lib/format";
import type { EmpresaDaRede } from "@/lib/drive/pastaDeRedeServidor";

type Resultado = { ok: true } | { erro: string };

type Props = {
  empresas: EmpresaDaRede[];
  /** `definirPastaDeRedeDaEmpresa`, que confere de novo o papel e o escritório. */
  definirAction: (companyId: string, ligada: boolean) => Promise<Resultado>;
  somenteLeitura?: boolean;
};

const quando = (iso: string) => formatInstantDateTime(new Date(iso), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * O piloto da pasta de rede, empresa a empresa (21/10/2026), em Administração ›
 * Arquivos. As ligadas ficam na lista, com um interruptor; as outras se
 * escolhem na busca — são centenas, e o piloto é de poucas por vez.
 */
export function PastaDeRedeAdmin({ empresas, definirAction, somenteLeitura = false }: Props) {
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const [trocadas, setTrocadas] = useState<Record<string, boolean>>({});
  const [escolhida, setEscolhida] = useState("");
  const ligadaAgora = (e: EmpresaDaRede) => trocadas[e.id] ?? e.ligada;

  // A lista do piloto é a do servidor mais as ligadas nesta tela; desligar
  // aqui mantém a linha até recarregar, para dar para voltar atrás.
  const doPiloto = empresas.filter((e) => e.ligada || e.id in trocadas);
  const opcoes = empresas
    .filter((e) => !ligadaAgora(e))
    .map((e) => ({ value: e.id, label: e.nome, descricao: e.cnpj ?? undefined, busca: e.cnpj?.replace(/\D/g, "") }));

  function trocar(e: EmpresaDaRede, ligada: boolean) {
    const antes = ligadaAgora(e);
    setTrocadas((atual) => ({ ...atual, [e.id]: ligada }));
    startTransition(async () => {
      const r = await definirAction(e.id, ligada).catch(() => ({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }));
      if ("erro" in r) {
        setTrocadas((atual) => ({ ...atual, [e.id]: antes }));
        toast.error(r.erro);
        return;
      }
      toast.success(ligada ? `Pasta de rede ligada para ${e.nome}.` : `Pasta de rede desligada para ${e.nome}.`);
    });
  }

  function ligarEscolhida() {
    const e = empresas.find((x) => x.id === escolhida);
    if (!e) return;
    setEscolhida("");
    trocar(e, true);
  }

  return (
    <div className="space-y-3">
      {!somenteLeitura && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-72">
            <SearchableSelect
              key={Object.keys(trocadas).length}
              name="empresa-da-rede"
              options={opcoes}
              placeholder="Escolha a empresa para o piloto…"
              aria-label="Empresa para ligar a pasta de rede"
              onChange={setEscolhida}
            />
          </div>
          <Button onClick={ligarEscolhida} disabled={!escolhida || pendente}>
            Ligar no piloto
          </Button>
        </div>
      )}

      {doPiloto.length === 0 ? (
        <Card className="px-4 py-6 text-fs-2 text-fg-muted">Nenhuma empresa no piloto ainda. O robô recusa o que achar na rede até alguma ser ligada.</Card>
      ) : (
        <Card className="divide-y divide-border">
          {doPiloto.map((e) => {
            const id = `rede-${e.id}`;
            return (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64" id={id}>
                  <p className="text-fs-3 text-fg">{e.nome}</p>
                  <p className="text-fs-1 text-fg-muted">
                    {e.cnpj ?? "Sem CNPJ"} ·{" "}
                    {e.recebidos === 0
                      ? "nada recebido ainda"
                      : `${e.recebidos} ${e.recebidos === 1 ? "arquivo recebido" : "arquivos recebidos"}, o último em ${quando(e.ultimoEm!)}`}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <Switch
                    checked={ligadaAgora(e)}
                    onCheckedChange={(v) => trocar(e, v)}
                    disabled={somenteLeitura || pendente}
                    rotulo={ligadaAgora(e) ? "Ligada" : "Desligada"}
                    aria-label={`Pasta de rede nos Arquivos para ${e.nome}`}
                    aria-describedby={id}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
