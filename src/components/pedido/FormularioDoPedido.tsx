"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { LIMITES_DO_PEDIDO, type CampoDoPedido, type ResultadoDoPedido } from "@/lib/solicitacoes/linkPublico";

type Props = {
  /** O slug do escritório e o id do assunto, do link — o servidor confere os dois de novo. */
  slug: string;
  assuntoId: string;
  /** Carimbo de tempo assinado na hora em que a página foi montada (anti-robô). */
  carimbo: string;
  /** Quem recebe o pedido e cuida dos dados (LGPD). */
  escritorio: string;
  /** A Explicação do assunto, que vira a ajuda da mensagem. */
  ajudaDaMensagem: string | null;
  /** "5 dias úteis" — o prazo de resposta do assunto, repetido na confirmação. */
  prazo: string;
  action: (form: FormData) => Promise<ResultadoDoPedido>;
};

const L = LIMITES_DO_PEDIDO;

/**
 * O formulário do pedido pelo link público (09/11/2026).
 *
 * `onSubmit` com `preventDefault`, e não `action`, como a ficha "Quero ser
 * cliente": com `action` o React limpa o formulário ao terminar, e quem errou
 * o telefone perderia a mensagem que escreveu.
 */
export function FormularioDoPedido({ slug, assuntoId, carimbo, escritorio, ajudaDaMensagem, prazo, action }: Props) {
  const [erro, setErro] = useState<{ texto: string; campo?: CampoDoPedido } | null>(null);
  const [enviado, setEnviado] = useState<{ numero: number | null } | null>(null);
  const [pendente, startTransition] = useTransition();

  if (enviado) return <PedidoRecebido numero={enviado.numero} escritorio={escritorio} prazo={prazo} />;

  const erroDo = (campo: CampoDoPedido) => (erro?.campo === campo ? erro.texto : undefined);

  return (
    <Card className="p-5 sm:p-6">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          dados.set("carimbo", carimbo);
          dados.set("slug", slug);
          dados.set("assunto", assuntoId);
          startTransition(async () => {
            try {
              const r = await action(dados);
              if (r.ok) {
                setErro(null);
                setEnviado({ numero: r.numero });
              } else {
                setErro({ texto: r.erro, campo: r.campo });
                // Leva o cursor ao campo do problema — no celular ele pode estar fora da tela.
                if (r.campo) document.getElementById(`pedido-${r.campo}`)?.focus();
              }
            } catch {
              setErro({ texto: "Não foi possível enviar agora. Confira a sua conexão e tente de novo." });
            }
          });
        }}
      >
        <CampoForm label="Nome completo" htmlFor="pedido-nome" required error={erroDo("nome")}>
          <Input id="pedido-nome" name="nome" autoComplete="name" maxLength={L.nome} required error={!!erroDo("nome")} />
        </CampoForm>

        <CampoForm label="E-mail" htmlFor="pedido-email" required error={erroDo("email")}>
          <Input
            id="pedido-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={L.email}
            required
            error={!!erroDo("email")}
          />
        </CampoForm>

        <CampoForm label="Telefone ou WhatsApp" htmlFor="pedido-telefone" required error={erroDo("telefone")}>
          <Input
            id="pedido-telefone"
            name="telefone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(41) 99999-9999"
            maxLength={L.telefone}
            required
            error={!!erroDo("telefone")}
          />
        </CampoForm>

        <CampoForm
          label="Nome da empresa"
          htmlFor="pedido-empresa"
          required
          helper="Se a empresa ainda vai ser aberta, o nome que você pretende dar."
          error={erroDo("empresa")}
        >
          <Input id="pedido-empresa" name="empresa" autoComplete="organization" maxLength={L.empresa} required error={!!erroDo("empresa")} />
        </CampoForm>

        <CampoForm label="CPF ou CNPJ" htmlFor="pedido-documento" helper="Opcional." error={erroDo("documento")}>
          <Input id="pedido-documento" name="documento" inputMode="numeric" maxLength={L.documento} error={!!erroDo("documento")} />
        </CampoForm>

        <CampoForm
          label="O que você precisa"
          htmlFor="pedido-mensagem"
          required
          helper={ajudaDaMensagem ?? "Conte em poucas palavras. A equipe completa com você no contato."}
          error={erroDo("mensagem")}
        >
          <Textarea id="pedido-mensagem" name="mensagem" rows={5} maxLength={L.mensagem} required error={!!erroDo("mensagem")} />
        </CampoForm>

        {/* Campo-armadilha, como no portal de vagas e na ficha: fora da tela (e
            não `display: none`, que parte dos robôs ignora), fora da tabulação
            e escondido do leitor de tela — nenhuma pessoa cai nele. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden">
          <label htmlFor="pedido-website">Site</label>
          <Input id="pedido-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="flex flex-col gap-1">
          <Checkbox
            id="pedido-aceite"
            name="aceite"
            value="1"
            aria-invalid={erroDo("aceite") ? true : undefined}
            aria-describedby={erroDo("aceite") ? "pedido-aceite-erro" : undefined}
            label={
              <>
                Autorizo {escritorio} a usar estes dados só para responder a este pedido. Veja a{" "}
                <Link href="/portal/privacidade" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                  política de privacidade
                </Link>
                .
              </>
            }
          />
          {erroDo("aceite") && (
            <p id="pedido-aceite-erro" className="pl-[26px] text-helper font-medium text-danger">
              {erroDo("aceite")}
            </p>
          )}
        </div>

        {erro && !erro.campo && <Aviso>{erro.texto}</Aviso>}

        <Button type="submit" size="lg" loading={pendente} loadingLabel="Enviando…" className="w-full justify-center">
          Enviar pedido
        </Button>
      </form>
    </Card>
  );
}

/**
 * A confirmação: o número do pedido em destaque — é o que a pessoa cita ao
 * falar com o escritório — e o que acontece agora. Sem número quando o envio
 * foi tratado como robô (nada foi gravado; ver `enviarPedidoPeloLink`).
 */
function PedidoRecebido({ numero, escritorio, prazo }: { numero: number | null; escritorio: string; prazo: string }) {
  const titulo = useRef<HTMLHeadingElement>(null);

  // O formulário some e a confirmação entra no lugar: o foco vai para ela
  // (o leitor de tela anuncia) e a página volta ao topo, onde ela está no celular.
  useEffect(() => {
    titulo.current?.focus();
    titulo.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <Card className="p-6 sm:p-8 text-center">
      <span aria-hidden className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-success/10 text-success-fg">
        <CheckCircle2 size={24} />
      </span>
      <h2 ref={titulo} tabIndex={-1} className="text-fs-6 font-semibold text-fg outline-none">
        Pedido recebido
      </h2>
      {numero !== null && (
        <p className="mt-4">
          <span className="block text-ui text-fg-muted">Número do pedido</span>
          <span className="block text-fs-9 font-semibold leading-tight text-fg tabular-nums">nº {numero}</span>
        </p>
      )}
      <p className="mx-auto mt-4 max-w-[44ch] text-body text-fg-secondary leading-relaxed">
        A equipe de {escritorio} vai entrar em contato pelo telefone ou e-mail que você informou, em até {prazo}.
        {numero !== null && " Se falar com o escritório antes disso, cite o número do pedido."}
      </p>
    </Card>
  );
}
