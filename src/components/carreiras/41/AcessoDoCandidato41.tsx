"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowRight, CircleAlert, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { entrarComLink, pedirLink, type RespostaDaConta } from "@/app/carreiras/[slug]/minha-conta/actions";

/**
 * "E-mail usado na inscrição" → link de acesso (15/10/2026). A resposta do
 * servidor é a MESMA com ou sem inscrição (`pedirLink`) — a tela só repete o
 * e-mail que a própria pessoa digitou, nunca diz se ele existe.
 */
export function PedirAcesso41({ slug, escuro = false, id = "email-acesso" }: { slug: string; escuro?: boolean; id?: string }) {
  const [estado, acao, pendente] = useActionState(pedirLink.bind(null, slug), null);
  const [email, setEmail] = useState("");
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const ok = estado && "ok" in estado;
  const erro = estado && "erro" in estado ? estado.erro : null;

  return (
    <form
      action={(dados) => {
        setEnviadoPara(email.trim());
        acao(dados);
      }}
    >
      <div className="t41-campo">
        <label htmlFor={id} className="t41-campo__rotulo" style={escuro ? { color: "var(--t41-noite)" } : undefined}>
          E-mail usado na inscrição
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Input
            id={id}
            name="email"
            type="email"
            required
            maxLength={120}
            autoComplete="email"
            inputMode="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="t41-entrada"
            style={{ flex: "1 1 220px", minWidth: 0 }}
            aria-describedby={erro ? `${id}-erro` : undefined}
            aria-invalid={erro ? true : undefined}
          />
          <button type="submit" className="t41-botao t41-botao--primario" disabled={pendente} style={{ flex: "0 0 auto" }}>
            {pendente ? "Enviando…" : ok ? "Enviar de novo" : "Receber link de acesso"}
            {!pendente && !ok && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div aria-live="polite">
        {erro && (
          <p id={`${id}-erro`} className="t41-alerta">
            <CircleAlert size={18} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
            {erro}
          </p>
        )}
        {ok && (
          <p className="t41-alerta t41-alerta--ok">
            <MailCheck size={18} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
            <span>
              {enviadoPara && (
                <>
                  Pedido feito para <strong>{enviadoPara}</strong>.{" "}
                </>
              )}
              {estado.mensagem}
            </span>
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * Onde o link do e-mail cai: um clique para entrar. Não entra sozinho —
 * leitor de e-mail corporativo abre os links para checar, e gastaria o link
 * de uso único (ver `entrar/page.tsx`).
 */
export function Entrar41({ slug, token }: { slug: string; token: string }) {
  const [estado, setEstado] = useState<RespostaDaConta>(null);
  const [pendente, iniciar] = useTransition();
  const erro = estado && "erro" in estado ? estado.erro : null;
  return (
    <div>
      <button
        type="button"
        className="t41-botao t41-botao--primario t41-botao--largo"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await entrarComLink(slug, token)))}
      >
        {pendente ? "Entrando…" : "Entrar e ver minhas candidaturas"}
        {!pendente && <ArrowRight size={17} aria-hidden="true" />}
      </button>
      <div aria-live="polite">
        {erro && (
          <p className="t41-alerta">
            <CircleAlert size={18} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
