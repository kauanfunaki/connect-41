"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useConfirm } from "@/components/ui/useConfirm";
import { mesInteiro, parametrosIniciais } from "@/lib/fiscal/previa/execucao";
import { solicitarExecucaoNoMotor } from "@/app/(app)/fiscal/motor-actions";
import { useChaveDeIdempotencia } from "@/components/fiscal/motor/useChaveDeIdempotencia";

type Existente = { id?: number; estado?: string; solicitado_por?: string };

/**
 * O pedido de geração da EFD ICMS/IPI (29/10/2026): a empresa e o mês já vêm
 * da tela, então sobra escolher original ou substituto. O pedido vai para a
 * fila do motor, e um agente gera — não há geração dentro do Connect.
 *
 * As duas opções de forçar ficam recolhidas: são exceção, e no formulário
 * antigo (Executar) apareciam ao lado do botão.
 */
export function GerarArquivo({ raiz, estabelecimentoId, competencia, nomeDoMes, jaTemArquivo, emAndamento, pode, motivo }: {
  raiz: string;
  estabelecimentoId: number;
  competencia: string;
  nomeDoMes: string;
  jaTemArquivo: boolean;
  emAndamento: boolean;
  pode: boolean;
  motivo: string | null;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"0" | "1">("0");
  const [forcarErros, setForcarErros] = useState(false);
  const [forcarCobertura, setForcarCobertura] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const { dialog, requestConfirm } = useConfirm();

  async function enviar(confirmarDuplicado: boolean) {
    const [dataIni, dataFim] = mesInteiro(competencia);
    const parametros = { ...parametrosIniciais(competencia, "sped"), dataIni, dataFim, tipoSped: tipo, forcarErros, forcarCobertura, saida: `sped_icms_${competencia}.txt` };
    const r = await solicitarExecucaoNoMotor({ raiz, estabelecimentoId, parametros, confirmarDuplicado, chave });
    depoisDe(r);
    if (!r.ok && r.codigo === "execucao_duplicada") {
      const existente = (r.detalhe?.existente ?? {}) as Existente;
      requestConfirm({
        title: "Já existe um pedido igual",
        description: `O pedido #${existente.id ?? "?"} (${existente.estado ?? "aberto"}${existente.solicitado_por ? `, de ${existente.solicitado_por}` : ""}) gera o mesmo arquivo. Pedir outro mesmo assim?`,
        confirmLabel: "Pedir mesmo assim",
      }, () => enviar(true));
      return;
    }
    setResultado({ ok: r.ok, mensagem: r.mensagem });
    if (r.ok) router.refresh();
  }

  return <Card className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-xl">
        <h2 className="text-card-title font-semibold text-fg">{jaTemArquivo ? `Gerar de novo o arquivo de ${nomeDoMes}` : `Gerar o arquivo de ${nomeDoMes}`}</h2>
        <p className="mt-1 text-ui text-fg-secondary">O motor SPED gera com as decisões gravadas até agora (classificação, créditos e ajustes) e guarda uma nova versão. Acompanhe o andamento aqui mesmo.</p>
      </div>
      <SegmentedControl<"0" | "1"> label="Tipo do arquivo" active={tipo} onChange={setTipo}
        items={[{ key: "0", label: "Original" }, { key: "1", label: "Substituto", title: "Retificação de um arquivo já entregue." }]} />
    </div>
    <BlocoRecolhivel titulo="Opções de exceção" abertoInicial={forcarErros || forcarCobertura} className="mt-4">
      <div className="flex flex-wrap gap-5">
        <Checkbox id="sped-forcar-erros" label="Gerar mesmo com erro de extração pendente" checked={forcarErros} onChange={(e) => setForcarErros(e.target.checked)} />
        <Checkbox id="sped-forcar-cobertura" label="Gerar mesmo com a cobertura de documentos incompleta" checked={forcarCobertura} onChange={(e) => setForcarCobertura(e.target.checked)} />
      </div>
    </BlocoRecolhivel>
    {motivo && <div className="mt-4"><Aviso tom="info">{motivo}</Aviso></div>}
    {emAndamento && <div className="mt-4"><Aviso tom="neutro">Já há uma geração desta empresa na fila ou executando, acompanhada abaixo.</Aviso></div>}
    {resultado && <div className="mt-4" role={resultado.ok ? "status" : "alert"}><Aviso tom={resultado.ok ? "sucesso" : "atencao"}>{resultado.mensagem}</Aviso></div>}
    <div className="mt-5 flex justify-end">
      <Button disabled={!pode || pendente} loading={pendente} loadingLabel="Enviando…" onClick={() => { setResultado(null); iniciar(() => enviar(false)); }}>
        <Play size={15} aria-hidden /> Gerar SPED
      </Button>
    </div>
    {dialog}
  </Card>;
}
