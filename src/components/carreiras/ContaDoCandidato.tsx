"use client";

// Peças interativas da conta do candidato (portal de vagas). Os dados chegam
// prontos da página; aqui só os formulários e as confirmações em duas etapas —
// sem `confirm()` do navegador, que some em alguns celulares.

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
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

function Aviso({ r }: { r: RespostaDaConta }) {
  if (!r) return null;
  if ("erro" in r) return <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{r.erro}</p>;
  if (r.mensagem) return <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">{r.mensagem}</p>;
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
      <Aviso r={estado} />
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
      <Aviso r={estado} />
    </div>
  );
}

export function Desistir({ slug, candidaturaId, vaga }: { slug: string; candidaturaId: string; vaga: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<RespostaDaConta>(null);
  const [pendente, start] = useTransition();
  if (!confirmando) {
    return (
      <Button variant="linkMuted" size="xs" onClick={() => setConfirmando(true)}>
        Desistir desta vaga
      </Button>
    );
  }
  return (
    <div className="rounded-md border border-warning/30 bg-warning-bg px-3 py-2 space-y-2">
      <p className="text-[12.5px] text-fg">Desistir de &ldquo;{vaga}&rdquo;? A equipe é avisada, e a candidatura não volta.</p>
      <div className="flex items-center gap-2">
        <Button size="xs" variant="secondary" disabled={pendente} onClick={() => start(async () => setEstado(await desistir(slug, candidaturaId)))}>
          {pendente ? "Enviando…" : "Sim, desistir"}
        </Button>
        <Button size="xs" variant="linkMuted" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
      <Aviso r={estado} />
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
      <div className="space-y-1.5">
        <label htmlFor="resume" className="block text-[length:var(--fs-label)] font-medium text-fg">
          Currículo novo (PDF, opcional)
        </label>
        <FileDropzoneField id="resume" name="resume" accept=".pdf" maxSizeMb={MAX_MB_DO_CURRICULO} />
        <p className="text-[11px] text-fg-muted">Vale para as candidaturas em andamento.</p>
      </div>
      <Button type="submit" variant="secondary" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar"}
      </Button>
      <Aviso r={estado} />
    </form>
  );
}

export function PedirExclusao({ slug, pedidoEm }: { slug: string; pedidoEm: string | null }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<RespostaDaConta>(null);
  const [pendente, start] = useTransition();
  if (pedidoEm) {
    return <p className="text-[12.5px] text-fg-secondary">Você pediu a exclusão dos seus dados em {pedidoEm}. A equipe responsável vai tratar o pedido.</p>;
  }
  if (!confirmando) {
    return (
      <Button variant="linkMuted" size="xs" onClick={() => setConfirmando(true)}>
        Pedir a exclusão dos meus dados
      </Button>
    );
  }
  return (
    <div className="rounded-md border border-border px-3 py-2 space-y-2">
      <p className="text-[12.5px] text-fg">
        A equipe recebe o pedido e exclui seus dados pessoais, a não ser que haja obrigação legal de guardá-los (por exemplo, se você
        for contratado). Enquanto o pedido é tratado, suas candidaturas continuam como estão.
      </p>
      <div className="flex items-center gap-2">
        <Button size="xs" variant="secondary" disabled={pendente} onClick={() => start(async () => setEstado(await pedirExclusao(slug)))}>
          {pendente ? "Enviando…" : "Confirmar pedido"}
        </Button>
        <Button size="xs" variant="linkMuted" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
      <Aviso r={estado} />
    </div>
  );
}
