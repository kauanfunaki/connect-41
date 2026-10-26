"use client";

import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, FileText, History, ListChecks } from "lucide-react";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fluxoDaCompetencia } from "@/lib/fiscal/previa/fluxo";
import { PAGINAS_FISCAIS, documentosDoContexto, mesmoEscopo, totaisDoContexto } from "@/lib/fiscal/previa/cenario";
import { useFiscal } from "./ContextoFiscal";
import { BlocoFiscal, MetricasFiscais, TabelaFiscal, dataFiscal } from "./Compartilhados";

export function PainelFiscal({ visao }: { visao: string }) {
  const { cenario, modulos } = useFiscal();
  const etapas = fluxoDaCompetencia(cenario, modulos);
  const proxima = etapas.findIndex((e) => !e.completa);
  const etapa = etapas[proxima];
  const completas = etapas.filter((e) => e.completa).length;
  const progresso = Math.round(completas / etapas.length * 100);
  const pagina = etapa && PAGINAS_FISCAIS.find((p) => p.modulo === etapa.modulo);
  const totais = totaisDoContexto(cenario);
  const atividades = cenario.atividades.filter((a) => mesmoEscopo(a.contexto, cenario.contexto));

  return <div className="space-y-5">
    {/* As abas no desenho de sempre — só o texto e a barra embaixo (15/10/2026):
        tinham fundo próprio e a ativa preenchida. */}
    <AbasDeLink ativa={visao} className="" aria-label="Visões do painel" abas={[
      { chave: "resumo", rotulo: "Visão geral", href: "/fiscal", icone: <ListChecks /> },
      { chave: "historico", rotulo: "Histórico", href: "/fiscal?visao=historico", icone: <History /> },
    ]} />

    {visao === "historico" ? <BlocoFiscal titulo="Histórico da competência" descricao="Ações registradas para a empresa, o estabelecimento e o período selecionados.">
      <TabelaFiscal vazio="Nenhuma ação registrada nesta competência." colunas={["Quando", "O que aconteceu"]} linhas={atividades.map((a) => ({ id: a.id, celulas: [dataFiscal(a.criadoEm), a.mensagem] }))} />
    </BlocoFiscal> : <>
      <Card className="border-brand/30 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="mb-2 text-ui font-semibold text-brand">{etapa ? `Próxima ação · etapa ${proxima + 1} de ${etapas.length}` : "Competência concluída"}</p>
            <h2 className="text-section font-semibold text-fg">{etapa?.titulo ?? "As entregas estão registradas"}</h2>
            <p className="mt-2 text-label text-fg-secondary">{etapa?.orientacao ?? "Consulte os protocolos em SPED gerados ou selecione outra competência para continuar."}</p>
          </div>
          {etapa && pagina && modulos.includes(etapa.modulo) ? <Button href={`${pagina.caminho}?aba=${etapa.aba}`} size="lg">{etapa.acao}<ArrowRight size={16} /></Button>
            : !etapa && modulos.includes("fiscal_entregas") ? <Button href="/fiscal/entregas?aba=entregas" variant="secondary">Consultar entregas<ArrowRight size={16} /></Button>
              : etapa && <p className="text-ui text-fg-muted">A área desta etapa não está disponível para seu acesso.</p>}
        </div>
      </Card>

      <MetricasFiscais itens={[
        { rotulo: "Documentos recebidos", valor: documentosDoContexto(cenario).length, icone: <FileText />, href: modulos.includes("fiscal_acervo") ? "/fiscal/documentos?aba=acervo&grupo=todos" : undefined },
        { rotulo: "Pendências de documentos", valor: totais.pendentes + totais.rejeitados, icone: <ListChecks />, detalhe: `${totais.pendentes} para classificar · ${totais.rejeitados} em quarentena`, tom: totais.pendentes + totais.rejeitados > 0 ? "text-warning-fg" : undefined },
        { rotulo: "Etapas concluídas", valor: `${completas} de ${etapas.length}`, icone: <CheckCircle2 />, detalhe: "No recorte selecionado" },
      ]} />

      <BlocoFiscal titulo="Caminho da competência" descricao="Uma etapa por vez. O destaque acima indica onde continuar." acao={<span className="text-ui font-semibold text-brand">{progresso}%</span>}>
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Progresso da competência" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progresso}%` }} /></div>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {etapas.map((e, i) => {
            const destino = PAGINAS_FISCAIS.find((p) => p.modulo === e.modulo);
            const clicavel = i === proxima && destino && modulos.includes(e.modulo);
            const classe = `flex h-full gap-3 rounded-md border p-4 ${i === proxima ? "border-brand/40 bg-selected-bg" : "border-border"}`;
            const conteudo = <><span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-ui font-semibold ${e.completa ? "bg-success-bg text-success-fg" : i === proxima ? "bg-brand-solid text-on-brand" : "bg-surface-2 text-fg-muted"}`}>{e.completa ? <Check size={16} aria-hidden /> : i + 1}</span><div><h3 className="text-label font-semibold text-fg">{e.titulo}</h3><p className="mt-1 text-helper text-fg-secondary">{e.resumo}</p><p className={`mt-2 text-helper font-medium ${e.completa ? "text-success-fg" : i === proxima ? "text-brand" : "text-fg-muted"}`}>{e.completa ? "Concluída" : i === proxima ? clicavel ? "Etapa atual · abrir" : "Etapa atual" : "A seguir"}</p></div></>;
            return <li key={e.titulo} aria-current={i === proxima ? "step" : undefined}>{clicavel ? <Link href={`${destino.caminho}?aba=${e.aba}`} aria-label={`Abrir etapa ${i + 1}: ${e.titulo}`} className={`${classe} cursor-pointer transition-colors hover:border-brand hover:bg-brand-subtle`}>{conteudo}</Link> : <div className={classe}>{conteudo}</div>}</li>;
          })}
        </ol>
      </BlocoFiscal>
      {proxima < 0 && <p className="flex items-center gap-2 text-ui text-success-fg"><CheckCircle2 size={16} />Todas as etapas deste recorte foram concluídas.</p>}
    </>}
  </div>;
}
