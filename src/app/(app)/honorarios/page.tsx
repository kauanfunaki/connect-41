import { CircleCheck, FileSearch, ListChecks, PenLine } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe, permissoesNosHonorarios } from "@/lib/honorarios/acesso";
import { montarRelatorioHonorarios } from "@/lib/honorarios/servidor/honorariosService";
import { obterStatus } from "@/lib/honorarios/servidor/auditSyncService";
import { filtrarHonorarios, fotoPendente, responsaveisDaLista, SITUACOES_QUE_PEDEM_ACAO } from "@/lib/honorarios/filtros";
import { ROTULO_COMPARACAO, ROTULO_SITUACAO } from "@/lib/honorarios/rotulos";
import { SITUACOES_HONORARIO } from "@/lib/honorarios/regras/honorariosRegras";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CabecalhoDosHonorarios } from "@/components/honorarios/CabecalhoDosHonorarios";
import { SemVarredura } from "@/components/honorarios/SemVarredura";
import { TabelaDeHonorarios } from "@/components/honorarios/TabelaDeHonorarios";
import { QuadroDoAcessorias } from "@/components/honorarios/QuadroDoAcessorias";
import { HistoricoDeEnvios } from "@/components/honorarios/HistoricoDeEnvios";
import { estado as estadoDoAcessorias, listarEnvios } from "@/lib/honorarios/servidor/acessoriasService";
import { formatarNumero } from "@/lib/format";

const POR_PAGINA = 50;

type Busca = { situacao?: string; foto?: string; acessorias?: string; responsavel?: string; busca?: string; pagina?: string };

export default async function HonorariosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("controladoria_honorarios");
  const [{ podeAgir, podeGerir }, [relatorio, status, acessorias, envios]] = await Promise.all([
    permissoesNosHonorarios(ctx),
    noEscritorioDe(ctx, () => Promise.all([montarRelatorioHonorarios(), obterStatus(), estadoDoAcessorias(), listarEnvios(50)])),
  ]);
  const q = await searchParams;

  // Sem filtro escolhido, a tela abre no que pede alguém olhar — é para isso
  // que ela existe. A busca olha todas, para achar a empresa que se procura.
  const padrao = q.busca?.trim() ? "" : "acao";
  const situacao = q.situacao ?? padrao;
  const filtradas = filtrarHonorarios(relatorio.empresas, { ...q, situacao: situacao === "todas" ? "" : situacao });

  const totalDePaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number.parseInt(q.pagina ?? "1", 10) || 1), totalDePaginas);
  const daPagina = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const hrefDaPagina = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v && k !== "pagina") u.set(k, v);
    if (p > 1) u.set("pagina", String(p));
    const t = u.toString();
    return t ? `/honorarios?${t}` : "/honorarios";
  };

  const { resumo } = relatorio;
  const conta = (s: (typeof SITUACOES_HONORARIO)[number]) => resumo.porSituacao[s] ?? 0;
  const pedemAcao = SITUACOES_QUE_PEDEM_ACAO.reduce((n, s) => n + conta(s), 0);
  const comFoto = relatorio.empresas.filter(fotoPendente).length;

  return (
    <PageContainer>
      <CabecalhoDosHonorarios ativa="honorarios" status={status} podeAgir={podeAgir} />

      {!relatorio.job ? (
        <SemVarredura texto="Assim que o robô terminar a primeira varredura das pastas, os documentos começam a ser lidos." />
      ) : (
        <>
          <QuadroDoAcessorias estado={acessorias} resumo={relatorio.resumo.acessorias} podeAgir={podeAgir} podeGerir={podeGerir} />
          <FaixaDeTotais
            itens={[
              {
                rotulo: "Pedem ação",
                valor: formatarNumero(pedemAcao, 0),
                icone: <ListChecks />,
                tom: pedemAcao > 0 ? "text-warning-fg" : undefined,
                detalhe: situacao === "acao" ? "mostrando agora" : "conferir, digitalizado, sem valor ou sem documento",
                ativo: situacao === "acao",
                href: "/honorarios",
              },
              {
                rotulo: "Lidos sem pendência",
                valor: formatarNumero(conta("LIDO"), 0),
                icone: <CircleCheck />,
                tom: "text-success-fg",
                detalhe: situacao === "LIDO" ? "mostrando agora" : undefined,
                ativo: situacao === "LIDO",
                href: "/honorarios?situacao=LIDO",
              },
              {
                rotulo: "Informados à mão",
                valor: formatarNumero(conta("MANUAL"), 0),
                icone: <PenLine />,
                detalhe: situacao === "MANUAL" ? "mostrando agora" : undefined,
                ativo: situacao === "MANUAL",
                href: "/honorarios?situacao=MANUAL",
              },
              {
                rotulo: "Documentos lidos pelo robô",
                valor: `${formatarNumero(resumo.textos.lidos, 0)} de ${formatarNumero(resumo.textos.documentos, 0)}`,
                icone: <FileSearch />,
                detalhe:
                  resumo.textos.pendentes > 0
                    ? `faltam ${formatarNumero(resumo.textos.pendentes, 0)}; o robô lê um lote a cada poucos segundos`
                    : resumo.textos.semTexto > 0
                      ? `${formatarNumero(resumo.textos.semTexto, 0)} sem texto (digitalizados)`
                      : undefined,
              },
            ]}
          />

          <CascoDaTabela
            contagem={contarItens(filtradas.length, "empresa", "empresas")}
            total={`${formatarNumero(resumo.comValor, 0)} de ${formatarNumero(resumo.empresas, 0)} com honorário`}
            busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar empresa ou CNPJ" />}
            filtros={
              <FiltrosDaTela
                naBarra
                campos={[
                  {
                    chave: "situacao",
                    rotulo: "Situação",
                    vazioLabel: padrao === "acao" ? "Pedem ação" : "Todas",
                    opcoes: [
                      ...(padrao === "acao" ? [{ value: "todas", label: `Todas (${resumo.empresas})` }] : [{ value: "acao", label: `Pedem ação (${pedemAcao})` }]),
                      ...SITUACOES_HONORARIO.map((s) => ({ value: s, label: `${ROTULO_SITUACAO[s]} (${conta(s)})` })),
                    ],
                  },
                  {
                    chave: "acessorias",
                    rotulo: "No Acessórias",
                    vazioLabel: "Todas",
                    opcoes: (["DIFERENTE", "IGUAL", "NAO_ENCONTRADA", "NAO_CONFERIDO"] as const).map((c) => ({ value: c, label: ROTULO_COMPARACAO[c] })),
                  },
                  {
                    chave: "responsavel",
                    rotulo: "Responsável",
                    vazioLabel: "Todos",
                    opcoes: [...responsaveisDaLista(relatorio.empresas).map((r) => ({ value: r, label: r })), { value: "__none__", label: "Sem responsável" }],
                  },
                  ...(comFoto > 0
                    ? [{ chave: "foto", rotulo: "Arquivo mais recente", vazioLabel: "Qualquer", opcoes: [{ value: "1", label: `Foto ou escaneado (${comFoto})` }] }]
                    : []),
                ]}
              />
            }
          >
            <TabelaDeHonorarios
              empresas={daPagina}
              podeAgir={podeAgir}
              filtrado={filtradas.length === 0 && relatorio.empresas.length > 0}
              envio={{
                podeEnviar: podeGerir && acessorias.configurado,
                bloqueado: acessorias.bloqueio
                  ? "Envios travados: confira o aviso no topo"
                  : acessorias.operacao?.executando
                    ? "Há uma operação com o Acessórias em andamento"
                    : null,
                loteLiberado: acessorias.envioLoteLiberado,
              }}
            />
          </CascoDaTabela>
          <Pagination page={pagina} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={filtradas.length} rotulo="empresas" />
          {acessorias.configurado && <HistoricoDeEnvios envios={envios} />}
        </>
      )}
    </PageContainer>
  );
}
