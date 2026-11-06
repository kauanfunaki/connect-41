import { GitBranch, Users } from "lucide-react";
import { TYPE_LABELS } from "@/lib/github/types";
import type { contribuicoesPorPessoa } from "@/lib/github/queries";
import { CartoesNoCelular, Cartao, InfoDoCartao, TabelaNoDesktop, TopoDoCartao } from "@/components/shared/ListaResponsiva";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PessoaNasEntregas } from "@/lib/tech-interno/entregas";
import { formatarNumero } from "@/lib/format";

export type GithubPorPessoa = Awaited<ReturnType<typeof contribuicoesPorPessoa>>;

const ciclo = (p: PessoaNasEntregas) => (p.cicloMedianoDias === null ? "—" : `${formatarNumero(p.cicloMedianoDias, 1)} dias`);
const chamados = (p: PessoaNasEntregas) => (p.chamados === 0 ? "—" : `${p.chamadosNoPrazo} de ${p.chamados}`);

/** "128 contribuições" e, na dica, o que são — commits, PRs, revisões. Sem conta vinculada, diz isso. */
function NoGithub({ pessoa, github }: { pessoa: PessoaNasEntregas; github: GithubPorPessoa }) {
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
 * As entregas de cada pessoa no período (05/11/2026; era a aba Pessoas até
 * 06/11): pontos, itens, ciclo, voltas, retrabalho e chamados, com o GitHub
 * numa coluna só, como contexto — commits e PRs dizem atividade, não entrega.
 * Cartões no celular, tabela no desktop.
 */
export function TabelaPorPessoa({ pessoas, github, titulo }: { pessoas: PessoaNasEntregas[]; github: GithubPorPessoa; titulo: string }) {
  if (pessoas.length === 0) {
    return <EmptyState icon={<Users />} title="Ninguém entregou no período" description="Itens concluídos no Controle interno e chamados resolvidos aparecem aqui." />;
  }
  return (
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
          <caption className="sr-only">{titulo}</caption>
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
  );
}
