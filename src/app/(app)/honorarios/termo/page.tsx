import { CircleCheck, FileText, TriangleAlert } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe, permissoesNosHonorarios } from "@/lib/honorarios/acesso";
import { listarEmpresasParaTermo, modeloDoTermo, type EmpresaParaTermo } from "@/lib/honorarios/termo/servidor";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CabecalhoDosHonorarios } from "@/components/honorarios/CabecalhoDosHonorarios";
import { FaixaDoModelo } from "@/components/honorarios/FaixaDosHonorarios";
import { ModeloDoTermo } from "@/components/honorarios/ModeloDoTermo";
import { TabelaDoTermo } from "@/components/honorarios/TabelaDoTermo";
import { formatInstantDateTime, formatarNumero } from "@/lib/format";

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
    // O terceiro total filtra também (26/11/2026, melhoria-813): era o único
    // cartão que não marcava o recorte.
    if (q.situacao === "gerado" && !e.ultimoTermo) return false;
    if (!termo) return true;
    return normalizar(e.nome).includes(termo) || (digitos.length >= 3 && (e.cnpj ?? "").includes(digitos)) || normalizar(e.socio ?? "").includes(termo);
  });
}

export default async function TermoAditivoPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("controladoria_honorarios");
  const q = await searchParams;
  // A varredura das pastas saiu desta aba (26/11/2026, melhoria-813): o termo
  // não depende dela. A faixa daqui é a do modelo do termo.
  const [{ podeGerir }, [empresas, modelo]] = await Promise.all([
    permissoesNosHonorarios(ctx),
    noEscritorioDe(ctx, () => Promise.all([listarEmpresasParaTermo(ctx.tenantId!), modeloDoTermo(ctx.tenantId!)])),
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
  const dadosDoModelo = modelo && {
    nomeArquivo: modelo.nomeArquivo,
    cidade: modelo.cidade,
    enviadoPor: modelo.enviadoPor,
    atualizadoEm: formatInstantDateTime(modelo.atualizadoEm),
  };

  return (
    <PageContainer>
      <CabecalhoDosHonorarios ativa="termo">
        <FaixaDoModelo modelo={dadosDoModelo} podeGerir={podeGerir} botao={<ModeloDoTermo modelo={dadosDoModelo} />} />
      </CabecalhoDosHonorarios>

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
            detalhe: q.situacao === "gerado" ? "mostrando agora" : `de ${formatarNumero(empresas.length, 0)} empresas ativas`,
            ativo: q.situacao === "gerado",
            href: hrefCom({ situacao: "gerado" }),
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
                  { value: "gerado", label: `Com termo gerado (${comTermo})` },
                ],
              },
            ]}
          />
        }
      >
        <TabelaDoTermo empresas={daPagina} temModelo={!!modelo} semEmpresas={empresas.length === 0} />
      </CascoDaTabela>
      <Pagination page={pagina} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={filtradas.length} rotulo="empresas" />
    </PageContainer>
  );
}
