import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { emitirCarimbo } from "@/lib/carreiras/antiRobo";
import { APARENCIA_PADRAO } from "@/lib/aparencia/cores";
import { destinoDoPedido, marcaDoPedido } from "@/lib/solicitacoes/pedidoPublicoServidor";
import { EstiloDaAparencia } from "@/components/aparencia/EstiloDaAparencia";
import { LogoDoEscritorio } from "@/components/publico/LogoDoEscritorio";
import { FormularioDoPedido } from "@/components/pedido/FormularioDoPedido";
import { enviarPedidoPeloLink } from "@/app/(portal)/portal/(area)/solicitacoes/actions";

// Dinâmica de propósito, como a candidatura do portal de vagas e a ficha
// "Quero ser cliente": o formulário leva um carimbo de tempo assinado na hora
// em que a página é montada. Página em cache serviria o mesmo carimbo velho a
// todo mundo, e o envio seria recusado.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; assunto: string }> };

// Fora da busca: o link é o escritório que divulga, a quem ele quiser — não
// uma página para o Google mandar qualquer um.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, assunto } = await params;
  const destino = await destinoDoPedido(slug, assunto);
  if (!destino) return { title: "Link de pedido indisponível", robots: { index: false, follow: false } };
  return {
    title: `${destino.assunto.label} · ${destino.escritorio.nome}`,
    description: `Faça o seu pedido a ${destino.escritorio.nome}. A equipe entra em contato pelo telefone ou e-mail que você informar.`,
    robots: { index: false, follow: false },
  };
}

/**
 * O formulário público de pedido (09/11/2026): quem ainda não é cliente —
 * o primeiro caso é a abertura de empresa — preenche, sem login, e o pedido
 * chega ao setor do assunto como Solicitação. O escritório liga o link por
 * assunto, em Configurações › Portal do cliente › Assuntos das solicitações.
 *
 * Com a marca do escritório: o topo na cor principal da Aparência do portal,
 * com o logo e o nome — o mesmo topo da entrada do portal no celular
 * (`MolduraDeEntrada`), em todas as larguras. Quem abre é de fora e precisa
 * reconhecer de quem é a página.
 */
export default async function PedidoPeloLinkPage({ params }: Props) {
  const { slug, assunto: assuntoId } = await params;
  const destino = await destinoDoPedido(slug, assuntoId);
  if (!destino) notFound();
  const { assunto, escritorio } = destino;
  const marca = await marcaDoPedido(destino.tenantId, escritorio.nome);
  const prazo = `${assunto.responseDays} ${assunto.responseDays === 1 ? "dia útil" : "dias úteis"}`;

  return (
    <>
      {marca.corPrincipal && <EstiloDaAparencia aparencia={{ ...APARENCIA_PADRAO, corPrincipal: marca.corPrincipal }} grupos={false} />}
      <main className="c41-toque min-h-dvh bg-canvas">
        <div
          className="px-4 pt-8 pb-24 text-white sm:pt-12 sm:pb-28"
          style={{ background: "linear-gradient(165deg, var(--c41-brand-600), var(--c41-brand-900))" }}
        >
          <div className="mx-auto w-full max-w-xl">
            <p className="flex min-w-0 items-center gap-2.5">
              {marca.logoUrl && (
                // Sobre um quadro branco, como na entrada do portal: o logo é a
                // imagem que o escritório mandou, sem versão para fundo escuro.
                <LogoDoEscritorio src={marca.logoUrl} alt="" className="size-9 flex-shrink-0 rounded-md bg-white object-contain p-0.5" />
              )}
              <span className="truncate font-display text-fs-6 font-semibold" title={escritorio.nome}>
                {escritorio.nome}
              </span>
            </p>
            <h1 className="mt-7 text-title font-semibold leading-tight tracking-[-0.01em] [text-wrap:balance]">{assunto.label}</h1>
            <p className="mt-2 max-w-[52ch] text-fs-4 leading-relaxed text-white/80">
              Conte o que você precisa e deixe um contato. A equipe do escritório responde em até {prazo}, pelo telefone ou e-mail
              que você informar.
            </p>
          </div>
        </div>

        <div className="mx-auto -mt-16 w-full max-w-xl px-4 pb-10">
          <div className="[&>*]:shadow-[0_20px_50px_-24px_rgba(18,52,125,0.35)]">
            <FormularioDoPedido
              slug={escritorio.slug}
              assuntoId={assunto.id}
              carimbo={emitirCarimbo(new Date())}
              escritorio={escritorio.nome}
              ajudaDaMensagem={assunto.description}
              prazo={prazo}
              action={enviarPedidoPeloLink}
            />
          </div>

          {/* Quem já é cliente acompanha a resposta pelo portal — por aqui, a
              conversa da solicitação não chega a quem enviou. */}
          <p className="mt-6 text-center text-ui text-fg-muted">
            Já é cliente do escritório?{" "}
            <Link href="/portal/login" className="font-medium text-brand hover:underline">
              Peça pelo portal
            </Link>{" "}
            e acompanhe a resposta por lá.
          </p>
        </div>
      </main>
    </>
  );
}
