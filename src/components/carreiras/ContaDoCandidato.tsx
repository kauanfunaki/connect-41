"use client";

// Peças interativas da conta do candidato (portal de vagas). Os dados chegam
// prontos da página; aqui só os formulários e as confirmações — sem
// `confirm()` do navegador, que some em alguns celulares. Desde 30/09 as
// ações são botões com caixa — eram texto cinza, e "botão não é link".

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { MAX_MB_DO_CURRICULO } from "@/lib/curriculo";
import {
  atualizarDados,
  desistir,
  entrarComLink,
  pedirExclusao,
  pedirLink,
  type RespostaDaConta,
} from "@/app/carreiras/[slug]/minha-conta/actions";
import { Aviso } from "@/components/ui/Aviso";

// O retorno de uma ação da conta: erro ou confirmação.
function RetornoDaConta({ r }: { r: RespostaDaConta }) {
  if (!r) return null;
  if ("erro" in r) return <Aviso>{r.erro}</Aviso>;
  if (r.mensagem) return <Aviso tom="sucesso">{r.mensagem}</Aviso>;
  return null;
}

export function PedirAcesso({ slug }: { slug: string }) {
  const [estado, acao, pendente] = useActionState(pedirLink.bind(null, slug), null);
  const enviado = estado && "ok" in estado;
  return (
    <form action={acao} className="space-y-3">
      <CampoForm label="E-mail usado na inscrição" htmlFor="email" required>
        <Input id="email" name="email" type="email" required maxLength={120} autoComplete="email" />
      </CampoForm>
      <Button type="submit" variant="primary" className="w-full" disabled={pendente}>
        {pendente ? "Enviando…" : enviado ? "Enviar de novo" : "Receber link de acesso"}
      </Button>
      <RetornoDaConta r={estado} />
    </form>
  );
}

export function Entrar({ slug, token }: { slug: string; token: string }) {
  const [estado, setEstado] = useState<RespostaDaConta>(null);
  const [pendente, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button variant="primary" className="w-full" disabled={pendente} onClick={() => start(async () => setEstado(await entrarComLink(slug, token)))}>
        {pendente ? "Entrando…" : "Entrar e ver minhas candidaturas"}
      </Button>
      <RetornoDaConta r={estado} />
    </div>
  );
}

// "Desistir" e "Pedir a exclusão" confirmam na janela de confirmação do
// Connect, com o botão de encerrar em vermelho (15/10/2026). Confirmavam numa
// caixa dentro do próprio cartão, com o "Sim" no botão neutro. A janela não
// depende de nada do app da equipe, e vale nas duas contas (a genérica e a do
// 41 Carreiras, que usa estas mesmas peças). O erro fica na janela; o retorno
// de sucesso, embaixo do botão.
export function Desistir({ slug, candidaturaId, vaga }: { slug: string; candidaturaId: string; vaga: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<RespostaDaConta>(null);
  const [pendente, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="xs"
        onClick={() => {
          setEstado(null);
          setConfirmando(true);
        }}
      >
        Desistir desta vaga
      </Button>
      <ConfirmDialog
        open={confirmando}
        title={`Desistir de “${vaga}”?`}
        description="A equipe é avisada, e a candidatura não volta."
        confirmLabel="Sim, desistir"
        pendingLabel="Enviando…"
        destructive
        pending={pendente}
        error={estado && "erro" in estado ? estado.erro : null}
        onConfirm={() =>
          start(async () => {
            const r = await desistir(slug, candidaturaId);
            setEstado(r);
            if (r && !("erro" in r)) setConfirmando(false);
          })
        }
        onCancel={() => setConfirmando(false)}
      />
      {!confirmando && estado && !("erro" in estado) && <RetornoDaConta r={estado} />}
    </div>
  );
}

export function AtualizarDados({ slug, telefone }: { slug: string; telefone: string | null }) {
  const [estado, acao, pendente] = useActionState(atualizarDados.bind(null, slug), null);
  return (
    <form action={acao} className="space-y-3">
      <CampoForm label="Telefone / WhatsApp" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" maxLength={30} defaultValue={telefone ?? ""} />
      </CampoForm>
      <CampoForm label="Currículo novo (PDF, opcional)" htmlFor="resume" helper="Vale para as candidaturas em andamento.">
        <FileDropzoneField id="resume" name="resume" accept=".pdf" maxSizeMb={MAX_MB_DO_CURRICULO} />
      </CampoForm>
      {/* Rodapé do cartão, à direita como nos formulários do app; no celular
          o botão ocupa a largura toda. */}
      <div className="flex justify-end pt-1">
        <Button type="submit" variant="secondary" disabled={pendente} className="w-full sm:w-auto">
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      <RetornoDaConta r={estado} />
    </form>
  );
}

export function PedirExclusao({ slug, pedidoEm }: { slug: string; pedidoEm: string | null }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<RespostaDaConta>(null);
  const [pendente, start] = useTransition();
  if (pedidoEm) {
    return <p className="text-ui text-fg-secondary">Você pediu a exclusão dos seus dados em {pedidoEm}. A equipe responsável vai tratar o pedido.</p>;
  }
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="xs"
        onClick={() => {
          setEstado(null);
          setConfirmando(true);
        }}
      >
        Pedir a exclusão dos meus dados
      </Button>
      <ConfirmDialog
        open={confirmando}
        title="Pedir a exclusão dos seus dados?"
        description="A equipe recebe o pedido e exclui seus dados pessoais, a não ser que haja obrigação legal de guardá-los (por exemplo, se você for contratado). Enquanto o pedido é tratado, suas candidaturas continuam como estão."
        confirmLabel="Pedir a exclusão"
        pendingLabel="Enviando…"
        destructive
        largura="max-w-md"
        pending={pendente}
        error={estado && "erro" in estado ? estado.erro : null}
        onConfirm={() =>
          start(async () => {
            const r = await pedirExclusao(slug);
            setEstado(r);
            if (r && !("erro" in r)) setConfirmando(false);
          })
        }
        onCancel={() => setConfirmando(false)}
      />
      {!confirmando && estado && !("erro" in estado) && <RetornoDaConta r={estado} />}
    </div>
  );
}
