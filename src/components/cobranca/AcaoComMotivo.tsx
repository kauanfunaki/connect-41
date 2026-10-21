"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { FormFooter } from "@/components/ui/FormFooter";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { TAMANHO_MAXIMO_DO_MOTIVO } from "@/lib/financeiro/cobranca/regras";

type Decisao = {
  titulo: string;
  descricao: string;
  confirmar: string;
  motivoObrigatorio?: boolean;
  ajuda?: string;
  variante?: "secondary" | "danger";
  acao: (motivo: string) => Promise<{ error: string } | { ok: true }>;
};

/** Uma decisão que vai no "⋯": o rótulo vira item do menu. */
export type DecisaoNoMenu = Decisao & { rotulo: string };

/** A janela do motivo, a mesma para o botão à vista e para o item do "⋯". */
function JanelaDoMotivo({ decisao, aberto, onFechar }: { decisao: Decisao; aberto: boolean; onFechar: () => void }) {
  const { titulo, descricao, confirmar, motivoObrigatorio = false, ajuda, variante = "secondary", acao } = decisao;
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <Modal open={aberto} onClose={() => !pendente && onFechar()} title={titulo} maxWidth="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          startTransition(async () => {
            const r = await acao(motivo);
            if ("error" in r) setErro(r.error);
            else {
              onFechar();
              setMotivo("");
            }
          });
        }}
      >
        <p className="text-ui text-fg-secondary">{descricao}</p>
        <CampoForm label="Motivo" htmlFor="motivo-da-cobranca" required={motivoObrigatorio} helper={ajuda}>
          <Textarea
            id="motivo-da-cobranca"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={TAMANHO_MAXIMO_DO_MOTIVO}
            required={motivoObrigatorio}
          />
        </CampoForm>
        {/* "Voltar", e não "Cancelar": ao lado de "Desfazer acordo" ou
            "Baixar por perda", "Cancelar" se lê como mais uma decisão. */}
        <FormFooter
          pending={pendente}
          submitLabel={confirmar}
          submitVariant={variante === "danger" ? "danger" : "primary"}
          cancelLabel="Voltar"
          onCancel={onFechar}
          erro={erro}
        />
      </form>
    </Modal>
  );
}

/**
 * Uma decisão da cobrança que pede motivo: baixa por perda (obrigatório),
 * reverter perda, quebrar e desfazer acordo. A action chega por prop, com o id
 * já aplicado — a caixa é a mesma para as quatro.
 */
export function AcaoComMotivo({
  rotulo,
  tamanho = "xs",
  ...decisao
}: Decisao & {
  rotulo: React.ReactNode;
  /** `sm` quando divide a linha com outros botões `sm` — na ficha do título, ao lado de "Criar acordo". */
  tamanho?: "xs" | "sm";
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button variant={decisao.variante ?? "secondary"} size={tamanho} onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
      <JanelaDoMotivo decisao={decisao} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  );
}

/**
 * As decisões que encerram — baixar por perda, marcar o acordo como quebrado,
 * desfazer o acordo — no "⋯", em vermelho, com a mesma janela do motivo (regra
 * 11A, 15/10/2026). Ficavam à vista com o mesmo peso das outras ações. Sem
 * nenhuma decisão, não mostra nada.
 */
export function DecisoesNoMenu({
  decisoes,
  rotulo = "Mais ações",
  size = "sm",
}: {
  decisoes: DecisaoNoMenu[];
  rotulo?: string;
  /** `md` (32px) ao lado de botões `sm`. */
  size?: "sm" | "md";
}) {
  const [aberta, setAberta] = useState<number | null>(null);

  return (
    <>
      <MenuDeMaisAcoes rotulo={rotulo} size={size} align="right" width={220}>
        {({ close }) =>
          decisoes.map((d, i) => (
            <ItemDoMenu
              key={d.rotulo}
              danger={d.variante === "danger"}
              onClick={() => {
                close();
                setAberta(i);
              }}
            >
              {d.rotulo}
            </ItemDoMenu>
          ))
        }
      </MenuDeMaisAcoes>
      {decisoes.map((d, i) => (
        <JanelaDoMotivo key={d.rotulo} decisao={d} aberto={aberta === i} onFechar={() => setAberta(null)} />
      ))}
    </>
  );
}
