import { GitBranch, Users } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { GITHUB_MODULE, TYPE_LABELS } from "@/lib/github/types";
import { contribuicoesPorPessoa } from "@/lib/github/queries";
import { dayAt } from "@/lib/github/rules";
import { PageContainer } from "@/components/shared/PageContainer";
import { CartoesNoCelular, Cartao, InfoDoCartao, TabelaNoDesktop, TopoDoCartao } from "@/components/shared/ListaResponsiva";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CabecalhoDaProdutividade } from "@/components/produtividade/CabecalhoDaProdutividade";
import { entregasDoPeriodo, PERIODOS_DAS_ENTREGAS, type PessoaNasEntregas } from "@/lib/tech-interno/entregas";
import { lerPeriodo } from "@/lib/tech-interno/produtividade";
import { formatarNumero, formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Github = Awaited<ReturnType<typeof contribuicoesPorPessoa>>;

const ciclo = (p: PessoaNasEntregas) => (p.cicloMedianoDias === null ? "—" : `${formatarNumero(p.cicloMedianoDias, 1)} dias`);
const chamados = (p: PessoaNasEntregas) => (p.chamados === 0 ? "—" : `${p.chamadosNoPrazo} de ${p.chamados}`);

/** "128" e, na dica, o que são — commits, PRs, revisões. Sem conta vinculada, diz isso. */
function NoGithub({ pessoa, github }: { pessoa: PessoaNasEntregas; github: Github }) {
  if (github === null) return <span className="text-fg-muted">—</span>;
  const c = pessoa.userId ? github.get(pessoa.userId) : undefined;
  if (!c) return <span className="text-fg-muted">sem conta vinculada</span>;
  const partes = (["COMMIT", "PULL_REQUEST", "REVIEW"] as const).map((t) => `${TYPE_LABELS[t]}: ${formatarNumero(c[t], 0)}`).join(" · ");
  return (
    <span className="text-fg-secondary" title={partes}>
      {formatarNumero(c.total, 0)} <span className="text-fg-muted">contribuições</span>
      <span className="sr-only"> ({partes})</span>
    </span>
  );
}

/**
 * Produtividade da Tech, aba Pessoas (05/11/2026): a tabela que era das
 * Entregas, por pessoa, com o GitHub numa coluna só, como contexto — commits
 * e PRs dizem atividade, não entrega, e por isso não entram em nenhuma conta.
 */
export default async function ProdutividadePessoasPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { ctx } = await abrirTelaDoModulo(GITHUB_MODULE);
  const periodo = lerPeriodo((await searchParams).periodo);
  const { inicio, fim, pessoas } = await entregasDoPeriodo(ctx.tenantId!, periodo);
  const github = await contribuicoesPorPessoa(ctx.tenantId!, dayAt(inicio), dayAt(fim)).catch(() => null);

  return (
    <PageContainer>
      <CabecalhoDaProdutividade
        aba="pessoas"
        periodo={periodo === "trimestre" ? undefined : periodo}
        subtitulo={`Cada pessoa de ${formatInstantDate(inicio)} a ${formatInstantDate(fim)}: o que entregou, em quanto tempo e quanto voltou.`}
      />
      <div className="mb-5">
        <SegmentedControl
          label="Período"
          active={periodo}
          items={PERIODOS_DAS_ENTREGAS.map((p) => ({ key: p.chave, label: p.rotulo, href: p.chave === "trimestre" ? "?" : `?periodo=${p.chave}` }))}
        />
      </div>

      {pessoas.length === 0 ? (
        <Card>
          <EmptyState icon={<Users />} title="Ninguém entregou no período" description="Itens concluídos no Controle interno e chamados resolvidos aparecem aqui." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {pessoas.map((p) => (
              <Cartao key={p.userId ?? "sem"}>
                <TopoDoCartao nome={p.nome} valor={`${p.pontos} pts`} />
                <InfoDoCartao>
                  {p.validadas} de {p.entregas} itens validados{p.semTamanho > 0 && ` · ${p.semTamanho} sem tamanho`} · ciclo {ciclo(p)}
                </InfoDoCartao>
                <InfoDoCartao>
                  {p.voltasDaValidacao} voltas · {p.retrabalho} de retrabalho · chamados no prazo {chamados(p)}
                </InfoDoCartao>
                <InfoDoCartao className="inline-flex items-center gap-1">
                  <GitBranch size={12} aria-hidden /> GitHub: <NoGithub pessoa={p} github={github} />
                </InfoDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[880px]">
              <caption className="sr-only">Produtividade por pessoa, de {formatInstantDate(inicio)} a {formatInstantDate(fim)}</caption>
              <thead>
                <tr>
                  {["Pessoa", "Pontos", "Itens", "Ciclo (mediana)", "Voltas da validação", "Retrabalho", "Chamados no prazo"].map((c) => (
                    <th key={c} scope="col" className="px-3 py-2">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 border-l border-border">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch size={12} aria-hidden /> GitHub (contexto)
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => (
                  <tr key={p.userId ?? "sem"} className="border-b border-border-soft tabular-nums">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {p.nome}
                    </th>
                    <td className="px-3 py-2 font-semibold">{p.pontos}</td>
                    <td className="px-3 py-2">
                      {p.validadas} de {p.entregas} validados
                      {p.semTamanho > 0 && <span className="block text-micro text-warning-fg">{p.semTamanho} sem tamanho</span>}
                    </td>
                    <td className="px-3 py-2">{ciclo(p)}</td>
                    <td className={`px-3 py-2 ${p.voltasDaValidacao > 0 ? "text-warning-fg" : ""}`}>{p.voltasDaValidacao}</td>
                    <td className={`px-3 py-2 ${p.retrabalho > 0 ? "text-warning-fg" : ""}`}>{p.retrabalho}</td>
                    <td className="px-3 py-2">
                      {chamados(p)}
                      {p.chamadosReabertos > 0 && <span className="block text-micro text-warning-fg">{p.chamadosReabertos} reabertos</span>}
                    </td>
                    <td className="px-3 py-2 border-l border-border">
                      <NoGithub pessoa={p} github={github} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </>
      )}
      <p className="mt-4 text-micro text-fg-muted">
        Só a entrega que passou por “Em validação” e tem tamanho soma pontos. O GitHub mostra atividade, não entrega: fica de fora de toda conta. Nenhuma medida serve
        sozinha para remuneração.
      </p>
    </PageContainer>
  );
}
