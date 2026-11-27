import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { ModelosDeDocumento } from "@/components/societario/ModelosDeDocumento";
import { AdvogadosETestemunhas } from "@/components/societario/AdvogadosETestemunhas";
import { listarModelos, listarParticipantes } from "@/lib/societario/modelos/servidor";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODULE = "societario_processos";

/**
 * Os modelos de documento do Societário (27/11/2026, funcionalidade-891): os
 * .docx do escritório (contrato social, alteração, distrato, ME/EPP, ata,
 * requerimento) e o cadastro de advogados e testemunhas que assinam — o
 * "Modelos de Documentos" do Domínio Registro. O documento sai em cada
 * processo, no cartão "Gerar documento".
 *
 * É da coordenação ("gerir" no módulo de processos), como os roteiros: para
 * quem só toca processo, responde como rota que não existe.
 */
export default async function ModelosDeDocumentoPage() {
  const { ctx } = await abrirTelaDoModulo(MODULE);
  if (!(await podeNoModulo(ctx, MODULE, "gerir"))) notFound();
  const [modelos, pessoas] = await Promise.all([listarModelos(ctx.tenantId), listarParticipantes(ctx.tenantId)]);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Processos", href: "/processos" }, { label: "Modelos de documento" }]} />
      <PageHeader title="Modelos de documento" />

      <div className="flex flex-col gap-5">
        <Card as="section" aria-labelledby="secao-modelos" className="p-4 flex flex-col gap-3">
          <h2 id="secao-modelos" className="text-section font-semibold text-fg">
            Modelos
          </h2>
          <ModelosDeDocumento
            modelos={modelos.map((m) => ({
              id: m.id,
              tipo: m.tipo,
              nome: m.nome,
              nomeArquivo: m.nomeArquivo,
              ativo: m.ativo,
              enviadoPor: m.enviadoPor,
              atualizadoEm: formatInstantDate(m.atualizadoEm),
              gerados: m.gerados,
            }))}
          />
        </Card>

        <Card as="section" aria-labelledby="secao-participantes" className="p-4 flex flex-col gap-3">
          <h2 id="secao-participantes" className="text-section font-semibold text-fg">
            Advogados e testemunhas
          </h2>
          <AdvogadosETestemunhas pessoas={pessoas} />
        </Card>
      </div>
    </PageContainer>
  );
}
