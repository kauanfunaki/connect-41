import { getPrisma } from "@/lib/prisma";
import { normalizarNomeAtendente } from "@/lib/chatwoot/evaluation";
import { definirPapelDoRemetente } from "@/app/(app)/admin/usuarios/atendimento-actions";
import { ToggleAgenteButton } from "@/components/adminVinculos/ToggleAgenteButton";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";

/**
 * Os papéis dos atendentes do Chatwoot — Recepção e Automação —, na seção do
 * Chatwoot em Integrações (escolha 3A dos Ajustes de 15/10, 20/10/2026). Era a
 * segunda tabela da tela Atendentes e vínculos, que saiu: o vínculo de cada
 * pessoa com o atendente foi para a edição do usuário, e isto aqui não é de
 * usuário, é da integração.
 *
 * A lista sai de todo NOME que já apareceu como autor, não só dos agentes
 * sincronizados: `ChatwootAgentLink` só ganha linha para quem foi responsável
 * por alguma conversa, e a conta da automação escrevia centenas de mensagens
 * sem nenhuma linha. Sem nenhum nome, a seção não aparece.
 */
export async function PapeisDosAtendentes({ tenantId, canEdit }: { tenantId: string; canEdit: boolean }) {
  const prisma = getPrisma();
  const [remetentes, papeis, agentLinks] = await Promise.all([
    prisma.chatwootMessage.groupBy({
      by: ["senderLabel"],
      where: { conversation: { tenantId }, messageType: "outgoing", isPrivate: false, senderLabel: { not: null } },
      _count: { _all: true },
    }),
    prisma.chatwootSenderRole.findMany({
      where: { tenantId },
      select: { senderName: true, isReception: true, isAutomation: true },
    }),
    prisma.chatwootAgentLink.findMany({ where: { tenantId }, select: { chatwootAgentName: true } }),
  ]);

  const papelPorNome = new Map(papeis.map((p) => [p.senderName, p]));
  const linhas = [
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

  if (linhas.length === 0) return null;

  const interruptores = (nome: string, chave: string) => {
    const papel = papelPorNome.get(chave);
    return {
      recepcao: (
        <ToggleAgenteButton
          nome={nome}
          ligado={papel?.isReception ?? false}
          rotuloLigado="Recepção"
          rotuloDesligado="Setor"
          canEdit={canEdit}
          action={async (ligado: boolean) => {
            "use server";
            await definirPapelDoRemetente(nome, { isReception: ligado });
          }}
        />
      ),
      automacao: (
        <ToggleAgenteButton
          nome={nome}
          ligado={papel?.isAutomation ?? false}
          rotuloLigado="Automação"
          rotuloDesligado="Pessoa"
          canEdit={canEdit}
          action={async (ligado: boolean) => {
            "use server";
            await definirPapelDoRemetente(nome, { isAutomation: ligado });
          }}
        />
      ),
    };
  };
  const mensagens = (n: number) => (n > 0 ? `${n} mensagens` : "sem mensagens ainda");

  return (
    <section id="papeis-dos-atendentes" className="mt-6 scroll-mt-6">
      <h3 className="text-card-title font-semibold text-fg">Papéis dos atendentes</h3>
      <p className="text-helper text-fg-muted mt-0.5 mb-4 max-w-[80ch]">
        <span className="font-medium text-fg">Recepção</span> é quem recebe o atendimento antes de passar para o setor —
        a barreira entre a nota de triagem e a de tratativa é a primeira resposta ao cliente de alguém que não está
        marcado assim. <span className="font-medium text-fg">Automação</span> é a conta que a integração usa para
        mandar saudação, aviso de fora de horário e agradecimento final: sem a marcação, ela vira &quot;quem
        atendeu&quot;, porque a mensagem de encerramento é sempre a última. Vale para as próximas avaliações — o
        histórico só muda quando a repontuação roda. Quem cada atendente é na equipe se escolhe em Usuários, na
        edição da pessoa.
      </p>
      {/* No celular, um cartão por atendente, com os dois interruptores
          (15/10/2026): a tabela de 560px rolava de lado. */}
      <CartoesNoCelular>
        {linhas.map((r) => {
          const { recepcao, automacao } = interruptores(r.nome, r.chave);
          return (
            <Cartao key={r.chave}>
              <TopoDoCartao nome={r.nome} />
              <InfoDoCartao className="tnum">{mensagens(r.mensagens)}</InfoDoCartao>
              <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-ui">
                <span className="text-fg-muted">Recepção</span>
                {recepcao}
                <span className="text-fg-muted">Automação</span>
                {automacao}
              </div>
            </Cartao>
          );
        })}
      </CartoesNoCelular>
      {/* Tabela no casco padrão, com funil nos dois papéis (polimento de 30/09). */}
      <TabelaFiltravel
        linhas={linhas.map((r) => {
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
        <TabelaNoDesktop padrao>
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-border">
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
              {linhas.map((r) => {
                const { recepcao, automacao } = interruptores(r.nome, r.chave);
                return (
                  <LinhaFiltravel key={r.chave} id={r.chave} className="border-b border-border">
                    <td className="px-4 py-3">
                      <span className="text-ui text-fg">{r.nome}</span>
                      <span className="ml-2 text-micro text-fg-muted tnum">{mensagens(r.mensagens)}</span>
                    </td>
                    <td className="px-4 py-3">{recepcao}</td>
                    <td className="px-4 py-3">{automacao}</td>
                  </LinhaFiltravel>
                );
              })}
            </tbody>
          </table>
        </TabelaNoDesktop>
      </TabelaFiltravel>
    </section>
  );
}
