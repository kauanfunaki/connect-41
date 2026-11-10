import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { TextosDaAcademia } from "@/components/academia/admin/TextosDaAcademia";
import { QuestoesDaAcademia } from "@/components/academia/admin/QuestoesDaAcademia";
import { PremioDoMes } from "@/components/academia/admin/PremioDoMes";
import { abrirAcademia, listarQuestoes, listarTextos, premiosDosMeses } from "@/lib/academia/servidor";
import { mesAnterior, mesDoInstante } from "@/lib/academia/regras";

type Aba = "textos" | "questoes" | "premio";
const ABAS: { key: Aba; label: string }[] = [
  { key: "textos", label: "Textos de digitação" },
  { key: "questoes", label: "Questões de lógica" },
  { key: "premio", label: "Prêmio do mês" },
];

/** O próximo mês ("AAAA-MM"). */
function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * A administração da Academia (10/11/2026, pedido do Kauan): textos, questões
 * (com imagens) e o prêmio do mês. Só Administrador, Super Admin e a
 * coordenação da Tech; os outros recebem 404, como em toda tela que não abrem.
 */
export default async function AdminDaAcademiaPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const [{ aba: pedida }, { ctx, podeAdministrar }] = await Promise.all([searchParams, abrirAcademia()]);
  if (!podeAdministrar) notFound();
  const aba: Aba = pedida === "questoes" || pedida === "premio" ? pedida : "textos";
  const atual = mesDoInstante();
  // O prêmio se define para o mês de agora, o seguinte (para anunciar antes) e o anterior (para corrigir).
  const meses = [atual, mesSeguinte(atual), mesAnterior(atual)];

  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="admin" podeAdministrar />
      <SegmentedControl
        label="O que administrar"
        active={aba}
        tocavel
        className="mb-4"
        items={ABAS.map((a) => ({ ...a, href: `/academia/admin?aba=${a.key}` }))}
      />
      {aba === "textos" && <TextosDaAcademia textos={await listarTextos(ctx.tenantId)} />}
      {aba === "questoes" && <QuestoesDaAcademia questoes={await listarQuestoes(ctx.tenantId)} />}
      {aba === "premio" && <PremioDoMes premios={await premiosDosMeses(ctx.tenantId, meses)} meses={meses} />}
    </PageContainer>
  );
}
