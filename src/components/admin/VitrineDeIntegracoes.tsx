"use client";

import { useActionState, useState } from "react";
import { ChevronDown, Plug, Bot, RefreshCw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { salvarConexao, type ConexaoState } from "@/app/(app)/admin/integracoes/conexao-actions";
import type { IntegracaoNaTela } from "@/lib/integracoes/data";
import type { Saude } from "@/lib/integracoes/execucao";

const SAUDE_LABEL: Record<Saude, string> = {
  nunca_rodou: "Nunca rodou",
  ok: "Em dia",
  com_erro: "Com erro",
  desligada: "Desligada",
  parada: "Parada",
};

// `parada` é warning e não info: é o silêncio — ligada, sem erro, e sem rodar
// há tempo demais. Foi assim que o SPED passou três dias parecendo saudável.
const SAUDE_VARIANTE: Record<Saude, "success" | "warning" | "danger" | "info"> = {
  nunca_rodou: "info",
  ok: "success",
  com_erro: "danger",
  desligada: "info",
  parada: "warning",
};

const ICONE = {
  SYNC: RefreshCw,
  ROBO: Bot,
  API: Zap,
} as const;

const NATUREZA_LABEL = {
  SYNC: "varre e traz dado",
  ROBO: "opera um site no seu lugar",
  API: "chamada pontual",
} as const;

export function VitrineDeIntegracoes({ integracoes }: { integracoes: IntegracaoNaTela[] }) {
  if (integracoes.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {integracoes.map((i) => (
        <CartaoDaIntegracao key={`${i.code}:${i.instanceKey}`} integracao={i} />
      ))}
    </div>
  );
}

function CartaoDaIntegracao({ integracao: i }: { integracao: IntegracaoNaTela }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState<ConexaoState, FormData>(salvarConexao, null);
  const Icone = ICONE[i.natureza];

  return (
    <Card as="section" className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Icone size={15} className="text-fg-muted shrink-0" />
            <h3 className="text-[15px] font-semibold text-fg">{i.label}</h3>
            {i.conectada ? (
              <Badge variant={SAUDE_VARIANTE[i.saude]}>{SAUDE_LABEL[i.saude]}</Badge>
            ) : (
              <span className="text-[11px] text-fg-muted border border-border rounded px-1.5 py-0.5">
                não conectada
              </span>
            )}
          </div>
          <p className="text-[13px] text-fg-secondary mt-1 max-w-[62ch]">{i.description}</p>
          <p className="text-[11px] text-fg-muted mt-1">
            {i.vendor} · {NATUREZA_LABEL[i.natureza]}
            {i.sectorCode && ` · setor ${i.sectorCode}`}
            {i.nomeDoCliente && ` · ${i.nomeDoCliente}`}
          </p>
        </div>
      </div>

      {/* A configuração incompleta é o estado mais comum e o menos explicado:
          "não funciona" sem dizer qual campo falta faz a pessoa tentar de novo
          igual. */}
      {i.conectada && i.faltando.length > 0 && (
        <p className="text-[12px] text-warning bg-warning-bg border border-warning/30 rounded-md px-3 py-2">
          Falta preencher: {i.faltando.join(", ")}.
        </p>
      )}

      {i.lastError && (
        <p className="text-[12px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 break-words">
          Último erro: {i.lastError}
        </p>
      )}

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1 text-[13px] text-brand hover:underline self-start"
        aria-expanded={aberto}
      >
        <ChevronDown
          size={14}
          className={aberto ? "rotate-180 transition-transform" : "transition-transform"}
        />
        {aberto ? "Fechar" : i.conectada ? "Configurar" : "Conectar"}
      </button>

      {aberto && (
        <form action={formAction} className="border-t border-border-soft pt-3 flex flex-col gap-3">
          <input type="hidden" name="code" value={i.code} />
          <input type="hidden" name="instanceKey" value={i.instanceKey} />

          {state && "error" in state && (
            <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
              {state.error}
            </p>
          )}
          {state && "success" in state && (
            <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">
              Conexão salva.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {i.campos.map((c) => {
              const guardado = i.segredosGuardados.includes(c.name);
              return (
                <CampoForm
                  key={c.name}
                  label={c.label}
                  htmlFor={`${i.code}-${c.name}`}
                  required={c.required && !guardado}
                  helper={
                    // Segredo guardado nunca volta para a tela. Dizer "preenchido"
                    // é o que impede alguém de reescrevê-lo sem precisar — e é o
                    // que faz "deixar em branco" significar "mantenha".
                    guardado ? `Guardado. Deixe em branco para manter. ${c.help ?? ""}` : c.help
                  }
                >
                  <Input
                    id={`${i.code}-${c.name}`}
                    name={c.name}
                    type={c.type === "secret" ? "password" : c.type === "url" ? "url" : "text"}
                    autoComplete="off"
                    defaultValue={i.valores[c.name] ?? ""}
                    placeholder={guardado ? "•••• (preenchido)" : ""}
                  />
                </CampoForm>
              );
            })}
          </div>

          <Checkbox
            id={`${i.code}-enabled`}
            name="enabled"
            defaultChecked={i.enabled}
            label="Conexão ligada"
          />
          <p className="text-[11px] text-fg-muted -mt-1">
            {/* Integração nunca nasce ligada: ligar significa começar a falar
                com sistema de terceiro usando credencial de alguém. */}
            Desligada, nada é enviado nem buscado. Ligar é ato deliberado.
          </p>

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando…" : i.conectada ? "Salvar" : "Conectar"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function VitrineVazia() {
  return (
    <Card className="p-6 text-center">
      <Plug size={22} className="mx-auto text-fg-muted mb-2" />
      <p className="text-[13px] text-fg-secondary">
        Nenhuma integração no catálogo ainda.
      </p>
    </Card>
  );
}
