import Link from "next/link";
import { CircleCheck, FileText, TriangleAlert } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe, permissoesNosHonorarios } from "@/lib/honorarios/acesso";
import { obterStatus } from "@/lib/honorarios/servidor/auditSyncService";
import { listarEmpresasParaTermo, modeloDoTermo, type EmpresaParaTermo } from "@/lib/honorarios/termo/servidor";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { CabecalhoDosHonorarios } from "@/components/honorarios/CabecalhoDosHonorarios";
import { ModeloDoTermo } from "@/components/honorarios/ModeloDoTermo";
import { formatCnpj, formatInstantDate, formatInstantDateTime, formatarNumero } from "@/lib/format";

const POR_PAGINA = 50;

type Busca = { situacao?: string; busca?: string; pagina?: string };

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function filtrar(empresas: EmpresaParaTermo[], q: Busca): EmpresaParaTermo[] {
  const termo = normalizar(q.busca?.trim() ?? "");
  const digitos = termo.replace(/\D/g, "");
  return empresas.filter((e) => {
    if (q.situacao === "pronto" && !e.podeGerar) return false;
    if (q.situacao === "falta" && e.podeGerar) return false;
    if (!termo) return true;
    return normalizar(e.nome).includes(termo) || (digitos.length >= 3 && (e.cnpj ?? "").includes(digitos)) || normalizar(e.socio ?? "").includes(termo);
  });
}

export default async function TermoAditivoPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("controladoria_honorarios");
  const q = await searchParams;
  const [{ podeAgir, podeGerir }, [empresas, modelo, status]] = await Promise.all([
    permissoesNosHonorarios(ctx),
    noEscritorioDe(ctx, () => Promise.all([listarEmpresasParaTermo(ctx.tenantId!), modeloDoTermo(ctx.tenantId!), obterStatus()])),
  ]);

  const filtradas = filtrar(empresas, q);
  const totalDePaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number.parseInt(q.pagina ?? "1", 10) || 1), totalDePaginas);
  const daPagina = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const hrefCom = (mudar: Partial<Busca>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...q, ...mudar })) if (v && k !== "pagina") u.set(k, v);
    const t = u.toString();
    return t ? `/honorarios/termo?${t}` : "/honorarios/termo";
  };
  const hrefDaPagina = (p: number) => {
    const h = hrefCom({});
    return p > 1 ? `${h}${h.includes("?") ? "&" : "?"}pagina=${p}` : h;
  };
  const prontas = empresas.filter((e) => e.podeGerar).length;
  const comTermo = empresas.filter((e) => e.ultimoTermo).length;

  return (
    <PageContainer>
      <CabecalhoDosHonorarios
        ativa="termo"
        status={status}
        podeAgir={podeAgir}
        acao={
          podeGerir ? (
            <ModeloDoTermo
              modelo={modelo && { nomeArquivo: modelo.nomeArquivo, cidade: modelo.cidade, enviadoPor: modelo.enviadoPor, atualizadoEm: formatInstantDateTime(modelo.atualizadoEm) }}
            />
          ) : undefined
        }
      />

      {!modelo && (
        <Aviso tom="atencao" className="mb-4">
          O escritório ainda não enviou o modelo do termo em Word.{" "}
          {podeGerir ? "Envie em “Modelo do termo”, no alto da tela." : "Quem gerencia Contratos e honorários envia em “Modelo do termo”."} Enquanto isso, dá para completar
          os dados das empresas.
        </Aviso>
      )}

      <FaixaDeTotais
        itens={[
          {
            rotulo: "Prontas para gerar",
            valor: formatarNumero(prontas, 0),
            icone: <CircleCheck />,
            tom: "text-success-fg",
            detalhe: q.situacao === "pronto" ? "mostrando agora" : "sócio administrador com CPF",
            ativo: q.situacao === "pronto",
            href: hrefCom({ situacao: "pronto" }),
          },
          {
            rotulo: "Falta o sócio ou o CPF",
            valor: formatarNumero(empresas.length - prontas, 0),
            icone: <TriangleAlert />,
            tom: empresas.length - prontas > 0 ? "text-warning-fg" : undefined,
            detalhe: q.situacao === "falta" ? "mostrando agora" : "complete na tela da empresa",
            ativo: q.situacao === "falta",
            href: hrefCom({ situacao: "falta" }),
          },
          {
            rotulo: "Com termo gerado no Connect",
            valor: formatarNumero(comTermo, 0),
            icone: <FileText />,
            detalhe: `de ${formatarNumero(empresas.length, 0)} empresas ativas`,
            href: hrefCom({ situacao: undefined }),
          },
        ]}
      />

      <CascoDaTabela
        contagem={contarItens(filtradas.length, "empresa", "empresas")}
        busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar empresa, CNPJ ou sócio" />}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: "Todas",
                opcoes: [
                  { value: "pronto", label: `Prontas para gerar (${prontas})` },
                  { value: "falta", label: `Falta o sócio ou o CPF (${empresas.length - prontas})` },
                ],
              },
            ]}
          />
        }
      >
        {daPagina.length === 0 ? (
          <EmptyState
            title={empresas.length === 0 ? "Nenhuma empresa ativa com CNPJ" : "Nenhuma empresa com estes filtros"}
            description={empresas.length === 0 ? "O termo é gerado para as empresas ativas do cadastro." : "Tire um filtro ou mude a busca."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-ui">
              <thead>
                <tr className="border-b border-border text-left text-label text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Empresa</th>
                  <th className="py-2 pr-3 font-medium">Sócio que assina</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 pr-3 font-medium">Último termo</th>
                  <th className="py-2 text-right font-medium">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {daPagina.map((e) => (
                  <tr key={e.companyId} className="border-b border-border-soft">
                    <td className="py-2.5 pr-3">
                      <Link href={`/honorarios/termo/${e.companyId}`} className="font-semibold text-fg hover:text-brand transition-colors">
                        {e.nome}
                      </Link>
                      <span className="block text-micro text-fg-muted tabular-nums">{formatCnpj(e.cnpj)}</span>
                    </td>
                    <td className="py-2.5 pr-3">{e.socio ?? <span className="text-fg-muted">—</span>}</td>
                    <td className="py-2.5 pr-3">
                      {e.podeGerar ? (
                        <Selo tom="sucesso">Pronta</Selo>
                      ) : (
                        <Selo tom="atencao">{e.socio ? "Falta o CPF" : "Falta o sócio"}</Selo>
                      )}
                      {e.recomendacoes > 0 && (
                        <span className="mt-0.5 block text-micro text-fg-muted">
                          {e.recomendacoes === 1 ? "1 trecho opcional sem dados" : `${e.recomendacoes} trechos opcionais sem dados`}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{e.ultimoTermo ? formatInstantDate(e.ultimoTermo) : <span className="text-fg-muted">—</span>}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/honorarios/termo/${e.companyId}`} className="text-label text-brand hover:underline">
                        {e.podeGerar && modelo ? "Gerar termo" : "Completar dados"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CascoDaTabela>
      <Pagination page={pagina} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={filtradas.length} rotulo="empresas" />
    </PageContainer>
  );
}
