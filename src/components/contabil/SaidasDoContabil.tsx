"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { TabelaContabil } from "./TabelaContabil";
import { moeda } from "@/lib/financeiro/formato";
import { ROTULO_DA_SAIDA, TIPOS_DE_SAIDA, type ContaDaSaida, type TipoDeSaida } from "@/lib/contabil/saidas";
import type { PainelDasSaidas } from "@/lib/contabil/servidor";
import { salvarContaDaSaida } from "@/app/(app)/contabil/sped/actions";

/**
 * O passo 6 (03/11/2026): o faturamento do mês em um lançamento por dia e por
 * tipo. As contas ficam aqui mesmo, ao lado do que geram, como no painel do
 * motor; até alguém gravar, valem os códigos dele.
 */
export function SaidasDoContabil({ painel: p, empresaId, mes, podeAgir }: { painel: PainelDasSaidas; empresaId: string; mes: string; podeAgir: boolean }) {
  const total = (tipo: TipoDeSaida) => p.dias.reduce((s, d) => s + d[tipo].centavos, 0);
  const qtd = (tipo: TipoDeSaida) => p.dias.reduce((s, d) => s + d[tipo].qtd, 0);
  const exportar = (formato: string) => "/api/contabil/saidas?" + new URLSearchParams({ empresa: empresaId, mes, formato });
  return <div className="space-y-4 min-w-0">
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="text-card-title font-semibold">Contas das saídas</h3>
        <p className="text-helper text-fg-secondary">Um lançamento por dia e por tipo, com o total emitido. Valem para a matriz e as filiais.</p>
      </div>
      <div className="space-y-2">{TIPOS_DE_SAIDA.map((tipo) => <ContaDoTipo key={tipo} tipo={tipo} inicial={p.contas[tipo]} padrao={!p.gravadas.includes(tipo)} empresaId={empresaId} podeAgir={podeAgir} />)}</div>
    </Card>
    {!p.codigoFilial && <Aviso tom="atencao">A empresa não tem o código da filial na Domínio. Cadastre na ficha da empresa, ou em Plano e contas, para a coluna Matriz/Filial sair preenchida.</Aviso>}
    <div className="flex flex-wrap items-center gap-2">
      {p.linhas.length > 0 && <><Button size="sm" href={exportar("xlsx")} download>Planilha da Domínio (.xlsx)</Button>
      <Button size="sm" variant="secondary" href={exportar("txt")} download>Arquivo .txt</Button></>}
      <span className="text-helper text-fg-muted">{p.linhas.length} lançamento(s) no mês</span>
    </div>
    {p.dias.length > 0 && <p className="text-label font-medium">{TIPOS_DE_SAIDA.map((t) => `${ROTULO_DA_SAIDA[t]}: ${qtd(t)} nota(s) · ${moeda(total(t))}`).join("  ·  ")}</p>}
    <TabelaContabil colunas={["Dia", "CT-e", "Valor do CT-e", "NFS-e", "Valor da NFS-e"]} vazio="Nenhuma nota emitida pela empresa no mês." linhas={p.dias.map((d) => ({ id: d.data, celulas: [d.data.split("-").reverse().join("/"), d.cte.qtd || "—", d.cte.qtd ? moeda(d.cte.centavos) : "—", d.nfse.qtd || "—", d.nfse.qtd ? moeda(d.nfse.centavos) : "—"] }))} />
  </div>;
}

function ContaDoTipo({ tipo, inicial, padrao, empresaId, podeAgir }: { tipo: TipoDeSaida; inicial: ContaDaSaida; padrao: boolean; empresaId: string; podeAgir: boolean }) {
  const [valores, setValores] = useState(inicial);
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const mudou = valores.debito !== inicial.debito || valores.credito !== inicial.credito || valores.historico !== inicial.historico;
  const campo = (chave: keyof ContaDaSaida, rotulo: string) => <label className="block w-28"><span className="block text-helper text-fg-secondary">{rotulo}</span>
    <Input compact inputMode="numeric" value={valores[chave]} disabled={!podeAgir || pendente} onChange={(e) => setValores((v) => ({ ...v, [chave]: e.target.value }))} /></label>;
  return <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); iniciar(async () => {
    const r = await salvarContaDaSaida({ empresa: empresaId, tipo, ...valores });
    if (r.ok) { toast.success(r.mensagem); router.refresh(); } else toast.error(r.erro);
  }); }}>
    <span className="w-16 pb-1.5 text-ui font-semibold">{ROTULO_DA_SAIDA[tipo]}</span>
    {campo("debito", "Débito")}{campo("credito", "Crédito")}{campo("historico", "Histórico")}
    {padrao && !mudou && <span className="pb-1.5"><Selo>Padrão do motor</Selo></span>}
    {podeAgir && mudou && <Button size="sm" type="submit" loading={pendente}>Salvar</Button>}
  </form>;
}
