// A caixa de conversas do WhatsApp do Recrutamento: o que a lista (/whatsapp)
// e a conversa aberta (/whatsapp/[id]) carregam igual, e a moldura das duas —
// cabeçalho, estado das conexões e os recortes com a contagem.

import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EstadoDasConexoes } from "@/components/whatsapp/EstadoDasConexoes";
import { CaixaDeConversas, RecortesDaCaixa } from "@/components/conversas/caixa/Caixa";
import { ConversasLista } from "@/components/whatsapp/ConversasLista";
import { listarConversas, saudeDasConexoes } from "@/lib/whatsapp/data";
import { filtrarConversas, recorteDaUrl, type RecorteDaLista } from "@/lib/whatsapp/conversas";
import { setorDoModulo, isModuleEnabled } from "@/lib/modules";
import { pessoasDoAtendimento } from "@/lib/whatsapp/equipe";

const MODULE = "recrutamento_whatsapp";

const RECORTES: { chave: RecorteDaLista; rotulo: string }[] = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "sem_responsavel", rotulo: "Sem responsável" },
  { chave: "minhas", rotulo: "Minhas" },
];

export async function carregarCaixa(ver: string | undefined) {
  const recorte = recorteDaUrl(ver);
  const ctx = await getAuthContext();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? "recrutamento") : "recrutamento";
  if (!ctx.tenantId || !canActOnSector(ctx, setor)) notFound();

  const agora = new Date();
  // Juntas: a consulta ao provedor tem timeout próprio, e a lista não espera por ela.
  const [conversas, conexoes, pessoas] = await Promise.all([
    listarConversas(ctx.tenantId, agora),
    saudeDasConexoes(ctx.tenantId, agora),
    pessoasDoAtendimento(ctx.tenantId, setor),
  ]);
  const lista = filtrarConversas(conversas, recorte, ctx.userId);
  // O recorte vai junto quando se abre uma conversa e quando se fecha.
  const sufixo = recorte === "todas" ? "" : `?ver=${recorte}`;
  return { ctx, setor, agora, recorte, conversas, lista, conexoes, pessoas, sufixo };
}

export function MolduraDaCaixa({
  dados,
  abertaId,
  painel,
}: {
  dados: Awaited<ReturnType<typeof carregarCaixa>>;
  abertaId: string | null;
  painel: ReactNode;
}) {
  const { ctx, recorte, conversas, lista, conexoes, pessoas, agora, sufixo } = dados;
  return (
    <PageContainer>
      <PageHeader
        title="WhatsApp do Recrutamento"
        subtitle="O assistente responde o que sabe; o que sai do combinado aparece aqui, esperando alguém."
      />
      <EstadoDasConexoes conexoes={conexoes} podeConfigurar={isFullWrite(ctx.role)} />
      <RecortesDaCaixa
        itens={RECORTES.map((r) => {
          const ativo = r.chave === recorte;
          const base = abertaId ? `/whatsapp/${abertaId}` : "/whatsapp";
          return {
            rotulo: r.rotulo,
            n: filtrarConversas(conversas, r.chave, ctx.userId).length,
            href: r.chave === "todas" ? base : `${base}?ver=${r.chave}`,
            ativo,
            tom: r.chave === "sem_responsavel" ? "atencao" : undefined,
          };
        })}
      />
      <CaixaDeConversas
        aberta={!!abertaId}
        lista={
          <ConversasLista
            conversas={lista}
            agora={agora}
            userId={ctx.userId}
            filtrada={recorte !== "todas"}
            pessoas={pessoas}
            abertaId={abertaId}
            sufixo={sufixo}
          />
        }
        painel={painel}
      />
    </PageContainer>
  );
}
