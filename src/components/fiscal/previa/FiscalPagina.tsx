"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";
import { useFiscal } from "./ContextoFiscal";
import { PainelFiscal } from "./PainelFiscal";
import { ApuracaoFiscal } from "./Apuracoes";
import { DocumentosFiscal, ClassificacaoFiscal } from "./DocumentosEClassificacao";
import { ArquivosFiscal, OperacaoFiscal } from "./OperacaoEEntregas";
import { ConfiguracoesFiscal, ConferenciaFiscal } from "./ConfiguracoesEConferencia";
import { PAGINAS_FISCAIS, type PaginaFiscal } from "@/lib/fiscal/previa/cenario";

export function FiscalPagina({ pagina }: { pagina: PaginaFiscal }) {
  const { cenario, modulos } = useFiscal();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const definicao = PAGINAS_FISCAIS.find((p) => p.pagina === pagina)!;
  const abas: readonly (readonly [string, string])[] = definicao.abas;
  const pedida = searchParams.get("aba");
  const aba = abas.find(([chave]) => chave === pedida)?.[0] ?? abas[0]?.[0] ?? "";
  const trocarAba = (nova: string) => { const query = new URLSearchParams(searchParams.toString()); query.set("aba", nova); window.history.pushState(null, "", `${pathname}?${query.toString()}`); };
  const key = `${pagina}-${aba}-${cenario.contexto.empresaId}-${cenario.contexto.estabelecimentoId}-${cenario.contexto.competencia}`;
  const visaoPedida = searchParams.get("visao");
  const visao = visaoPedida === "historico" ? visaoPedida : "resumo";
  return <><PageHeader title={definicao.titulo} subtitle={definicao.descricao} />
    {pagina !== "painel" && modulos.includes("fiscal_painel") && <Button href="/fiscal" variant="link" className="mb-5 text-ui"><ArrowLeft size={14} />Voltar ao caminho da competência</Button>}
    {abas.length > 0 && <Tabs className="mb-5" active={aba} tabs={abas.map(([key, label]) => ({ key, label, panelId: "painel-fiscal" }))} onChange={trocarAba} />}<div id="painel-fiscal" role={abas.length ? "tabpanel" : undefined} aria-label={abas.find(([chave]) => chave === aba)?.[1]} key={key}>
    {pagina === "painel" && <PainelFiscal visao={visao} />}
    {pagina === "documentos" && <DocumentosFiscal aba={aba} />}
    {pagina === "classificacao" && <ClassificacaoFiscal aba={aba} />}
    {pagina === "operacao" && <OperacaoFiscal aba={aba} />}
    {pagina === "icms-ipi" && <ApuracaoFiscal aba={aba} imposto="ICMS/IPI" />}
    {pagina === "contribuicoes" && <ApuracaoFiscal aba={aba} imposto="Contribuições" />}
    {pagina === "entregas" && <ArquivosFiscal aba={aba} />}
    {pagina === "conferencia" && <ConferenciaFiscal aba={aba} />}
    {pagina === "configuracoes" && <ConfiguracoesFiscal aba={aba} />}
  </div></>;
}
