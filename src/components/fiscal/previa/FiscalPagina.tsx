"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { menuSped } from "@/lib/fiscal/menu-sped";
import { useFiscal, AvisosFiscais, FiltroDoContextoFiscal, MenuDoCenarioFiscal } from "./ContextoFiscal";
import { PainelFiscal } from "./PainelFiscal";
import { ApuracaoFiscal, ApuracaoOrganizada } from "./Apuracoes";
import { DocumentosFiscal, ClassificacaoFiscal } from "./DocumentosEClassificacao";
import { ArquivosFiscal, OperacaoFiscal } from "./OperacaoEEntregas";
import { ConfiguracoesFiscal, ConferenciaFiscal } from "./ConfiguracoesEConferencia";
import { PAGINAS_FISCAIS, type PaginaFiscal } from "@/lib/fiscal/previa/cenario";

/** Um único nível de navegação contextual, antes da identificação e dos filtros. */
export function FiscalPagina({ pagina }: { pagina: PaginaFiscal }) {
  const { cenario, modulos, pronto } = useFiscal();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const definicao = PAGINAS_FISCAIS.find((p) => p.pagina === pagina)!;
  const abas: readonly (readonly [string, string])[] = definicao.abas;
  const pedida = searchParams.get("aba");
  const aba = abas.find(([chave]) => chave === pedida)?.[0] ?? abas[0]?.[0] ?? "";
  const acessos = menuSped(PAGINAS_FISCAIS.filter((p) => modulos.includes(p.modulo)).map((p) => ({ code: p.modulo, href: p.caminho }))).telas;
  const acessoAtivo = pagina === "contribuicoes" ? "Apuração" : (acessos.find((t) => t.href === `${pathname}?aba=${aba}`) ?? acessos.find((t) => t.href === pathname))?.label;
  // O painel tem as próprias abas e não é uma das telas do menu (26/10/2026).
  const menuPrincipal = ["classificacao", "icms-ipi", "contribuicoes", "configuracoes"].includes(pagina);
  const abasInternas = pagina === "operacao" || pagina === "documentos" || pagina === "conferencia";
  const titulo = pagina === "operacao" ? (aba === "historico" ? "Histórico de execuções" : "Executar") : pagina === "entregas" ? "SPED gerados" : aba === "dcip-dime" ? "DCIP e DIME" : pagina === "configuracoes" ? (aba === "depara" ? "De-Para CFOP" : aba === "regras" ? "Regras" : "Parâmetros fiscais") : ["icms-ipi", "contribuicoes"].includes(pagina) ? "Apuração" : definicao.titulo;
  // Trocar de aba deixa para trás os filtros e a página da aba anterior. Abas
  // por link, como no motor (26/10/2026); eram botões com `pushState`.
  const key = `${pagina}-${aba}-${cenario.contexto.empresaId}-${cenario.contexto.estabelecimentoId}-${cenario.contexto.competencia}-${searchParams.get("grupo") ?? ""}-${searchParams.get("situacao") ?? ""}-${searchParams.get("arquivo") ?? ""}`;
  const visaoPedida = searchParams.get("visao");
  const visao = visaoPedida === "historico" ? visaoPedida : "resumo";
  return <>
    {menuPrincipal && acessos.length > 0 && <AbasDeLink className="mb-5" aria-label="Telas do SPED" ativa={acessoAtivo ?? ""} abas={acessos.map((t) => ({ chave: t.label, rotulo: t.label, href: t.href }))} />}
    {abasInternas && <AbasDeLink className="mb-5" aria-label={`Seções de ${definicao.titulo}`} ativa={aba} abas={abas.map(([chave, rotulo]) => ({ chave, rotulo, href: `${pathname}?aba=${chave}` }))} />}
    <PageHeader title={titulo} subtitle={definicao.descricao} action={<MenuDoCenarioFiscal />} />
    <FiltroDoContextoFiscal />
    <AvisosFiscais />
    <fieldset disabled={!pronto} aria-busy={!pronto} className="min-w-0" id="painel-fiscal" aria-label={titulo} key={key}>
        {pagina === "painel" && <PainelFiscal visao={visao} />}
        {pagina === "documentos" && <DocumentosFiscal aba={aba} />}
        {pagina === "classificacao" && <ClassificacaoFiscal aba={aba} />}
        {pagina === "operacao" && <OperacaoFiscal aba={aba} />}
        {pagina === "icms-ipi" && (aba === "dcip-dime" ? <ApuracaoFiscal aba={aba} imposto="ICMS/IPI" /> : <ApuracaoOrganizada aba={aba} imposto="ICMS/IPI" />)}
        {pagina === "contribuicoes" && <ApuracaoOrganizada aba={aba} imposto="Contribuições" />}
        {pagina === "entregas" && <ArquivosFiscal aba={aba} />}
        {pagina === "conferencia" && <ConferenciaFiscal aba={aba} />}
        {pagina === "configuracoes" && <ConfiguracoesFiscal aba={aba} />}
    </fieldset>
  </>;
}
