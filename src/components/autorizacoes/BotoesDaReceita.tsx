"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { abrirMensagemAction, pedirSituacaoFiscalAction, verMensagemAction } from "@/app/(app)/autorizacoes/receita-actions";
import type { MensagemAberta } from "@/lib/serpro/acompanhamento";
import { formatInstantDateTime } from "@/lib/format";

/** Pede o relatório de situação fiscal: uma emissão, cobrada. O PDF vai para a pasta Fiscal. */
export function PedirSituacaoFiscal({ companyId, desabilitado }: { companyId: string; desabilitado: boolean }) {
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pendente}
      disabled={desabilitado}
      onClick={() =>
        startTransition(async () => {
          const r = await pedirSituacaoFiscalAction(companyId);
          if (r.ok) toast.success(r.texto);
          else toast.error(r.erro);
          router.refresh();
        })
      }
    >
      <FileSearch size={14} /> Pedir situação fiscal
    </Button>
  );
}

/** O corpo de uma mensagem aberta. Já vem limpo pelo sanitize, na gravação e na leitura. */
function JanelaDaMensagem({ mensagem, onClose }: { mensagem: MensagemAberta | null; onClose: () => void }) {
  return (
    <Modal open={!!mensagem} onClose={onClose} title={mensagem?.assunto ?? ""} maxWidth="max-w-2xl">
      {mensagem && (
        <div className="flex flex-col gap-3">
          <p className="text-micro text-fg-muted">
            Aberta pelo Connect em {formatInstantDateTime(new Date(mensagem.abertaEm))}
            {mensagem.abertaPor ? ` por ${mensagem.abertaPor}` : ""} — a ciência da intimação conta desse dia.
          </p>
          <div
            className="text-ui text-fg leading-relaxed space-y-2 max-h-[60vh] overflow-y-auto break-words [&_a]:text-brand [&_a]:underline [&_table]:w-full"
            dangerouslySetInnerHTML={{ __html: mensagem.corpo }}
          />
        </div>
      )}
    </Modal>
  );
}

/**
 * Abre a mensagem da Caixa Postal. Abrir DÁ CIÊNCIA da intimação: o diálogo
 * diz isso antes, e só a coordenação do Fiscal vê o botão (decisão do Kauan,
 * 20/10/2026). Aberta, ela é lida do banco, sem nova chamada.
 */
export function AbrirMensagem({ id }: { id: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<MensagemAberta | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="xs" variant="secondary" onClick={() => setConfirmando(true)}>
        <MailOpen size={14} /> Abrir
      </Button>
      <ConfirmDialog
        open={confirmando}
        title="Abrir dá ciência da intimação"
        description="Abrir esta mensagem pelo Connect conta como ciência (Decreto 70.235/1972, art. 23, § 2º, III): o prazo de resposta começa a contar hoje, mesmo que ninguém leia depois. Quem abriu fica registrado. A consulta é cobrada pelo Serpro."
        confirmLabel="Abrir e dar ciência"
        pendingLabel="Abrindo…"
        destructive
        pending={pendente}
        error={erro}
        onCancel={() => {
          setConfirmando(false);
          setErro(null);
        }}
        onConfirm={() =>
          startTransition(async () => {
            const r = await abrirMensagemAction(id, true);
            if (!r.ok) {
              setErro(r.erro);
              return;
            }
            setConfirmando(false);
            setAberta(r.mensagem);
            router.refresh();
          })
        }
      />
      <JanelaDaMensagem mensagem={aberta} onClose={() => setAberta(null)} />
    </>
  );
}

/** Lê de novo uma mensagem já aberta, do banco: não chama o Serpro nem dá ciência de novo. */
export function VerMensagem({ id }: { id: string }) {
  const [aberta, setAberta] = useState<MensagemAberta | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        loading={pendente}
        onClick={() =>
          startTransition(async () => {
            const r = await verMensagemAction(id);
            if (r.ok) setAberta(r.mensagem);
            else toast.error(r.erro);
          })
        }
      >
        <MailOpen size={14} /> Ver
      </Button>
      <JanelaDaMensagem mensagem={aberta} onClose={() => setAberta(null)} />
    </>
  );
}
