import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { EditorDoRoteiro } from "@/components/societario/EditorDoRoteiro";
import { carregarRoteiro, type VersaoDoRoteiro } from "@/lib/societario/roteirosServidor";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODULE = "societario_processos";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O roteiro de um tipo de processo (09/11/2026): o editor à esquerda e as
 * versões à direita. O editor é remontado a cada versão publicada (`key`), e
 * volta a partir da que acabou de entrar em vigor.
 */
export default async function RoteiroDoTipoPage({ params }: { params: Promise<{ tipoId: string }> }) {
  const { ctx } = await abrirTelaDoModulo(MODULE);
  if (!(await podeNoModulo(ctx, MODULE, "gerir"))) notFound();
  const { tipoId } = await params;
  const roteiro = await carregarRoteiro(ctx.tenantId, tipoId);
  if (!roteiro) notFound();

  const emAndamento = roteiro.historico.reduce((s, v) => s + v.emAndamento, 0);
  const { vigente } = roteiro;

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Processos", href: "/processos" },
          { label: "Roteiros", href: "/processos/roteiros" },
          { label: roteiro.tipo.nome, truncate: true },
        ]}
      />
      <PageHeader
        title={roteiro.tipo.nome}
        subtitle={
          vigente
            ? `Versão ${vigente.numero} em vigor desde ${formatInstantDate(vigente.desde)}. Publicar cria a versão ${roteiro.versaoBase + 1}, que vale para os processos abertos daqui em diante; os que estão em andamento continuam na versão em que começaram.`
            : "Este tipo ainda não tem roteiro, e a abertura de processo não o oferece. Monte as etapas e publique."
        }
        meta={
          !roteiro.tipo.ativo ? (
            <>
              <Selo tom="neutro">Inativo</Selo>
              <span>Não aparece na abertura de processo enquanto estiver inativo.</span>
            </>
          ) : undefined
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <EditorDoRoteiro
          key={roteiro.versaoBase}
          tipoId={roteiro.tipo.id}
          versaoBase={roteiro.versaoBase}
          vigente={vigente?.numero ?? null}
          inicial={vigente?.etapas ?? []}
          orgaos={roteiro.orgaos}
          emAndamento={emAndamento}
        />
        <Versoes versoes={roteiro.historico} />
      </div>
    </PageContainer>
  );
}

/** As versões, da mais nova para a mais antiga: número, quando, quem publicou e quantos processos ainda andam nela. */
function Versoes({ versoes }: { versoes: VersaoDoRoteiro[] }) {
  return (
    <Card as="section" aria-labelledby="versoes-do-roteiro" className="flex flex-col gap-2 p-4">
      <h2 id="versoes-do-roteiro" className="flex items-center gap-2 text-section font-semibold text-fg">
        <History size={16} aria-hidden className="text-fg-muted" />
        Versões
      </h2>
      {versoes.length === 0 ? (
        <p className="text-fs-2 text-fg-muted">Nenhuma ainda. A primeira nasce quando você publicar.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border-soft">
          {versoes.map((v) => (
            <li key={v.id} className="flex flex-col gap-0.5 py-2.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-ui font-semibold text-fg tabular-nums">Versão {v.numero}</span>
                {v.vigente && <Selo tom="sucesso">Em vigor</Selo>}
              </span>
              <span className="text-fs-2 text-fg-secondary tabular-nums">
                {formatInstantDateTime(v.criadaEm)} · {v.autor ?? "gravada fora da tela"}
              </span>
              <span className="text-micro text-fg-muted tabular-nums">
                {plural(v.etapas, "etapa", "etapas")} · {v.emAndamento === 0 ? "nenhum processo em andamento" : plural(v.emAndamento, "processo em andamento", "processos em andamento")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
