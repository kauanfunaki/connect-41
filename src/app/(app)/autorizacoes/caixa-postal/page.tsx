import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { AbrirMensagem, VerMensagem } from "@/components/autorizacoes/BotoesDaReceita";
import { situacaoDaMensagem } from "@/components/autorizacoes/ReceitaNaFicha";
import { getAuthContext } from "@/lib/auth/context";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { configuracaoDoSerpro, prontidaoDoSerpro } from "@/lib/serpro/cliente";
import { mensagensDaCarteira, type MensagemDaCarteira } from "@/lib/serpro/acompanhamento";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * A Caixa Postal da Receita de todos os clientes (Fase 1 do Integra Contador,
 * 20/10/2026): as mensagens que o Connect trouxe do Serpro, as mais recentes
 * primeiro. A lista vem sozinha quando o Serpro avisa de mensagem nova; abrir
 * dá ciência da intimação, e só a coordenação do Fiscal abre.
 */
export default async function CaixaPostalPage() {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) notFound();
  const cfg = await configuracaoDoSerpro(acesso.tenantId);
  if (!cfg || cfg.ambiente !== "producao") notFound();
  const pronta = prontidaoDoSerpro(cfg);
  const mensagens = await mensagensDaCarteira(acesso.tenantId);
  const podeAbrir = acesso.podeConfigurar && pronta.pronta;
  const novas = mensagens.filter((m) => !m.abertaEm && !m.cienciaEm).length;

  const acao = (m: MensagemDaCarteira) => (m.abertaEm ? <VerMensagem id={m.id} /> : podeAbrir ? <AbrirMensagem id={m.id} /> : null);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Autorizações de acesso", href: "/autorizacoes" }, { label: "Caixa Postal da Receita" }]} />
      <PageHeader
        title="Caixa Postal da Receita"
        subtitle="As mensagens da Receita que o Connect trouxe pelo Serpro. A lista vem sozinha quando o Serpro avisa de mensagem nova; abrir uma mensagem dá ciência da intimação, e o prazo começa a contar."
      />

      {!pronta.pronta && (
        <Aviso tom="atencao" className="mb-4">
          {pronta.motivo}
        </Aviso>
      )}
      {!acesso.podeConfigurar && (
        <Aviso tom="info" className="mb-4">
          Só a coordenação do Fiscal abre mensagens: abrir dá ciência da intimação. As que já foram abertas, todos do setor podem ler.
        </Aviso>
      )}

      <CascoDaTabela contagem={contarItens(mensagens.length, "mensagem", "mensagens") + (novas ? ` · ${novas} sem ciência` : "")}>
        {mensagens.length === 0 ? (
          <EmptyState
            title="Nenhuma mensagem ainda"
            description="Quando o Serpro avisar de mensagem nova num cliente, a lista aparece aqui e o setor recebe um aviso."
            icon={<Mail />}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {mensagens.map((m) => (
                <Cartao key={m.id}>
                  <TopoDoCartao nome={m.empresa ? <Link href={`/empresas/${m.empresa.id}`}>{m.empresa.nome}</Link> : "Cliente"} />
                  <InfoDoCartao>{m.assunto}</InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    {formatInstantDate(new Date(m.enviadaEm))} · {situacaoDaMensagem(m)}
                  </InfoDoCartao>
                  <PeDoCartao>
                    {m.relevante && <Selo tom="atencao">Relevante</Selo>}
                    {acao(m)}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>
            <div className="c41-tabela scroll-x overflow-x-auto bg-surface border border-border rounded-lg hidden md:block">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr>
                    <th className="px-3">Cliente</th>
                    <th className="px-3">Assunto</th>
                    <th className="px-3">Enviada</th>
                    <th className="px-3">Situação</th>
                    <th className="px-3" />
                  </tr>
                </thead>
                <tbody>
                  {mensagens.map((m) => (
                    <tr key={m.id} className="border-b border-border-soft align-top">
                      <td className="px-3">{m.empresa ? <Link href={`/empresas/${m.empresa.id}`}>{m.empresa.nome}</Link> : "—"}</td>
                      <td className="px-3 break-words">
                        {m.assunto} {m.relevante && <Selo tom="atencao">Relevante</Selo>}
                        {m.origem && <span className="block text-micro text-fg-muted">{m.origem}</span>}
                      </td>
                      <td className="px-3 tabular-nums whitespace-nowrap">{formatInstantDate(new Date(m.enviadaEm))}</td>
                      <td className="px-3 text-fg-secondary">{situacaoDaMensagem(m)}</td>
                      <td className="px-3 text-right">{acao(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
