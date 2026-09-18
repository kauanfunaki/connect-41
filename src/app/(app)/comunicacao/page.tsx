import { notFound } from "next/navigation";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { conversaDaEmpresa, empresasComConversa } from "@/lib/financeiro/comunicacao/consultas";
import { previa, MODULO_DE_COMUNICACAO } from "@/lib/financeiro/comunicacao/regras";
import { enviarMensagemEquipe } from "./actions";

export const dynamic = "force-dynamic";

const MODULE = MODULO_DE_COMUNICACAO;
const SECTOR = getModuleDef(MODULE)!.sectorCode;

// A conversa livre com o cliente, do lado da equipe.
//
// Uma tela só: a lista de quem tem conversa, e — com `?empresa=` — a conversa
// daquela empresa com a caixa de escrever. Sem empresa escolhida, a lista já é
// a resposta da pergunta da manhã: quem está esperando o escritório.
export default async function ComunicacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);

  const { empresa: companyId } = await searchParams;
  const escopo = { tenantId: ctx.tenantId, companyIds: null };
  const [empresas, conversas] = await Promise.all([empresasDoSeletor(ctx.tenantId), empresasComConversa(escopo)]);
  const selecionada = companyId ? empresas.find((e) => e.id === companyId) ?? null : null;
  const conversa = selecionada ? await conversaDaEmpresa(escopo, selecionada.id) : null;

  return (
    <PageContainer>
      <PageHeader
        title="Conversa com o cliente"
        subtitle="Recado livre por empresa, com anexos. Pedido com prazo é pendência."
      />

      <FiltroDePeriodo acao="/comunicacao" empresas={empresas} empresaId={selecionada?.id ?? null} permitirTodas />

      {selecionada && conversa ? (
        <>
          <h2 className="text-[14px] font-semibold text-fg mb-3">{selecionada.nome}</h2>
          {conversa.mensagens.length === 0 ? (
            <Card className="mb-4">
              <EmptyState
                icon={<MessagesSquare />}
                title="Nenhuma mensagem ainda"
                description="Escreva abaixo: o cliente recebe um aviso por e-mail e lê no portal."
              />
            </Card>
          ) : (
            <>
              {conversa.limitada && (
                <p className="text-[11px] text-fg-muted mb-2">Mostrando as 300 mensagens mais recentes.</p>
              )}
              <ConversaDaPendencia
                mensagens={conversa.mensagens}
                baseDoDownload="/api/comunicacao/anexos"
                ladoDeQuemVe="EQUIPE"
              />
            </>
          )}

          {podeAgir && (
            <Card className="mt-5 p-4">
              <ResponderPendencia
                alvo={selecionada.id}
                campo="companyId"
                acao={enviarMensagemEquipe}
                rotulo="Enviar mensagem"
                dica="O cliente recebe um e-mail avisando que há mensagem nova — o conteúdo fica só no portal."
              />
            </Card>
          )}
        </>
      ) : conversas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessagesSquare />}
            title="Nenhuma conversa ainda"
            description="Escolha uma empresa acima para começar."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {conversas.map((c) => (
            <Link
              key={c.empresaId}
              href={`/comunicacao?empresa=${c.empresaId}`}
              className="block bg-surface border border-border rounded-lg px-4 py-3 hover:border-border-strong hover:bg-surface-hover transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-fg">{c.empresaNome}</span>
                {c.resumo.esperandoEscritorio && <Badge variant="warning">Esperando o escritório</Badge>}
                <span className="ml-auto text-[11.5px] text-fg-muted tabular-nums">
                  {c.resumo.ultima && formatInstantDateTime(c.resumo.ultima.criadaEm)}
                </span>
              </div>
              {c.resumo.ultima && (
                <p className="text-[12.5px] text-fg-muted mt-1 break-words">
                  {c.resumo.ultima.lado === "CLIENTE" ? "Cliente" : "Equipe"}: {previa(c.resumo.ultima.corpo)}
                </p>
              )}
              <p className="text-[11.5px] text-fg-muted mt-0.5">
                {c.resumo.mensagens} {c.resumo.mensagens === 1 ? "mensagem" : "mensagens"}
                {c.resumo.anexos > 0 && ` · ${c.resumo.anexos} ${c.resumo.anexos === 1 ? "anexo" : "anexos"}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
