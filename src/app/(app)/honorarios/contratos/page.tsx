import { CircleCheck, ListChecks, SearchCheck } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe, permissoesNosHonorarios } from "@/lib/honorarios/acesso";
import { filtrarEmpresasContratos, montarRelatorioContratos, type FiltrosContratos } from "@/lib/honorarios/servidor/auditContratosService";
import { obterStatus } from "@/lib/honorarios/servidor/auditSyncService";
import { STATUS_CONTRATO } from "@/lib/honorarios/regras/auditContratosStatus";
import { responsaveisDaLista } from "@/lib/honorarios/filtros";
import { ROTULO_STATUS_CONTRATO } from "@/lib/honorarios/rotulos";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CabecalhoDosHonorarios } from "@/components/honorarios/CabecalhoDosHonorarios";
import { SemVarredura } from "@/components/honorarios/SemVarredura";
import { BotaoDaPlanilha, hrefDaPlanilha } from "@/components/honorarios/BotaoDaPlanilha";
import { TabelaDeContratos } from "@/components/honorarios/TabelaDeContratos";
import { formatarNumero } from "@/lib/format";

const POR_PAGINA = 50;
const ESPECIAIS = ["pendente", "em_dia", "assinado_digital", "assinado_pelo_nome"] as const;

type Busca = { status?: string; responsavel?: string; busca?: string; pagina?: string };

export default async function ContratosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("controladoria_honorarios");
  const [{ podeAgir }, [relatorio, status]] = await Promise.all([
    permissoesNosHonorarios(ctx),
    noEscritorioDe(ctx, () => Promise.all([montarRelatorioContratos(), obterStatus()])),
  ]);
  const q = await searchParams;

  // Abre nas pendências; a busca olha todas.
  const padrao = q.busca?.trim() ? "" : "pendente";
  const escolhido = q.status ?? padrao;
  const statusValido =
    (ESPECIAIS as readonly string[]).includes(escolhido) || (STATUS_CONTRATO as readonly string[]).includes(escolhido)
      ? (escolhido as FiltrosContratos["status"])
      : undefined;
  const filtros: FiltrosContratos = { status: statusValido, responsavel: q.responsavel || undefined, busca: q.busca || undefined };
  const filtradas = filtrarEmpresasContratos(relatorio.empresas, filtros);

  const totalDePaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number.parseInt(q.pagina ?? "1", 10) || 1), totalDePaginas);
  const daPagina = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const hrefDaPagina = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v && k !== "pagina") u.set(k, v);
    if (p > 1) u.set("pagina", String(p));
    const t = u.toString();
    return t ? `/honorarios/contratos?${t}` : "/honorarios/contratos";
  };

  const { resumo } = relatorio;
  const consideradas = resumo.empresas - resumo.distratos;
  const pendentes = consideradas - resumo.emDia;
  const pct = consideradas > 0 ? Math.round((resumo.emDia / consideradas) * 100) : 0;
  const contaMotivo = (m: string) => relatorio.empresas.filter((e) => e.motivo === m).length;

  return (
    <PageContainer>
      <CabecalhoDosHonorarios
        ativa="contratos"
        status={status}
        podeAgir={podeAgir}
        acao={relatorio.job ? <BotaoDaPlanilha href={hrefDaPlanilha("contratos", { status: statusValido, responsavel: q.responsavel, busca: q.busca })} /> : undefined}
      />

      {!relatorio.job ? (
        <SemVarredura texto="O relatório aparece depois da primeira varredura do robô." />
      ) : (
        <>
          <FaixaDeTotais
            itens={[
              {
                rotulo: "Pendentes",
                valor: formatarNumero(pendentes, 0),
                icone: <ListChecks />,
                tom: pendentes > 0 ? "text-warning-fg" : undefined,
                detalhe: escolhido === "pendente" ? "mostrando agora" : undefined,
                ativo: escolhido === "pendente",
                href: "/honorarios/contratos",
              },
              {
                rotulo: "Com contrato assinado",
                valor: `${formatarNumero(resumo.emDia, 0)} (${pct}%)`,
                icone: <CircleCheck />,
                tom: "text-success-fg",
                detalhe: escolhido === "em_dia" ? "mostrando agora" : `de ${formatarNumero(consideradas, 0)} empresas`,
                ativo: escolhido === "em_dia",
                href: "/honorarios/contratos?status=em_dia",
              },
              {
                rotulo: "Para revisar",
                valor: formatarNumero(resumo.revisar, 0),
                icone: <SearchCheck />,
                tom: resumo.revisar > 0 ? "text-warning-fg" : undefined,
                detalhe:
                  escolhido === "REVISAR"
                    ? "mostrando agora"
                    : resumo.marcadasSemPasta > 0
                      ? `${resumo.marcadasSemPasta} marcada(s) sem pasta ficam fora`
                      : "precisam de conferência manual",
                ativo: escolhido === "REVISAR",
                href: "/honorarios/contratos?status=REVISAR",
              },
            ]}
          />

          <CascoDaTabela
            contagem={contarItens(filtradas.length, "empresa", "empresas")}
            busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar empresa, CNPJ ou pasta" />}
            filtros={
              <FiltrosDaTela
                naBarra
                campos={[
                  {
                    chave: "status",
                    rotulo: "Situação",
                    vazioLabel: padrao === "pendente" ? "Pendentes" : "Todas",
                    opcoes: [
                      padrao === "pendente"
                        ? { value: "todas", label: `Todas (${resumo.empresas})` }
                        : { value: "pendente", label: `Pendentes (${pendentes})` },
                      { value: "em_dia", label: `Em dia (${resumo.emDia})` },
                      { value: "assinado_digital", label: `Assinatura digital (${contaMotivo("CONTRATO_DIGITAL_ASSINADO")})` },
                      { value: "assinado_pelo_nome", label: `Assinado pelo nome (${contaMotivo("CONTRATO_ASSINADO_PELO_NOME")})` },
                      ...STATUS_CONTRATO.map((s) => ({ value: s, label: `${ROTULO_STATUS_CONTRATO[s]} (${resumo.porStatus[s] ?? 0})` })),
                    ],
                  },
                  {
                    chave: "responsavel",
                    rotulo: "Responsável",
                    vazioLabel: "Todos",
                    opcoes: [...responsaveisDaLista(relatorio.empresas).map((r) => ({ value: r, label: r })), { value: "__none__", label: "Sem responsável" }],
                  },
                ]}
              />
            }
          >
            <TabelaDeContratos empresas={daPagina} raizUnc={relatorio.raizUnc} filtrado={filtradas.length === 0 && relatorio.empresas.length > 0} />
          </CascoDaTabela>
          <Pagination page={pagina} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={filtradas.length} rotulo="empresas" />
        </>
      )}
    </PageContainer>
  );
}
