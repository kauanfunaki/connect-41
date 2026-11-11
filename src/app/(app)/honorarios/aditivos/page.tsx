import { CalendarCheck, CircleCheck, ListChecks } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe, permissoesNosHonorarios } from "@/lib/honorarios/acesso";
import { anoAtual, filtrarEmpresas, montarRelatorioAditivos, type FiltrosAditivos } from "@/lib/honorarios/servidor/auditAditivosService";
import { obterStatus } from "@/lib/honorarios/servidor/auditSyncService";
import { STATUS_ADITIVO } from "@/lib/honorarios/regras/auditAditivosStatus";
import { responsaveisDaLista } from "@/lib/honorarios/filtros";
import { ROTULO_STATUS_ADITIVO } from "@/lib/honorarios/rotulos";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CabecalhoDosHonorarios } from "@/components/honorarios/CabecalhoDosHonorarios";
import { SemVarredura } from "@/components/honorarios/SemVarredura";
import { BotaoDaPlanilha, hrefDaPlanilha } from "@/components/honorarios/BotaoDaPlanilha";
import { TabelaDeAditivos } from "@/components/honorarios/TabelaDeAditivos";
import { formatarNumero } from "@/lib/format";

const POR_PAGINA = 50;

type Busca = { ano?: string; status?: string; responsavel?: string; decimo?: string; busca?: string; pagina?: string };

export default async function AditivosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("controladoria_honorarios");
  const q = await searchParams;
  const hoje = anoAtual();
  const anoPedido = Number.parseInt(q.ano ?? "", 10);
  const ano = anoPedido >= 2000 && anoPedido <= hoje + 1 ? anoPedido : hoje;

  const [{ podeAgir }, [relatorio, status]] = await Promise.all([
    permissoesNosHonorarios(ctx),
    noEscritorioDe(ctx, () => Promise.all([montarRelatorioAditivos(ano), obterStatus()])),
  ]);

  const padrao = q.busca?.trim() ? "" : "pendente";
  const escolhido = q.status ?? padrao;
  const statusValido =
    escolhido === "pendente" || escolhido === "em_dia" || (STATUS_ADITIVO as readonly string[]).includes(escolhido)
      ? (escolhido as FiltrosAditivos["status"])
      : undefined;
  const decimo = q.decimo === "com" || q.decimo === "pendente" ? q.decimo : undefined;
  const filtros: FiltrosAditivos = { status: statusValido, responsavel: q.responsavel || undefined, busca: q.busca || undefined, decimo };
  const filtradas = filtrarEmpresas(relatorio.empresas, filtros);

  const totalDePaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number.parseInt(q.pagina ?? "1", 10) || 1), totalDePaginas);
  const daPagina = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const base = "/honorarios/aditivos";
  const hrefCom = (mudar: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...q, ...mudar })) if (v && k !== "pagina") u.set(k, v);
    const t = u.toString();
    return t ? `${base}?${t}` : base;
  };
  const hrefDaPagina = (p: number) => {
    const h = hrefCom({});
    return p > 1 ? `${h}${h.includes("?") ? "&" : "?"}pagina=${p}` : h;
  };

  const { resumo } = relatorio;
  const consideradas = resumo.empresas - resumo.distratos;
  const pendentes = consideradas - resumo.emDia;
  const pct = consideradas > 0 ? Math.round((resumo.emDia / consideradas) * 100) : 0;
  const anoNaUrl = ano !== hoje ? String(ano) : undefined;

  return (
    <PageContainer>
      <CabecalhoDosHonorarios
        ativa="aditivos"
        status={status}
        podeAgir={podeAgir}
        acao={
          relatorio.job ? (
            <BotaoDaPlanilha href={hrefDaPlanilha("aditivos", { ano, status: statusValido, responsavel: q.responsavel, busca: q.busca, decimo })} />
          ) : undefined
        }
      />

      {!relatorio.job ? (
        <SemVarredura texto="Assim que o robô terminar a primeira varredura das pastas, o relatório aparece aqui." />
      ) : (
        <>
          <FaixaDeTotais
            itens={[
              {
                rotulo: `Pendentes em ${ano}`,
                valor: formatarNumero(pendentes, 0),
                icone: <ListChecks />,
                tom: pendentes > 0 ? "text-warning-fg" : undefined,
                detalhe: escolhido === "pendente" && !decimo ? "mostrando agora" : undefined,
                ativo: escolhido === "pendente" && !decimo,
                href: hrefCom({ status: undefined, decimo: undefined, ano: anoNaUrl }),
              },
              {
                rotulo: `Em dia com o aditivo de ${ano}`,
                valor: `${formatarNumero(resumo.emDia, 0)} (${pct}%)`,
                icone: <CircleCheck />,
                tom: "text-success-fg",
                detalhe: escolhido === "em_dia" ? "mostrando agora" : `de ${formatarNumero(consideradas, 0)} empresas`,
                ativo: escolhido === "em_dia",
                href: hrefCom({ status: "em_dia", decimo: undefined }),
              },
              {
                rotulo: `Termo de 13º de ${ano}`,
                valor: `${formatarNumero(resumo.decimoTerceiro.assinados, 0)} de ${formatarNumero(resumo.decimoTerceiro.empresas, 0)}`,
                icone: <CalendarCheck />,
                detalhe: decimo === "pendente" ? "mostrando os sem assinatura" : "assinados; quem não tem 13º não fica pendente",
                ativo: decimo === "pendente",
                href: hrefCom({ status: "todas", decimo: "pendente" }),
              },
            ]}
          />

          {(resumo.distratos > 0 || resumo.marcadasSemPasta > 0) && (
            <p className="mb-3 text-label text-fg-muted">
              {resumo.distratos > 0 && `${resumo.distratos} empresa(s) com distrato da prestação de serviços ficam fora das pendências. `}
              {resumo.marcadasSemPasta > 0 && `${resumo.marcadasSemPasta} empresa(s) marcada(s) como sem pasta ficaram fora da auditoria.`}
            </p>
          )}

          <CascoDaTabela
            contagem={contarItens(filtradas.length, "empresa", "empresas")}
            busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar empresa, CNPJ ou pasta" />}
            filtros={
              <FiltrosDaTela
                naBarra
                campos={[
                  {
                    chave: "ano",
                    rotulo: "Ano",
                    vazioLabel: String(hoje),
                    opcoes: relatorio.anosDisponiveis.filter((a) => a !== hoje).map((a) => ({ value: String(a), label: String(a) })),
                  },
                  {
                    chave: "status",
                    rotulo: "Situação",
                    vazioLabel: padrao === "pendente" ? "Pendentes" : "Todas",
                    opcoes: [
                      padrao === "pendente" ? { value: "todas", label: `Todas (${resumo.empresas})` } : { value: "pendente", label: `Pendentes (${pendentes})` },
                      { value: "em_dia", label: `Em dia (${resumo.emDia})` },
                      ...STATUS_ADITIVO.map((s) => ({ value: s, label: `${ROTULO_STATUS_ADITIVO[s]} (${resumo.porStatus[s] ?? 0})` })),
                    ],
                  },
                  {
                    chave: "decimo",
                    rotulo: "Termo de 13º",
                    vazioLabel: "Qualquer",
                    opcoes: [
                      { value: "com", label: `Quem tem 13º (${resumo.decimoTerceiro.empresas})` },
                      { value: "pendente", label: `13º sem assinatura (${resumo.decimoTerceiro.empresas - resumo.decimoTerceiro.assinados})` },
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
            <TabelaDeAditivos empresas={daPagina} ano={ano} raizUnc={relatorio.raizUnc} filtrado={filtradas.length === 0 && relatorio.empresas.length > 0} />
          </CascoDaTabela>
          <Pagination page={pagina} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={filtradas.length} rotulo="empresas" />
        </>
      )}
    </PageContainer>
  );
}
