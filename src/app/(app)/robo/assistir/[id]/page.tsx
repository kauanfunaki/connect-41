import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { AssistenciaAoVivo } from "@/components/robo/AssistenciaAoVivo";
import { getAuthContext } from "@/lib/auth/context";
import { lerAssistencia, podeAssistir } from "@/lib/robo/assistenciaServidor";

// Resolver o captcha do robô (06/11/2026): a pessoa chega pelo aviso do sino ou
// do celular, vê a tela do navegador do robô ao vivo e marca o "Não sou um
// robô" com o mouse. O robô continua sozinho. Ver src/lib/robo/assistencia.ts.
export default async function AssistirRoboPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!(await podeAssistir(ctx))) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Sem o quadro aqui: a página pede o primeiro logo que abre.
  const a = await lerAssistencia(ctx, id, Number.MAX_SAFE_INTEGER);
  if (!a) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Hub de robôs", href: "/robo" }, { label: "Resolver o captcha" }]} />
      <PageHeader title="Resolver o captcha do robô" subtitle={a.empresa ? `${a.oQue} · ${a.empresa}` : a.oQue} />
      <AssistenciaAoVivo tarefaId={a.tarefaId} />
    </PageContainer>
  );
}
