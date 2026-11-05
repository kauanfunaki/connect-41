import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { ListaDasCertidoes } from "@/components/societario/ListaDasCertidoes";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { acessoAsCertidoes } from "@/lib/certidoes/acesso";
import { conexaoDaInfoSimples } from "@/lib/certidoes/servidor";
import { listaDasCertidoes } from "@/lib/certidoes/lista";
import { DIAS_PARA_VENCER, lerRecorte, RECORTES, ROTULO_DO_RECORTE, type Recorte } from "@/lib/certidoes/lista-regras";
import { FRANQUIA_EM_CENTAVOS } from "@/lib/certidoes/regras";
import { hojeIso } from "@/lib/datas/calendario";
import { moeda } from "@/lib/financeiro/formato";
import { formatarNumero } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A dica de cada atalho: o que entra nele. */
const DICA_DO_RECORTE: Record<Recorte, string> = {
  todas: "Todas as empresas ativas com CNPJ",
  positivas: "Empresas com certidão positiva que ninguém do setor marcou como vista",
  faltando: "Empresas com alguma certidão ainda não consultada ou que não saiu",
  vencendo: `Empresas com certidão vencida ou que vence nos próximos ${DIAS_PARA_VENCER} dias`,
};

/**
 * As certidões da carteira (Certidões pelo Connect, 28/10/2026), na opção A
 * escolhida pelo Kauan em 05/11/2026: busca por nome ou CNPJ, atalhos com
 * contagem, uma linha por empresa com as certidões em selos e um só
 * "Emitir ▾", e o painel ao lado com cada certidão. A página lê só as
 * empresas dela (50) por inteiro; a busca e os atalhos andam no servidor
 * (`listaDasCertidoes`).
 */
export default async function CertidoesPage({ searchParams }: { searchParams: Promise<{ recorte?: string; pagina?: string; busca?: string }> }) {
  const ctx = await getAuthContext();
  const acesso = await acessoAsCertidoes(ctx);
  if (!acesso) notFound();

  const { recorte: recorteDaUrl, pagina: paginaDaUrl, busca: buscaDaUrl } = await searchParams;
  const recorte = lerRecorte(recorteDaUrl);
  const busca = (buscaDaUrl ?? "").slice(0, 100).trim();
  const pedida = Math.max(1, Math.min(1000, Number.parseInt(paginaDaUrl ?? "1", 10) || 1));
  const agora = new Date();
  const [lista, conexao] = await Promise.all([
    listaDasCertidoes(acesso.tenantId, await scopedCompanyWhere(ctx), { busca, recorte, pagina: pedida, agora }),
    conexaoDaInfoSimples(acesso.tenantId),
  ]);
  const { totais } = lista;

  const href = (p: { recorte?: Recorte; pagina?: number }) => {
    const q = new URLSearchParams();
    if (busca) q.set("busca", busca);
    const r = p.recorte ?? recorte;
    if (r !== "todas") q.set("recorte", r);
    if (p.pagina && p.pagina > 1) q.set("pagina", String(p.pagina));
    const t = q.toString();
    return t ? `/certidoes?${t}` : "/certidoes";
  };

  return (
    <PageContainer>
      <PageHeader title="Certidões" subtitle="Federal, FGTS, trabalhista, estadual e municipal de cada empresa, renovadas sozinhas a cada trimestre." />

      {!conexao.pronta && <Aviso tom="atencao" className="mb-4">{conexao.motivo} Sem ela, a rotina não roda e não dá para emitir pela tela.</Aviso>}

      <FaixaDeTotais
        className="mb-6"
        itens={[
          {
            rotulo: "Regulares",
            valor: formatarNumero(totais.regulares, 0),
            detalhe: `de ${formatarNumero(totais.certidoes, 0)} certidões de ${formatarNumero(totais.empresas, 0)} empresas`,
            icone: <CheckCircle2 />,
          },
          {
            rotulo: "Positivas a ver",
            valor: formatarNumero(totais.positivasAVer, 0),
            detalhe: totais.empresasComPositiva > 0 ? `em ${formatarNumero(totais.empresasComPositiva, 0)} ${totais.empresasComPositiva === 1 ? "empresa" : "empresas"}` : "nenhuma esperando o setor",
            tom: totais.positivasAVer > 0 ? "text-danger" : undefined,
            icone: <AlertTriangle />,
          },
          { rotulo: "Sem certidão", valor: formatarNumero(totais.semCertidao, 0), detalhe: "ainda não consultadas ou não saíram", icone: <FileText /> },
          // O gasto do mês contra o teto (04/11/2026): o preço real de cada certidão,
          // sem as que o órgão não respondeu, que a InfoSimples não cobra.
          {
            rotulo: "Gasto no mês",
            valor: moeda(lista.gastoNoMesCentavos),
            detalhe: [
              `${lista.consultasNoMes} ${lista.consultasNoMes === 1 ? "consulta" : "consultas"}`,
              conexao.pronta ? `teto de ${moeda(conexao.tetoCentavos)}` : null,
              `mínimo de ${moeda(FRANQUIA_EM_CENTAVOS)} no mês`,
            ]
              .filter(Boolean)
              .join(" · "),
            tom: conexao.pronta && lista.gastoNoMesCentavos >= conexao.tetoCentavos ? "text-warning-fg" : undefined,
            icone: <Receipt />,
          },
        ]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <DebouncedSearchInput paramName="busca" placeholder="Buscar empresa por nome ou CNPJ" aria-label="Buscar empresa por nome ou CNPJ" className="w-full lg:w-96" />
        <nav className="flex flex-wrap gap-2" aria-label="Atalhos das certidões">
          {RECORTES.map((r) => {
            const atual = r === recorte;
            return (
              <Link
                key={r}
                href={href({ recorte: r })}
                aria-current={atual ? "page" : undefined}
                data-dica={DICA_DO_RECORTE[r]}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-ui transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  atual ? "border-brand bg-brand/10 text-brand font-medium" : "border-border text-fg-secondary hover:text-fg hover:bg-surface-hover"
                }`}
              >
                {ROTULO_DO_RECORTE[r]}
                <span className={`tabular-nums text-micro ${atual ? "text-brand" : "text-fg-muted"}`}>{formatarNumero(lista.contagens[r], 0)}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {lista.total === 0 ? (
        <EmptyState
          title={totais.empresas === 0 ? "Nenhuma empresa ativa com CNPJ" : busca ? `Nenhuma empresa com “${busca}”` : "Nenhuma empresa neste atalho"}
          description={
            totais.empresas === 0
              ? "As certidões são da carteira ativa com CNPJ válido no cadastro."
              : busca
                ? lista.contagens.todas > 0
                  ? `A busca acha ${formatarNumero(lista.contagens.todas, 0)} em Todas, mas nenhuma em ${ROTULO_DO_RECORTE[recorte]}.`
                  : "Confira o nome ou o CNPJ, ou limpe a busca."
                : "Escolha outro atalho acima."
          }
          icon={<FileText />}
        />
      ) : (
        <ListaDasCertidoes
          linhas={lista.linhas}
          podeEmitir={acesso.podeEditar && conexao.pronta}
          podeEditar={acesso.podeEditar}
          hoje={hojeIso(agora)}
        />
      )}
      <Pagination page={lista.pagina} totalPages={lista.totalDePaginas} buildHref={(p) => href({ pagina: p })} total={lista.total} rotulo="empresas" />

      <NotaDeFonte>
        Federal, FGTS e trabalhista valem para a raiz do CNPJ e saem pela matriz; a estadual do PR, uma por raiz entre os estabelecimentos do
        estado; a municipal, por estabelecimento em Curitiba. A rotina consulta um terço da carteira em cada mês do trimestre, para o custo
        ficar no mínimo da InfoSimples, e tenta de novo, até três vezes, a que não saiu. A certidão regular vai para Arquivos › Certidões, que o
        cliente vê no portal; a positiva fica em Arquivos › Societário até o setor decidir, e avisa o Societário e o setor da certidão. A
        certidão simplificada da Junta não entra: é paga a cada pedido.
      </NotaDeFonte>
    </PageContainer>
  );
}
