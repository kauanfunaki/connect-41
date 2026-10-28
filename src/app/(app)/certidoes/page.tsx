import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { EmitirCertidao, MarcarCertidaoComoVista } from "@/components/societario/BotoesDaCertidao";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { acessoAsCertidoes } from "@/lib/certidoes/acesso";
import { conexaoDaInfoSimples, quadroDasCertidoes, type CertidaoNaTela, type LinhaDoQuadro } from "@/lib/certidoes/servidor";
import { ehRegular, PRECO_POR_CONSULTA_EM_CENTAVOS, ROTULO_DA_CERTIDAO, ROTULO_DA_SITUACAO, TIPOS_DE_CERTIDAO, type SituacaoDaCertidao } from "@/lib/certidoes/regras";
import { dataBR } from "@/lib/datas/calendario";
import { moeda } from "@/lib/financeiro/formato";

export const dynamic = "force-dynamic";

const TOM: Record<SituacaoDaCertidao, TomDoSelo> = { NEGATIVA: "sucesso", POSITIVA_COM_EFEITO: "marca", POSITIVA: "perigo", NAO_SAIU: "atencao" };

const aVer = (c: CertidaoNaTela | null | undefined) => c?.situacao === "POSITIVA" && !c.vista;
const semCertidao = (c: CertidaoNaTela | null | undefined) => !c || c.situacao === "NAO_SAIU";

const RECORTES: { chave: string; rotulo: string; filtro: (l: LinhaDoQuadro) => boolean }[] = [
  { chave: "todas", rotulo: "Todas", filtro: () => true },
  { chave: "positivas", rotulo: "Positivas a ver", filtro: (l) => Object.values(l.certidoes).some(aVer) },
  { chave: "faltando", rotulo: "Sem certidão", filtro: (l) => Object.values(l.certidoes).some(semCertidao) },
];

/**
 * As certidões da carteira (Certidões pelo Connect, 28/10/2026): empresa por
 * empresa, a certidão que vale de cada tipo que ela precisa — federal, FGTS,
 * trabalhista, estadual do PR e municipal de Curitiba —, consultadas a cada
 * trimestre pela InfoSimples, e "Emitir agora" para o pedido fora da rotina.
 */
export default async function CertidoesPage({ searchParams }: { searchParams: Promise<{ recorte?: string }> }) {
  const ctx = await getAuthContext();
  const acesso = await acessoAsCertidoes(ctx);
  if (!acesso) notFound();

  const { recorte } = await searchParams;
  const atual = RECORTES.find((r) => r.chave === recorte) ?? RECORTES[0];
  const [{ linhas, consultasNoMes }, conexao] = await Promise.all([
    quadroDasCertidoes(acesso.tenantId, await scopedCompanyWhere(ctx)),
    conexaoDaInfoSimples(acesso.tenantId),
  ]);
  const celulas = linhas.flatMap((l) => Object.values(l.certidoes));
  const positivasAVer = celulas.filter(aVer).length;
  const regulares = celulas.filter((c) => c && ehRegular(c.situacao)).length;
  const faltando = celulas.filter(semCertidao).length;
  const filtradas = linhas.filter(atual.filtro);

  return (
    <PageContainer>
      <PageHeader
        title="Certidões"
        subtitle="A certidão que vale de cada empresa — federal, FGTS, trabalhista, estadual e municipal —, consultada a cada trimestre."
      />

      {!conexao.pronta && <Aviso tom="atencao" className="mb-4">{conexao.motivo} Sem ela, a rotina não roda e &quot;Emitir agora&quot; não sai.</Aviso>}

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Regulares", valor: String(regulares), detalhe: `de ${celulas.length} certidões de ${linhas.length} empresas`, icone: <CheckCircle2 /> },
          { rotulo: "Positivas a ver", valor: String(positivasAVer), tom: positivasAVer > 0 ? "text-danger" : undefined, icone: <AlertTriangle /> },
          { rotulo: "Sem certidão", valor: String(faltando), detalhe: "ainda não consultadas ou não saíram", icone: <FileText /> },
          {
            rotulo: "Consultas no mês",
            valor: String(consultasNoMes),
            detalhe: `até ${moeda(consultasNoMes * PRECO_POR_CONSULTA_EM_CENTAVOS)}, mínimo de R$ 100,00`,
            icone: <Receipt />,
          },
        ]}
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Recortes">
        {RECORTES.map((r) => (
          <Link
            key={r.chave}
            href={r.chave === "todas" ? "/certidoes" : `/certidoes?recorte=${r.chave}`}
            aria-current={r.chave === atual.chave ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-ui transition-colors ${r.chave === atual.chave ? "border-brand bg-brand/10 text-brand" : "border-border text-fg-secondary hover:text-fg"}`}
          >
            {r.rotulo}
          </Link>
        ))}
      </nav>

      {filtradas.length === 0 ? (
        <EmptyState
          title={linhas.length === 0 ? "Nenhuma empresa ativa com CNPJ" : "Nada neste recorte"}
          description={linhas.length === 0 ? "As certidões são da carteira ativa com CNPJ válido no cadastro." : "Escolha outro recorte acima."}
          icon={<FileText />}
        />
      ) : (
        <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Empresa</th>
                {TIPOS_DE_CERTIDAO.map((t) => (
                  <th key={t} className="py-2 pr-3 font-medium">
                    {ROTULO_DA_CERTIDAO[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.companyId} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/empresas/${l.companyId}`} className="hover:text-brand">
                      {l.empresa}
                    </Link>
                  </td>
                  {TIPOS_DE_CERTIDAO.map((t) => (
                    <td key={t} className="py-2 pr-3">
                      {t in l.certidoes ? (
                        <Celula certidao={l.certidoes[t] ?? null} companyId={l.companyId} tipo={t} podeEditar={acesso.podeEditar && conexao.pronta} />
                      ) : (
                        <span className="text-micro text-fg-muted">não se aplica</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

function Celula({ certidao, companyId, tipo, podeEditar }: { certidao: CertidaoNaTela | null; companyId: string; tipo: (typeof TIPOS_DE_CERTIDAO)[number]; podeEditar: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {certidao ? (
        <>
          <Selo tom={TOM[certidao.situacao]}>{ROTULO_DA_SITUACAO[certidao.situacao]}</Selo>
          {certidao.situacao === "NAO_SAIU" ? (
            certidao.mensagem && <span className="text-micro text-fg-muted max-w-[14rem] break-words">{certidao.mensagem}</span>
          ) : (
            <span className="text-micro text-fg-muted tabular-nums">
              {certidao.validaAte ? `até ${dataBR(certidao.validaAte)}` : certidao.emitidaEm ? `emitida em ${dataBR(certidao.emitidaEm)}` : ""}
            </span>
          )}
          {certidao.arquivoId && (
            <a href={`/api/arquivos/${certidao.arquivoId}?ver=1`} target="_blank" rel="noreferrer" className="text-micro text-brand underline">
              Abrir
            </a>
          )}
          {podeEditar && aVer(certidao) && <MarcarCertidaoComoVista certidaoId={certidao.id} />}
        </>
      ) : (
        <span className="text-micro text-fg-muted">Ainda não consultada</span>
      )}
      {podeEditar && <EmitirCertidao companyId={companyId} tipo={tipo} />}
    </div>
  );
}
