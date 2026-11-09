"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";

// Botões de ação do Contábil Core (Fase 2, 09/11/2026): a ação roda no servidor, o erro aparece na
// tela e a página recarrega os dados. Os dois casos são o botão direto (com confirmação opcional) e o
// que pede um motivo antes (desfazer uma importação, desfazer uma classificação).

type Retorno = { ok: true } | { error: string };

type BotaoProps = {
  rotulo: string;
  acao: () => Promise<Retorno>;
  sucesso: string;
  confirmar?: { titulo: string; texto: string; destrutivo?: boolean };
  variante?: "secondary" | "ghost" | "danger" | "link";
};

export function BotaoDeAcao({ rotulo, acao, sucesso, confirmar, variante = "secondary" }: BotaoProps) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function executar() {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if ("error" in r) {
        if (confirmar) setErro(r.error);
        else toast.error(r.error);
        return;
      }
      setAberto(false);
      toast.success(sucesso);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="xs" variant={variante} loading={pendente && !confirmar} onClick={() => (confirmar ? setAberto(true) : executar())}>
        {rotulo}
      </Button>
      {confirmar && (
        <ConfirmDialog
          open={aberto}
          title={confirmar.titulo}
          description={confirmar.texto}
          confirmLabel={rotulo}
          destructive={confirmar.destrutivo}
          pending={pendente}
          error={erro}
          onConfirm={executar}
          onCancel={() => setAberto(false)}
        />
      )}
    </>
  );
}

type MotivoProps = {
  rotulo: string;
  titulo: string;
  texto: string;
  acao: (motivo: string) => Promise<Retorno>;
  sucesso: string;
};

/** Ação que só roda com um motivo escrito: o motivo vai para o registro e para a auditoria. */
export function AcaoComMotivo({ rotulo, titulo, texto, acao, sucesso }: MotivoProps) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const campo = useId();

  function executar() {
    setErro(null);
    startTransition(async () => {
      const r = await acao(motivo);
      if ("error" in r) return setErro(r.error);
      setAberto(false);
      setMotivo("");
      toast.success(sucesso);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="xs" variant="danger" onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
      <ConfirmDialog
        open={aberto}
        title={titulo}
        description={texto}
        confirmLabel={rotulo}
        destructive
        pending={pendente}
        error={erro}
        confirmDisabled={motivo.trim().length < 3}
        onConfirm={executar}
        onCancel={() => setAberto(false)}
        largura="max-w-md"
      >
        <CampoForm label="Motivo" htmlFor={campo} required>
          <Input id={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} autoComplete="off" />
        </CampoForm>
      </ConfirmDialog>
    </>
  );
}
