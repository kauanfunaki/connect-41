import { notFound } from "next/navigation";
import { contextoDaTela } from "@/lib/atendimento/contexto";
import { lerDetalhe } from "@/lib/atendimento/consultas";
import { PainelDoAtendimento } from "@/components/atendimento/PainelDoAtendimento";

export const dynamic = "force-dynamic";

export default async function ConversaDoAtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await contextoDaTela();
  if (!c) notFound();
  const detalhe = await lerDetalhe(c, id);
  if (!detalhe) notFound();
  return <PainelDoAtendimento key={id} d={detalhe} />;
}
