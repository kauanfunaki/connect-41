"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { MAX_MENSAGEM_DA_FICHA, type CampoDaFicha } from "@/lib/leads/regras";
import type { ResultadoDaFichaDoPortal } from "@/app/(portal)/portal/quero-ser-cliente/actions";

type Props = {
  /** Carimbo de tempo assinado na hora em que a página foi montada (anti-robô). */
  carimbo: string;
  /** Nome do escritório que recebe a ficha — quem vai cuidar dos dados (LGPD). */
  escritorio: string;
  action: (form: FormData) => Promise<ResultadoDaFichaDoPortal>;
};

/**
 * A ficha "Quero ser cliente" (05/10/2026).
 *
 * `onSubmit` com `preventDefault`, e não `action`: com `action` o React limpa o
 * formulário ao terminar, e quem errou o telefone perderia tudo o que escreveu.
 */
export function FichaQueroSerCliente({ carimbo, escritorio, action }: Props) {
  const [erro, setErro] = useState<{ texto: string; campo?: CampoDaFicha } | null>(null);
  const [enviado, setEnviado] = useState<{ primeiroNome: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  if (enviado) {
    return (
      <Card className="p-6 text-center">
        <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={24} />
        </span>
        <h2 className="text-fs-6 font-semibold text-fg">Recebemos seus dados</h2>
        <p className="mt-2 text-body text-fg-secondary leading-relaxed">
          {enviado.primeiroNome ? `Obrigado, ${enviado.primeiroNome}. ` : "Obrigado. "}A equipe comercial de {escritorio} vai entrar em
          contato pelo e-mail ou WhatsApp que você informou.
        </p>
        <Button href="/portal/login" variant="secondary" className="mt-5">
          <ArrowLeft size={14} />
          Voltar para o login
        </Button>
      </Card>
    );
  }

  const erroDo = (campo: CampoDaFicha) => (erro?.campo === campo ? erro.texto : undefined);

  return (
    <Card className="p-6">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          dados.set("carimbo", carimbo);
          startTransition(async () => {
            try {
              const r = await action(dados);
              if (r.ok) {
                setErro(null);
                setEnviado({ primeiroNome: r.primeiroNome });
              } else {
                setErro({ texto: r.erro, campo: r.campo });
                // Leva o cursor ao campo do problema — no celular ele pode estar fora da tela.
                if (r.campo) document.getElementById(`ficha-${r.campo}`)?.focus();
              }
            } catch {
              setErro({ texto: "Não foi possível enviar agora. Confira a sua conexão e tente de novo." });
            }
          });
        }}
      >
        <CampoForm label="Seu nome" htmlFor="ficha-nome" required error={erroDo("nome")}>
          <Input id="ficha-nome" name="nome" autoComplete="name" maxLength={120} required error={!!erroDo("nome")} autoFocus />
        </CampoForm>

        <CampoForm label="E-mail" htmlFor="ficha-email" required error={erroDo("email")}>
          <Input id="ficha-email" name="email" type="email" autoComplete="email" maxLength={160} required error={!!erroDo("email")} />
        </CampoForm>

        <CampoForm label="Telefone ou WhatsApp" htmlFor="ficha-telefone" required error={erroDo("telefone")}>
          <Input
            id="ficha-telefone"
            name="telefone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(41) 99999-9999"
            maxLength={25}
            required
            error={!!erroDo("telefone")}
          />
        </CampoForm>

        <CampoForm label="Empresa" htmlFor="ficha-empresa" required error={erroDo("empresa")}>
          <Input id="ficha-empresa" name="empresa" autoComplete="organization" maxLength={160} required error={!!erroDo("empresa")} />
        </CampoForm>

        <CampoForm label="CNPJ" htmlFor="ficha-cnpj" helper="Opcional — se a empresa já existe." error={erroDo("cnpj")}>
          <Input
            id="ficha-cnpj"
            name="cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            maxLength={18}
            error={!!erroDo("cnpj")}
          />
        </CampoForm>

        <CampoForm label="O que você procura" htmlFor="ficha-mensagem" helper="Opcional." error={erroDo("mensagem")}>
          <Textarea
            id="ficha-mensagem"
            name="mensagem"
            rows={4}
            maxLength={MAX_MENSAGEM_DA_FICHA}
            placeholder="Ex.: abrir uma empresa, trocar de contador, terceirizar o financeiro…"
            error={!!erroDo("mensagem")}
          />
        </CampoForm>

        {/* Campo-armadilha, como no portal de vagas: fora da tela (e não
            `display: none`, que parte dos robôs ignora), fora da tabulação e
            escondido do leitor de tela — nenhuma pessoa cai nele. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden">
          <label htmlFor="ficha-website">Site</label>
          <Input id="ficha-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="flex flex-col gap-1">
          <Checkbox
            id="ficha-aceite"
            name="aceite"
            value="1"
            label={
              <>
                Li e aceito a{" "}
                <Link href="/portal/privacidade" target="_blank" className="text-brand hover:underline">
                  política de privacidade
                </Link>
                . Os meus dados vão para {escritorio}, só para entrar em contato comigo.
              </>
            }
          />
          {erroDo("aceite") && <p className="pl-[26px] text-helper font-medium text-danger">{erroDo("aceite")}</p>}
        </div>

        {/* O erro do formulário no `Aviso` (07/10/2026), como o login e a senha nova. */}
        {erro && !erro.campo && <Aviso>{erro.texto}</Aviso>}

        <Button type="submit" size="lg" loading={pendente} loadingLabel="Enviando…" className="w-full justify-center">
          Enviar
        </Button>

        <div className="text-center">
          <Button href="/portal/login" variant="ghost" size="sm">
            <ArrowLeft size={14} />
            Já sou cliente — voltar para o login
          </Button>
        </div>
      </form>
    </Card>
  );
}
