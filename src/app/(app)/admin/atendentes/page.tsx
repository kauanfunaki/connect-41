import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Users2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { canWriteEntity } from "@/lib/auth/policy";
import { PersonType } from "@/generated/prisma/enums";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonAccessLinkRow } from "@/components/adminVinculos/PersonAccessLinkRow";
import { vincularUsuarioPessoa } from "@/app/(app)/pessoas/actions";
import { vincularAgenteChatwoot, definirPapelDoRemetente } from "./actions";
import { ToggleAgenteButton } from "@/components/adminVinculos/ToggleAgenteButton";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { normalizarNomeAtendente } from "@/lib/chatwoot/evaluation";

// Tela única de vínculos de acesso: Pessoa (colaborador interno) <-> User
// (login) <-> ChatwootAgentLink (atendente). Antes eram duas telas separadas
// (User em /pessoas/[id], atendente aqui) — unificado por pedido do usuário,
// já que os dois vínculos formam uma cadeia só (Pessoa -> User -> Atendente).
export default async function AdminAtendentesPage() {
  const ctx = await getAuthContext();
  if (!isFullAccess(ctx.role)) notFound();

  const prisma = getPrisma();
  const [people, users, agentLinks] = await Promise.all([
    prisma.person.findMany({
      where: { tenantId: ctx.tenantId, type: PersonType.COLABORADOR, isInternal: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, linkedUserId: true },
    }),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.chatwootAgentLink.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { chatwootAgentName: "asc" },
      select: { id: true, chatwootAgentName: true, linkedUserId: true },
    }),
  ]);

  const canEdit = canWriteEntity(ctx);

  // Todo NOME que já apareceu como autor, não só os agentes sincronizados.
  //
  // `ChatwootAgentLink` só ganha linha para quem foi responsável por alguma
  // conversa; quem escreve sem nunca ser responsável ficava invisível aqui —
  // foi o caso da conta da automação, com centenas de mensagens e nenhuma
  // linha. A lista passa a sair das mensagens, que é onde a autoria mora.
  const [remetentes, papeis] = await Promise.all([
    prisma.chatwootMessage.groupBy({
      by: ["senderLabel"],
      where: { conversation: { tenantId: ctx.tenantId }, messageType: "outgoing", isPrivate: false, senderLabel: { not: null } },
      _count: { _all: true },
    }),
    prisma.chatwootSenderRole.findMany({
      where: { tenantId: ctx.tenantId },
      select: { senderName: true, isReception: true, isAutomation: true },
    }),
  ]);

  const papelPorNome = new Map(papeis.map((p) => [p.senderName, p]));
  const linhasDeRemetente = [
    ...new Map(
      [
        ...remetentes.map((r) => ({ nome: r.senderLabel!, mensagens: r._count._all })),
        // Agente sincronizado que ainda não escreveu também aparece, senão ele
        // sumiria da tela no dia em que passasse a mandar mensagem.
        ...agentLinks.map((a) => ({ nome: a.chatwootAgentName, mensagens: 0 })),
      ].map((r) => {
        const chave = normalizarNomeAtendente(r.nome) ?? r.nome;
        return [chave, { ...r, chave }] as const;
      })
    ).values(),
  ].sort((a, b) => b.mensagens - a.mensagens || a.nome.localeCompare(b.nome));

  const hasChatwoot = linhasDeRemetente.length > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Atendentes e Vínculos"
        subtitle={<>Para cada colaborador interno: qual conta de acesso (User) é dele e, se aplicável, qual agente do Chatwoot é
          essa mesma pessoa — usado para mostrar nome/foto reais em{" "}
          <span className="font-medium text-fg">Avaliação de Atendimentos</span>. Configuração de uma vez só.</>}
      />

      {people.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users2 />}
            title="Nenhum colaborador interno cadastrado"
            description="Marque um cadastro em Pessoas como funcionário interno para ele aparecer aqui."
          />
        </Card>
      ) : (
        // Tabela de verdade no casco padrão — era uma lista de fileiras flex com
        // um cabeçalho de texto solto. O funil nas duas colunas de vínculo acha
        // quem ainda está "Não vinculado" sem ler a lista (polimento de 30/09).
        <TabelaFiltravel
          linhas={people.map((p) => {
            const conta = p.linkedUserId ? users.find((u) => u.id === p.linkedUserId) : undefined;
            const atendente = p.linkedUserId ? agentLinks.find((a) => a.linkedUserId === p.linkedUserId) : undefined;
            return {
              id: p.id,
              valores: {
                conta: conta ? conta.name : "Não vinculado",
                atendente: atendente ? atendente.chatwootAgentName : "Não vinculado",
              },
            };
          })}
        >
          <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-fg-muted uppercase tracking-wide">
                  <th className="px-4 py-3">Pessoa</th>
                  <th className="px-4 py-3">
                    <FiltroDaColuna rotulo="Conta (User)" chave="conta" align={hasChatwoot ? "left" : "right"} />
                  </th>
                  {hasChatwoot && (
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Atendente Chatwoot" chave="atendente" align="right" />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <PersonAccessLinkRow
                    key={p.id}
                    personId={p.id}
                    personName={p.name}
                    linkedUserId={p.linkedUserId}
                    users={users}
                    agentLinks={hasChatwoot ? agentLinks : null}
                    canEdit={canEdit}
                    vincularUsuarioAction={vincularUsuarioPessoa}
                    vincularAgenteAction={vincularAgenteChatwoot}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TabelaFiltravel>
      )}

      {hasChatwoot && (
        <section className="mt-10">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg">Papéis dos atendentes</h2>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-0.5 mb-4">
            <span className="font-medium text-fg">Recepção</span> é quem recebe o atendimento antes
            de passar para o setor — a barreira entre a nota de triagem e a de tratativa é a
            primeira resposta ao cliente de alguém que não está marcado assim.{" "}
            <span className="font-medium text-fg">Automação</span> é a conta que a integração usa
            para mandar saudação, aviso de fora de horário e agradecimento final: sem a marcação,
            ela vira &quot;quem atendeu&quot;, porque a mensagem de encerramento é sempre a última.
            Vale para as próximas avaliações — o histórico só muda quando a repontuação roda.
          </p>
          {/* Tabela no casco padrão, com funil nos dois papéis (polimento de 30/09). */}
          <TabelaFiltravel
            linhas={linhasDeRemetente.map((r) => {
              const papel = papelPorNome.get(r.chave);
              return {
                id: r.chave,
                valores: {
                  recepcao: papel?.isReception ? "Recepção" : "Setor",
                  automacao: papel?.isAutomation ? "Automação" : "Pessoa",
                },
              };
            })}
          >
            <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-fg-muted uppercase tracking-wide">
                    <th className="px-4 py-3">Atendente do Chatwoot</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Recepção" chave="recepcao" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Automação" chave="automacao" align="right" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhasDeRemetente.map((r) => {
                    const papel = papelPorNome.get(r.chave);
                    return (
                      <LinhaFiltravel key={r.chave} id={r.chave} className="border-b border-border">
                        <td className="px-4 py-3">
                          <span className="text-[length:var(--fs-ui)] text-fg">{r.nome}</span>
                          <span className="ml-2 text-[length:var(--fs-micro)] text-fg-muted tnum">
                            {r.mensagens > 0 ? `${r.mensagens} mensagens` : "sem mensagens ainda"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ToggleAgenteButton
                            nome={r.nome}
                            ligado={papel?.isReception ?? false}
                            rotuloLigado="Recepção"
                            rotuloDesligado="Setor"
                            canEdit={canEdit}
                            action={async (ligado: boolean) => {
                              "use server";
                              await definirPapelDoRemetente(r.nome, { isReception: ligado });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <ToggleAgenteButton
                            nome={r.nome}
                            ligado={papel?.isAutomation ?? false}
                            rotuloLigado="Automação"
                            rotuloDesligado="Pessoa"
                            canEdit={canEdit}
                            action={async (ligado: boolean) => {
                              "use server";
                              await definirPapelDoRemetente(r.nome, { isAutomation: ligado });
                            }}
                          />
                        </td>
                      </LinhaFiltravel>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabelaFiltravel>
        </section>
      )}
    </PageContainer>
  );
}
