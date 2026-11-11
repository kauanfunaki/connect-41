import { Building2, FolderTree } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe, permissoesNosHonorarios } from "@/lib/honorarios/acesso";
import { listarPastas, obterStatus } from "@/lib/honorarios/servidor/auditSyncService";
import { listarEmpresas } from "@/lib/honorarios/servidor/auditRepository";
import { casaBusca } from "@/lib/honorarios/rotulos";
import { formatarNumero } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { CabecalhoDosHonorarios } from "@/components/honorarios/CabecalhoDosHonorarios";
import { SemVarredura } from "@/components/honorarios/SemVarredura";
import { TabelaDePastas } from "@/components/honorarios/TabelaDePastas";
import { TabelaDeEmpresasSemPasta } from "@/components/honorarios/TabelaDeEmpresasSemPasta";

const POR_PAGINA = 50;

type Busca = { aba?: string; vinculo?: string; marca?: string; busca?: string; pagina?: string };

export default async function PastasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("controladoria_honorarios");
  const [{ podeAgir }, [lista, status, empresas]] = await Promise.all([
    permissoesNosHonorarios(ctx),
    noEscritorioDe(ctx, () => Promise.all([listarPastas(), obterStatus(), listarEmpresas()])),
  ]);
  const q = await searchParams;
  const aba = q.aba === "empresas" ? "empresas" : "pastas";
  const { resumo } = lista;

  const pastas = lista.pastas.filter((p) => {
    const v = q.vinculo ?? "sem";
    if (v === "sem" && p.vinculo) return false;
    if (v === "auto" && p.vinculo?.tipo !== "auto") return false;
    if (v === "confirmado" && p.vinculo?.tipo !== "confirmado") return false;
    if (v === "ignorada" && p.vinculo?.tipo !== "ignorado") return false;
    return casaBusca(q.busca, [p.nomePasta, p.vinculo?.empresa?.razaoSocial]);
  });
  const empresasSemPasta = lista.empresasSemPasta.filter(
    (e) => (q.marca === "marcadas" ? e.marcada : !e.marcada) && casaBusca(q.busca, [e.razaoSocial], e.cnpj),
  );
  const linhas = aba === "pastas" ? pastas : empresasSemPasta;

  const totalDePaginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number.parseInt(q.pagina ?? "1", 10) || 1), totalDePaginas);
  const inicio = (pagina - 1) * POR_PAGINA;
  const hrefDaPagina = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v && k !== "pagina") u.set(k, v);
    if (p > 1) u.set("pagina", String(p));
    const t = u.toString();
    return t ? `/honorarios/pastas?${t}` : "/honorarios/pastas";
  };

  const opcoesDeEmpresa = empresas
    .filter((e) => e.inativo === 0)
    .sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR"))
    .map((e) => ({ value: e.id, label: e.razao_social, descricao: e.cnpj, busca: e.cnpj.replace(/\D/g, "") }));

  return (
    <PageContainer>
      <CabecalhoDosHonorarios ativa="pastas" status={status} podeAgir={podeAgir} />

      {!lista.job ? (
        <SemVarredura texto="Assim que o robô terminar a primeira varredura, as pastas aparecem aqui." />
      ) : (
        <>
          <p className="mb-3 text-label text-fg-secondary">
            {formatarNumero(resumo.pastas, 0)} pastas na rede · {formatarNumero(resumo.comSubpastaContrato, 0)} com subpasta de contrato ·{" "}
            <strong className="text-fg">
              {resumo.empresasAtivasSemPasta} de {resumo.empresasAtivas} empresas ativas ainda sem pasta
            </strong>
            {resumo.empresasMarcadasSemPasta > 0 && ` · ${resumo.empresasMarcadasSemPasta} marcada(s) sem pasta, fora da auditoria`}
          </p>

          <AbasDeLink
            ativa={aba}
            aria-label="Pastas ou empresas"
            abas={[
              { chave: "pastas", rotulo: "Pastas na rede", href: "/honorarios/pastas", icone: <FolderTree size={18} />, contagem: resumo.semVinculo },
              {
                chave: "empresas",
                rotulo: "Empresas sem pasta",
                href: "/honorarios/pastas?aba=empresas",
                icone: <Building2 size={18} />,
                contagem: resumo.empresasAtivasSemPasta,
              },
            ]}
          />

          {aba === "pastas" ? (
            <CascoDaTabela
              contagem={contarItens(pastas.length, "pasta", "pastas")}
              busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar pasta ou empresa" />}
              filtros={
                <FiltrosDaTela
                  naBarra
                  campos={[
                    {
                      chave: "vinculo",
                      rotulo: "Vínculo",
                      vazioLabel: `Sem vínculo (${resumo.semVinculo})`,
                      opcoes: [
                        { value: "auto", label: `Automático (${resumo.automaticas})` },
                        { value: "confirmado", label: `Confirmado (${resumo.confirmadas})` },
                        { value: "ignorada", label: `Ignoradas (${resumo.ignoradas})` },
                        { value: "todas", label: `Todas (${resumo.pastas})` },
                      ],
                    },
                  ]}
                />
              }
            >
              <TabelaDePastas pastas={pastas.slice(inicio, inicio + POR_PAGINA)} empresas={opcoesDeEmpresa} podeAgir={podeAgir} />
            </CascoDaTabela>
          ) : (
            <CascoDaTabela
              contagem={contarItens(empresasSemPasta.length, "empresa", "empresas")}
              busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar empresa ou CNPJ" />}
              filtros={
                <FiltrosDaTela
                  naBarra
                  campos={[
                    {
                      chave: "marca",
                      rotulo: "Mostrar",
                      vazioLabel: `Sem pasta (${resumo.empresasAtivasSemPasta})`,
                      opcoes: [{ value: "marcadas", label: `Marcadas sem pasta (${resumo.empresasMarcadasSemPasta})` }],
                    },
                  ]}
                />
              }
            >
              <p className="mb-3 text-label text-fg-muted">
                Se a pasta existe com outro nome, vincule pela sugestão. Se a empresa não tem pasta na rede de propósito, marque como sem pasta: ela sai da
                auditoria de contratos e aditivos.
              </p>
              <TabelaDeEmpresasSemPasta
                empresas={empresasSemPasta.slice(inicio, inicio + POR_PAGINA)}
                marcadas={q.marca === "marcadas"}
                podeAgir={podeAgir}
              />
            </CascoDaTabela>
          )}
          <Pagination page={pagina} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={linhas.length} rotulo={aba === "pastas" ? "pastas" : "empresas"} />
        </>
      )}
    </PageContainer>
  );
}
