import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { avisosPendentes } from "@/lib/societario/avisos";
import { AvisosDaJunta } from "@/components/societario/AvisosDaJunta";
import { aplicarAviso, descartarAviso } from "../avisos-actions";

const SECTOR = "societario";
const MODULE = "societario_processos";

// Todos os avisos da Junta que chegaram por e-mail e esperam alguém — inclusive
// os que não bateram com nenhum protocolo aberto, que só aparecem aqui.
export default async function AvisosDaJuntaPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const avisos = await avisosPendentes(ctx.tenantId);

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Voltar" (P04, 15/10/2026): a tela sai de Processos. */}
      <Breadcrumb items={[{ label: "Processos", href: "/processos" }, { label: "Avisos da Junta" }]} />
      {/* A frase que explicava a tela foi para o artigo de ajuda (17/11/2026, melhoria-707). */}
      <PageHeader title="Avisos da Junta" />
      {avisos.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum aviso para conferir" description="Quando a Junta mandar um e-mail, ele aparece aqui e no processo." />
        </Card>
      ) : (
        <AvisosDaJunta avisos={avisos} acoes={{ aplicar: aplicarAviso, descartar: descartarAviso }} mostrarProcesso />
      )}
    </PageContainer>
  );
}
