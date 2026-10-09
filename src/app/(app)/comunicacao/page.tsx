import { notFound } from "next/navigation";
import { Building2, ClipboardList, MessagesSquare, Paperclip, Clock } from "lucide-react";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import {
  AcaoRapida,
  BarraDoPainel,
  CaixaDeConversas,
  CartaoDeConversa,
  ColunaDaLista,
  LinhasDeInfo,
  PainelDeConversa,
  PainelVazio,
} from "@/components/conversas/caixa/Caixa";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { conversaDaEmpresa, empresasComConversa } from "@/lib/financeiro/comunicacao/consultas";
import { previa, MODULO_DE_COMUNICACAO } from "@/lib/financeiro/comunicacao/regras";
import { quandoCurto, vizinhas } from "@/lib/conversas/caixa";
import { enviarMensagemEquipe } from "./actions";

export const dynamic = "force-dynamic";

const MODULE = MODULO_DE_COMUNICACAO;
const SECTOR = getModuleDef(MODULE)!.sectorCode;

// A conversa livre com o cliente, do lado da equipe — na caixa de conversas
// (09/10/2026): quem tem conversa à esquerda, quem está esperando o escritório
// primeiro; a conversa escolhida (`?empresa=`) no painel, com a caixa de
// escrever. O seletor de empresa em cima começa conversa com quem não tem.
export default async function ComunicacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  // Com as solicitações ligadas (01/10), a conversa livre saiu do portal: o
  // cliente não vê mais mensagem nova daqui. A tela fica só como histórico.
  const substituida = await isModuleEnabled(ctx.tenantId, "portal_solicitacoes");
  const podeAgir = canActOnSector(ctx, setor) && !substituida;

  const { empresa: companyId } = await searchParams;
  const escopo = { tenantId: ctx.tenantId, companyIds: null };
  const [empresas, conversas] = await Promise.all([empresasDoSeletor(ctx.tenantId), empresasComConversa(escopo)]);
  const selecionada = companyId ? (empresas.find((e) => e.id === companyId) ?? null) : null;
  const conversa = selecionada ? await conversaDaEmpresa(escopo, selecionada.id) : null;
  const agora = new Date();

  const lista = conversas.map((c) => ({ id: c.empresaId, ...c }));
  const { anterior, proxima } = selecionada ? vizinhas(lista, selecionada.id) : { anterior: null, proxima: null };
  const resumo = selecionada ? conversas.find((c) => c.empresaId === selecionada.id)?.resumo : undefined;
  const ultima = conversa?.mensagens.at(-1);

  const painel =
    selecionada && conversa ? (
      <PainelDeConversa
        barra={
          <BarraDoPainel
            fecharHref="/comunicacao"
            anteriorHref={anterior ? `/comunicacao?empresa=${anterior.id}` : null}
            proximaHref={proxima ? `/comunicacao?empresa=${proxima.id}` : null}
            data={ultima ? `Última mensagem: ${formatInstantDateTime(ultima.criadaEm)}` : null}
          />
        }
        etiquetas={[
          resumo?.esperandoEscritorio ? (
            <Selo key="e" tom="atencao">
              Esperando o escritório
            </Selo>
          ) : null,
          <span key="m">
            {conversa.mensagens.length} {conversa.mensagens.length === 1 ? "mensagem" : "mensagens"}
          </span>,
        ]}
        titulo={selecionada.nome}
        acoes={
          <>
            <AcaoRapida icone={<Building2 />} href={`/empresas/${selecionada.id}`}>
              Abrir empresa
            </AcaoRapida>
            {substituida && (
              <AcaoRapida icone={<ClipboardList />} href="/solicitacoes">
                Abrir solicitações
              </AcaoRapida>
            )}
          </>
        }
        infos={
          <LinhasDeInfo
            itens={[
              { icone: <MessagesSquare />, rotulo: "Mensagens", valor: <span className="tabular-nums">{conversa.mensagens.length}</span> },
              { icone: <Paperclip />, rotulo: "Anexos", valor: <span className="tabular-nums">{resumo?.anexos ?? 0}</span> },
              {
                icone: <Clock />,
                rotulo: "Última",
                valor: ultima ? `${ultima.lado === "CLIENTE" ? "do cliente" : "da equipe"}, ${formatInstantDateTime(ultima.criadaEm)}` : "—",
              },
            ]}
          />
        }
      >
        <div className="px-5 sm:px-6 py-4 border-t border-border-soft flex flex-col gap-4">
          {conversa.mensagens.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare />}
              title="Nenhuma mensagem ainda"
              description={podeAgir ? "Escreva abaixo: o cliente recebe um aviso por e-mail e lê no portal." : "Esta empresa não tem conversa."}
            />
          ) : (
            <>
              {conversa.limitada && <p className="text-micro text-fg-muted">Mostrando as 300 mensagens mais recentes.</p>}
              <ConversaDaPendencia mensagens={conversa.mensagens} baseDoDownload="/api/comunicacao/anexos" ladoDeQuemVe="EQUIPE" />
            </>
          )}
          {podeAgir && (
            <div className="rounded-lg border border-border p-4">
              <ResponderPendencia
                alvo={selecionada.id}
                campo="companyId"
                acao={enviarMensagemEquipe}
                rotulo="Enviar mensagem"
                dica="O cliente recebe um e-mail avisando que há mensagem nova — o conteúdo fica só no portal."
              />
            </div>
          )}
        </div>
      </PainelDeConversa>
    ) : (
      <PainelVazio
        icone={<MessagesSquare />}
        titulo="Escolha uma conversa"
        texto={
          conversas.some((c) => c.resumo.esperandoEscritorio)
            ? "As que estão esperando o escritório vêm primeiro na lista. Use ↑↓ no painel para passar de uma para outra."
            : "Abra uma conversa à esquerda, ou escolha uma empresa acima para começar."
        }
      />
    );

  return (
    <PageContainer>
      <PageHeader title="Conversa com o cliente" subtitle="Recado livre por empresa, com anexos. Pedido com prazo é pendência." />

      {substituida && (
        // Revisão de 05/10: botão não é link — "Solicitações" era texto azul no meio da frase.
        <Aviso tom="info" className="mb-4">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-fg">
            <span>A conversa saiu do portal: agora o cliente fala com a equipe pelas Solicitações. Esta tela fica como histórico.</span>
            <Button href="/solicitacoes" variant="secondary" size="xs">
              Abrir solicitações
            </Button>
          </span>
        </Aviso>
      )}

      <FiltroDePeriodo acao="/comunicacao" empresas={empresas} empresaId={selecionada?.id ?? null} permitirTodas navegaSozinho />

      <CaixaDeConversas
        aberta={!!(selecionada && conversa)}
        altura={substituida ? "lg:h-[calc(100dvh-21rem)]" : "lg:h-[calc(100dvh-17rem)]"}
        lista={
          <ColunaDaLista>
            {conversas.length === 0 ? (
              <EmptyState icon={<MessagesSquare />} title="Nenhuma conversa ainda" description="Escolha uma empresa acima para começar." />
            ) : (
              conversas.map((c) => (
                <CartaoDeConversa
                  key={c.empresaId}
                  href={`/comunicacao?empresa=${c.empresaId}`}
                  nome={c.empresaNome}
                  nomeDasIniciais={c.empresaNome}
                  selo={c.resumo.esperandoEscritorio ? { tom: "atencao", texto: "Esperando o escritório" } : null}
                  quando={quandoCurto(c.resumo.ultima?.criadaEm ?? null, agora)}
                  contexto={`${c.resumo.mensagens} ${c.resumo.mensagens === 1 ? "mensagem" : "mensagens"}${
                    c.resumo.anexos > 0 ? ` · ${c.resumo.anexos} ${c.resumo.anexos === 1 ? "anexo" : "anexos"}` : ""
                  }`}
                  previa={c.resumo.ultima ? `${c.resumo.ultima.lado === "CLIENTE" ? "Cliente" : "Equipe"}: ${previa(c.resumo.ultima.corpo)}` : null}
                  selecionada={c.empresaId === selecionada?.id}
                />
              ))
            )}
          </ColunaDaLista>
        }
        painel={painel}
      />
    </PageContainer>
  );
}
