"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { useToast } from "@/components/ui/Toast";
import {
  excluirDocumentoAction,
  excluirFechamentoAction,
  executarAnaliseAction,
  marcarDocumentoAction,
  salvarToleranciaAction,
} from "@/app/(app)/revisao-contabil/actions";

// Os botões pequenos da Revisão do fechamento: cada um chama uma ação e
// atualiza a tela. As ações devolvem `{ ok }` ou `{ error }`; o botão de
// confirmar quer só o erro.
const soErro = (r: { error: string } | { ok: true }) => ("error" in r ? r : null);

/** "Na análise": desligado, o documento fica guardado mas não entra na próxima execução. */
export function DocumentoNaAnalise({ fechamentoId, documentoId, ativo, nome, podeAgir }: { fechamentoId: string; documentoId: string; ativo: boolean; nome: string; podeAgir: boolean }) {
  const [ligado, setLigado] = useState(ativo);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Switch
      checked={ligado}
      disabled={!podeAgir || pendente}
      size="sm"
      aria-label={`Usar ${nome} na análise`}
      onCheckedChange={(v) => {
        setLigado(v);
        startTransition(async () => {
          const r = await marcarDocumentoAction(fechamentoId, documentoId, v);
          if ("error" in r) {
            setLigado(!v);
            toast.error(r.error);
          } else router.refresh();
        });
      }}
    />
  );
}

export function ExcluirDocumento({ fechamentoId, documentoId, nome }: { fechamentoId: string; documentoId: string; nome: string }) {
  return (
    <ConfirmActionButton
      action={async () => soErro(await excluirDocumentoAction(fechamentoId, documentoId))}
      label="Excluir"
      title="Excluir o documento?"
      description={`${nome} sai do fechamento, com o arquivo e as correções de leitura dele. As execuções já feitas continuam no histórico.`}
      confirmLabel="Excluir"
      successMessage="Documento excluído."
      destructive
      variant="ghost"
      size="xs"
    />
  );
}

export function ExcluirFechamento({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  return (
    <ConfirmActionButton
      action={async () => {
        const r = await excluirFechamentoAction(id);
        if ("error" in r) return r;
        router.push("/revisao-contabil");
        return null;
      }}
      label="Excluir fechamento"
      title="Excluir o fechamento?"
      description={`${nome}: os documentos, os arquivos, as análises e o acompanhamento dos achados saem juntos. Não dá para desfazer.`}
      confirmLabel="Excluir"
      successMessage="Fechamento excluído."
      destructive
      variant="danger"
      size="sm"
    />
  );
}

export function ExecutarAnalise({ fechamentoId, documentos, valida }: { fechamentoId: string; documentos: number; valida: boolean }) {
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={valida ? "secondary" : "primary"}
      disabled={documentos === 0 || pendente}
      loading={pendente}
      loadingLabel="Analisando…"
      onClick={() =>
        startTransition(async () => {
          const r = await executarAnaliseAction(fechamentoId);
          if ("error" in r) toast.error(r.error);
          else {
            toast.success(r.achados === 1 ? "Análise concluída: 1 achado." : `Análise concluída: ${r.achados} achados.`);
            router.refresh();
          }
        })
      }
    >
      <Play size={14} aria-hidden /> {valida ? "Executar de novo" : "Executar análise"}
    </Button>
  );
}

/** A tolerância das conferências, em reais. Mudar invalida a análise feita. */
export function Tolerancia({ fechamentoId, centavos, podeAgir }: { fechamentoId: string; centavos: number; podeAgir: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const id = useId();
  const reais = Number(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      action={(form) => {
        setErro(null);
        startTransition(async () => {
          const r = await salvarToleranciaAction(fechamentoId, String(form.get("tolerancia") ?? ""));
          if ("error" in r) setErro(r.error);
          else {
            toast.success("Tolerância salva. Execute a análise de novo.");
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor={id} className="flex flex-col gap-1 text-helper text-fg-secondary">
        Tolerância das conferências
        <Input id={id} name="tolerancia" prefix="R$" inputMode="decimal" defaultValue={reais} className="w-32" disabled={!podeAgir} compact />
      </label>
      {podeAgir && (
        <Button type="submit" variant="secondary" size="sm" loading={pendente} disabled={pendente}>
          Salvar
        </Button>
      )}
      {erro && (
        <p role="alert" className="w-full text-helper text-danger">
          {erro}
        </p>
      )}
    </form>
  );
}
