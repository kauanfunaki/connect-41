"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, CircleX, Hourglass, Play, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { Modal } from "@/components/ui/Modal";
import { ItemDoMenu } from "@/components/ui/Popover";
import { Textarea } from "@/components/ui/Textarea";
import type { AcaoDeSituacao, StatusDoProcesso } from "@/lib/societario/processo";
import type { ProcessoState } from "@/app/(app)/processos/actions";
import { Aviso } from "@/components/ui/Aviso";

/** Pausam o processo: ficam à vista. */
type Pausa = "aguardar_cliente" | "suspender";
/** Encerram o processo sem conclusão: ficam no menu ⋯, com confirmação. */
type Encerramento = "indeferir" | "cancelar";

const MIN_MOTIVO = 3;

// Rótulos com verbo (escolha do Kauan na página de decisões, 08/10/2026 —
// 11A): "Aguardando cliente" e "Indeferido pelo órgão" descreviam estados, não
// ações, ao lado de "Suspender" e "Cancelar". Moram aqui, e não no
// `ROTULO_DA_ACAO` de lib/societario/processo.ts, porque esta é a única tela
// que os mostra. A ação gravada e a server action não mudaram.
const ROTULO: Record<AcaoDeSituacao, string> = {
  aguardar_cliente: "Esperar o cliente",
  suspender: "Suspender",
  retomar: "Retomar",
  indeferir: "Indeferir",
  cancelar: "Cancelar",
};

const PAUSA: Record<Pausa, { titulo: string; texto: string; exemplo: string }> = {
  aguardar_cliente: {
    titulo: "Esperar o cliente",
    texto: "O processo sai da frente da fila até alguém retomar. O cliente vê o motivo no portal.",
    exemplo: "Ex.: contrato social assinado pelos três sócios",
  },
  suspender: {
    titulo: "Suspender o processo",
    texto: "Parado sem previsão de volta. O cliente vê o motivo no portal.",
    exemplo: "Ex.: cliente pediu para esperar a venda do imóvel",
  },
};

const ENCERRAMENTO: Record<Encerramento, { titulo: string; texto: string; confirmar: string; exemplo: string }> = {
  indeferir: {
    titulo: "Indeferir o processo?",
    texto:
      "Use quando o órgão negou em definitivo. O processo é encerrado sem conclusão e o cliente vê o motivo no portal. Dá para retomar se foi engano.",
    confirmar: "Indeferir",
    exemplo: "Ex.: viabilidade negada — atividade não permitida no zoneamento",
  },
  cancelar: {
    titulo: "Cancelar o processo?",
    texto:
      "O processo é encerrado sem conclusão e o cliente vê o motivo no portal. Dá para retomar se foi engano.",
    confirmar: "Cancelar o processo",
    exemplo: "Ex.: cliente desistiu da abertura",
  },
};

const ICONE: Record<AcaoDeSituacao, React.ReactNode> = {
  aguardar_cliente: <Hourglass size={14} />,
  suspender: <CirclePause size={14} />,
  retomar: <Play size={14} />,
  indeferir: <Ban size={14} />,
  cancelar: <CircleX size={14} />,
};

/** As ações que fazem sentido a partir do status atual — as mesmas que `transicaoDeSituacao` aceita. */
function acoesPara(status: StatusDoProcesso): AcaoDeSituacao[] {
  if (status === "CONCLUIDO") return [];
  if (status === "CANCELADO" || status === "INDEFERIDO") return ["retomar"];
  const pausado = status === "AGUARDANDO_CLIENTE" || status === "SUSPENSO";
  return [
    ...(pausado ? (["retomar"] as const) : []),
    ...(status !== "AGUARDANDO_CLIENTE" ? (["aguardar_cliente"] as const) : []),
    ...(status !== "SUSPENSO" ? (["suspender"] as const) : []),
    "indeferir",
    "cancelar",
  ];
}

const ehEncerramento = (a: AcaoDeSituacao): a is Encerramento => a === "indeferir" || a === "cancelar";

/**
 * Pausar, encerrar sem conclusão ou retomar o processo. Toda ação menos
 * "retomar" pede motivo, que o cliente também lê no portal — por isso o
 * exemplo em cada janela é escrito para ele entender.
 *
 * À vista ficam só as que pausam ou retomam; as duas que encerram ("Indeferir"
 * e "Cancelar") vão para o menu ⋯, em vermelho, e abrem a confirmação
 * destrutiva com o motivo dentro (escolha do Kauan na página de decisões,
 * 08/10/2026 — 11A). Tinham o mesmo peso de "Aguardando cliente", que só pausa.
 */
export function SituacaoDoProcesso({
  processoId,
  status,
  mudar,
}: {
  processoId: string;
  status: StatusDoProcesso;
  mudar: (processId: string, acao: AcaoDeSituacao, motivo: string) => Promise<ProcessoState>;
}) {
  const router = useRouter();
  const [pausa, setPausa] = useState<Pausa | null>(null);
  const [encerramento, setEncerramento] = useState<Encerramento | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const motivoDoEncerramento = useRef<HTMLTextAreaElement>(null);

  // A confirmação põe o foco no botão de confirmar (o Enter é a ação
  // esperada). Aqui o esperado é escrever o motivo, que é obrigatório: o efeito
  // do pai roda depois do da confirmação e devolve o foco ao campo.
  useEffect(() => {
    if (encerramento) motivoDoEncerramento.current?.focus();
  }, [encerramento]);

  const acoes = acoesPara(status);
  if (acoes.length === 0) return null;

  const aVista = acoes.filter((a): a is Pausa | "retomar" => !ehEncerramento(a));
  const noMenu = acoes.filter(ehEncerramento);

  function fechar() {
    setPausa(null);
    setEncerramento(null);
    setMotivo("");
    setErro(null);
  }

  function executar(a: AcaoDeSituacao, texto: string) {
    setErro(null);
    startTransition(async () => {
      const r = await mudar(processoId, a, texto);
      if (r?.error) setErro(r.error);
      else {
        fechar();
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {/* `sm` (h-8): é a barra de ações do cabeçalho do processo, no tamanho
          das barras de ferramenta do resto do app. O ⋯ em `md` (32px), a
          altura do botão `sm` ao lado. */}
      <div className="flex flex-wrap items-center gap-2">
        {aVista.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === "retomar" ? "primary" : "secondary"}
            disabled={pendente}
            loading={a === "retomar" && pendente}
            loadingLabel="Retomando…"
            onClick={() => {
              if (a === "retomar") executar("retomar", "");
              else {
                setErro(null);
                setPausa(a);
              }
            }}
          >
            {ICONE[a]} {ROTULO[a]}
          </Button>
        ))}
        {noMenu.length > 0 && (
          <MenuDeMaisAcoes rotulo="Mais ações do processo" size="md" align="left" width={200}>
            {({ close }) => (
              <div className="flex flex-col">
                {noMenu.map((a) => (
                  <ItemDoMenu
                    key={a}
                    danger
                    icone={ICONE[a]}
                    disabled={pendente}
                    onClick={() => {
                      close();
                      setErro(null);
                      setEncerramento(a);
                    }}
                  >
                    {ROTULO[a]}
                  </ItemDoMenu>
                ))}
              </div>
            )}
          </MenuDeMaisAcoes>
        )}
      </div>
      {/* Na caixa de erro do resto da página (07/10/2026) — era texto solto de 12px. */}
      {erro && !pausa && !encerramento && <Aviso>{erro}</Aviso>}

      <Modal open={pausa !== null} onClose={() => !pendente && fechar()} title={pausa ? PAUSA[pausa].titulo : undefined}>
        {pausa && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              executar(pausa, motivo);
            }}
          >
            <p className="text-[length:var(--fs-ui)] text-fg-secondary">{PAUSA[pausa].texto}</p>
            <CampoForm label="Motivo" htmlFor="motivo-da-situacao" required>
              <Textarea
                id="motivo-da-situacao"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder={PAUSA[pausa].exemplo}
                autoFocus
              />
            </CampoForm>
            {erro && <Aviso>{erro}</Aviso>}
            {/* "Voltar", e não "Cancelar": o processo tem a ação "Cancelar". */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="secondary" disabled={pendente} onClick={fechar}>
                Voltar
              </Button>
              <Button type="submit" disabled={motivo.trim().length < MIN_MOTIVO} loading={pendente}>
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* A confirmação do sistema, destrutiva, com o motivo dentro. "Voltar"
          no lugar de "Cancelar" pelo mesmo motivo da janela de pausa. */}
      <ConfirmDialog
        open={encerramento !== null}
        title={encerramento ? ENCERRAMENTO[encerramento].titulo : ""}
        description={encerramento ? ENCERRAMENTO[encerramento].texto : undefined}
        confirmLabel={encerramento ? ENCERRAMENTO[encerramento].confirmar : undefined}
        cancelLabel="Voltar"
        pendingLabel="Encerrando…"
        destructive
        pending={pendente}
        error={erro}
        onCancel={fechar}
        onConfirm={() => {
          if (!encerramento) return;
          // O mesmo mínimo que desabilita o "Confirmar" da pausa; a confirmação
          // não tem botão desabilitado, então avisa e volta ao campo.
          if (motivo.trim().length < MIN_MOTIVO) {
            setErro("Diga o motivo.");
            motivoDoEncerramento.current?.focus();
            return;
          }
          executar(encerramento, motivo);
        }}
      >
        {encerramento && (
          <CampoForm label="Motivo" htmlFor="motivo-do-encerramento" required>
            <Textarea
              ref={motivoDoEncerramento}
              id="motivo-do-encerramento"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder={ENCERRAMENTO[encerramento].exemplo}
            />
          </CampoForm>
        )}
      </ConfirmDialog>
    </div>
  );
}
