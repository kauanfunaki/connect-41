import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { ConversasLista } from "@/components/whatsapp/ConversasLista";
import { EstadoDasConexoes } from "@/components/whatsapp/EstadoDasConexoes";
import { listarConversas, saudeDasConexoes } from "@/lib/whatsapp/data";
import { filtrarConversas, recorteDaUrl, type RecorteDaLista } from "@/lib/whatsapp/conversas";
import { setorDoModulo } from "@/lib/modules";

const MODULE = "recrutamento_whatsapp";

export const dynamic = "force-dynamic";

const RECORTES: { chave: RecorteDaLista; rotulo: string }[] = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "sem_responsavel", rotulo: "Sem responsável" },
  { chave: "minhas", rotulo: "Minhas" },
];

export default async function ConversasDeWhatsappPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const recorte = recorteDaUrl((await searchParams).ver);
  const ctx = await getAuthContext();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? "recrutamento")) notFound();

  const agora = new Date();
  // Juntas: a consulta ao provedor tem timeout próprio, e a lista não espera por ela.
  const [conversas, conexoes] = await Promise.all([
    listarConversas(ctx.tenantId, agora),
    saudeDasConexoes(ctx.tenantId, agora),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="WhatsApp do Recrutamento"
        subtitle="As conversas com candidatos. O assistente responde o que sabe; o que sai do combinado aparece aqui, esperando alguém."
      />
      <EstadoDasConexoes conexoes={conexoes} podeConfigurar={isFullWrite(ctx.role)} />
      <nav className="flex flex-wrap gap-1 border-b border-border mb-3" aria-label="Recorte das conversas">
        {RECORTES.map((r) => {
          const n = filtrarConversas(conversas, r.chave, ctx.userId).length;
          const ativo = r.chave === recorte;
          return (
            <Link
              key={r.chave}
              href={r.chave === "todas" ? "/whatsapp" : `/whatsapp?ver=${r.chave}`}
              aria-current={ativo ? "page" : undefined}
              className={`px-3.5 h-10 inline-flex items-center gap-1.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                ativo ? "border-brand text-brand" : "border-transparent text-fg-secondary hover:text-fg"
              }`}
            >
              {r.rotulo}
              <span className="text-[11px] text-fg-muted tabular-nums">{n}</span>
            </Link>
          );
        })}
      </nav>
      <ConversasLista conversas={filtrarConversas(conversas, recorte, ctx.userId)} agora={agora} userId={ctx.userId} filtrada={recorte !== "todas"} />
    </PageContainer>
  );
}
