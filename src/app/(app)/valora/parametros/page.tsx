import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
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
      <PageHeader
        title="Parâmetros do Valora"
        subtitle="Quanto custa cada setor e que margem o preço tem de entregar. Os tempos das atividades vêm dos questionários dos setores."
        action={
          <Button href="/valora" variant="secondary" size="sm">
            Voltar às propostas
          </Button>
        }
      />
      <FormParametros catalogo={catalogo} parametros={parametros} podeEditar={acesso.podeGerir} />

      <Card className="p-4 mt-6">
        <h2 className="text-[13px] font-semibold mb-1">Catálogo de atividades</h2>
        <p className="text-[12px] text-fg-muted mb-3">
          Tempo por execução declarado por cada setor, antes do fator. Muda quando os questionários são refeitos — não por
          aqui.
        </p>
        {catalogo.setores.map((s) => (
          <details key={s.codigo} className="border-t border-border-soft py-2">
            <summary className="cursor-pointer text-[13px] font-medium">
              {s.nome} <span className="text-fg-muted font-normal">· {catalogo.atividades.filter((a) => a.setor === s.codigo).length} atividades</span>
            </summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full min-w-[820px] text-[12px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">Atividade</th>
                    <th className="py-2 pr-3 font-medium">Frequência</th>
                    <th className="py-2 pr-3 font-medium">Quando entra</th>
                    {REGIMES.map((r) => (
                      <th key={r} className="py-2 pr-3 font-medium text-right">
                        {ROTULO_REGIME[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catalogo.atividades
                    .filter((a) => a.setor === s.codigo)
                    .map((a) => (
                      <tr key={a.id} className="border-b border-border-soft align-top">
                        <td className="py-1.5 pr-3">
                          <span className="text-fg-muted tabular-nums mr-2">{a.id}</span>
                          {a.nome}
                          {a.implantacao && <span className="text-fg-muted"> (implantação)</span>}
                          {a.avulso && <span className="text-fg-muted"> (avulso, por execução)</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-fg-secondary">{FREQUENCIA[a.frequencia]}</td>
                        <td className="py-1.5 pr-3 text-fg-secondary">
                          {a.condicao ? (campos.get(a.condicao) ?? "Tem funcionários") : "Sempre"}
                          {a.quantidade.tipo === "volume" && (
                            <span className="block text-[11px] text-fg-muted">
                              × {campos.get(a.quantidade.campo) ?? a.quantidade.campo}
                              {a.quantidade.fator !== undefined && ` × ${num(a.quantidade.fator, 2)}`}
                            </span>
                          )}
                        </td>
                        {REGIMES.map((r) => (
                          <td key={r} className="py-1.5 pr-3 text-right tabular-nums">
                            {a.tempoMin[r] ? `${num(a.tempoMin[r]!)} min` : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </Card>
    </PageContainer>
  );
}
