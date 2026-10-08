import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { FormParametros } from "@/components/valora/FormParametros";
import { acessoAoValora, configDoValora } from "@/lib/valora/servidor";
import { REGIMES, ROTULO_REGIME } from "@/lib/valora/motor";
import { num } from "@/lib/valora/formato";

export const dynamic = "force-dynamic";

const FREQUENCIA = { mensal: "Mensal", trimestral: "Trimestral", anual: "Anual", evento: "Por evento" } as const;

export default async function ParametrosDoValoraPage() {
  const acesso = await acessoAoValora();
  // Custo de equipe é confidencial: quem não administra o setor nem vê a tela.
  if (!acesso || !acesso.podeGerir) notFound();
  const { catalogo, parametros } = await configDoValora(acesso.tenantId);
  const campos = new Map(catalogo.campos.map((c) => [c.chave, c.rotulo]));

  return (
    <PageContainer>
      {/* O voltar do app (o `BackButton` com destino), e não um botão no lugar
          das ações — um desenho só para "voltar" (07/10/2026). */}
      <BackButton href="/valora" rotulo="Propostas" className="mb-3" />
      <PageHeader
        title="Parâmetros do Valora"
        subtitle="Quanto custa cada setor e que margem o preço tem de entregar. Os tempos das atividades vêm dos questionários dos setores."
      />
      <FormParametros catalogo={catalogo} parametros={parametros} podeEditar={acesso.podeGerir} />

      <Card className="p-4 mt-6">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-1">Catálogo de atividades</h2>
        <p className="text-[length:var(--fs-2)] text-fg-muted mb-3">
          Tempo por execução declarado por cada setor, antes do fator. Muda quando os questionários são refeitos — não por
          aqui.
        </p>
        {catalogo.setores.map((s) => {
          const atividades = catalogo.atividades.filter((a) => a.setor === s.codigo);
          const quandoEntra = (a: (typeof atividades)[number]) => (a.condicao ? (campos.get(a.condicao) ?? "Tem funcionários") : "Sempre");
          return (
            <details key={s.codigo} className="border-t border-border-soft py-2">
              <summary className="cursor-pointer text-[length:var(--fs-ui)] font-medium">
                {s.nome} <span className="text-fg-muted font-normal">· {atividades.length} atividades</span>
              </summary>
              {/* Casco padrão, com funil em frequência e em "quando entra" — as
                  duas colunas de valor repetido (30/09). A atividade fica
                  alinhada à esquerda: é texto corrido com o código na frente. */}
              <TabelaFiltravel
                linhas={atividades.map((a) => ({
                  id: a.id,
                  valores: { frequencia: FREQUENCIA[a.frequencia], quando: quandoEntra(a) },
                }))}
              >
                <div className="c41-tabela overflow-x-auto rounded-lg border border-border mt-2">
                  <table className="w-full min-w-[820px]">
                    <thead>
                      <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                        <th className="px-3">Atividade</th>
                        <th className="px-3">
                          <FiltroDaColuna rotulo="Frequência" chave="frequencia" />
                        </th>
                        <th className="px-3">
                          <FiltroDaColuna rotulo="Quando entra" chave="quando" />
                        </th>
                        {REGIMES.map((r) => (
                          <th key={r} className="px-3">
                            {ROTULO_REGIME[r]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {atividades.map((a) => (
                        <LinhaFiltravel key={a.id} id={a.id} className="border-b border-border align-top">
                          <td className="px-3">
                            <span className="block text-left">
                              <span className="text-fg-muted tabular-nums mr-2">{a.id}</span>
                              {a.nome}
                              {a.implantacao && <span className="text-fg-muted"> (implantação)</span>}
                              {a.avulso && <span className="text-fg-muted"> (avulso, por execução)</span>}
                            </span>
                          </td>
                          <td className="px-3 text-fg-secondary">{FREQUENCIA[a.frequencia]}</td>
                          <td className="px-3 text-fg-secondary">
                            {quandoEntra(a)}
                            {a.quantidade.tipo === "volume" && (
                              <span className="block text-[length:var(--fs-micro)] text-fg-muted">
                                × {campos.get(a.quantidade.campo) ?? a.quantidade.campo}
                                {a.quantidade.fator !== undefined && ` × ${num(a.quantidade.fator, 2)}`}
                              </span>
                            )}
                          </td>
                          {REGIMES.map((r) => (
                            <td key={r} className="px-3 tabular-nums whitespace-nowrap">
                              {a.tempoMin[r] ? `${num(a.tempoMin[r]!)} min` : "—"}
                            </td>
                          ))}
                        </LinhaFiltravel>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabelaFiltravel>
            </details>
          );
        })}
      </Card>
    </PageContainer>
  );
}
