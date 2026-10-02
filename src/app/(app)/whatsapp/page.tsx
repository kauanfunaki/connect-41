import { notFound } from "next/navigation";
import { MessagesSquare, UserCheck, UserX } from "lucide-react";
import { getAuthContext, canActOnSector, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { ConversasLista } from "@/components/whatsapp/ConversasLista";
import { EstadoDasConexoes } from "@/components/whatsapp/EstadoDasConexoes";
import { listarConversas, saudeDasConexoes } from "@/lib/whatsapp/data";
import { filtrarConversas, recorteDaUrl, type RecorteDaLista } from "@/lib/whatsapp/conversas";
import { setorDoModulo, isModuleEnabled } from "@/lib/modules";

const MODULE = "recrutamento_whatsapp";

export const dynamic = "force-dynamic";

const RECORTES: { chave: RecorteDaLista; rotulo: string }[] = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "sem_responsavel", rotulo: "Sem responsável" },
  { chave: "minhas", rotulo: "Minhas" },
];

const ICONE_DO_RECORTE: Record<RecorteDaLista, React.ReactNode> = {
  todas: <MessagesSquare />,
  sem_responsavel: <UserX />,
  minhas: <UserCheck />,
};

export default async function ConversasDeWhatsappPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const recorte = recorteDaUrl((await searchParams).ver);
  const ctx = await getAuthContext();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
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
      {/* Os recortes em cartão, com a contagem (conferência de 30/09): eram
          abas, e aba troca a tela — aqui é a mesma lista, recortada. Clicar no
          cartão do recorte aberto volta para todas. */}
      <FaixaDeTotais
        itens={RECORTES.map((r) => {
          const n = filtrarConversas(conversas, r.chave, ctx.userId).length;
          const ativo = r.chave === recorte;
          return {
            rotulo: r.rotulo,
            valor: String(n),
            icone: ICONE_DO_RECORTE[r.chave],
            tom: r.chave === "sem_responsavel" && n > 0 ? "text-warning" : undefined,
            detalhe: ativo ? "mostrando agora" : undefined,
            href: r.chave === "todas" || ativo ? "/whatsapp" : `/whatsapp?ver=${r.chave}`,
          };
        })}
      />
      <ConversasLista conversas={filtrarConversas(conversas, recorte, ctx.userId)} agora={agora} userId={ctx.userId} filtrada={recorte !== "todas"} />
    </PageContainer>
  );
}
