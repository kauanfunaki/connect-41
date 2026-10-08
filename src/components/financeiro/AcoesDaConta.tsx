"use client";

import { useId, useState, useTransition } from "react";
import { Check, Undo2, CircleDollarSign, Send, FileText, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import type { AcaoDeContaState } from "@/lib/financeiro/acoes";
import type { SituacaoDaConta } from "@/lib/financeiro/contas";
import { FormFooter } from "@/components/ui/FormFooter";

type Acoes = {
  conferir: (entryId: string) => Promise<AcaoDeContaState>;
  pagar: (entryId: string, dataISO: string) => Promise<AcaoDeContaState>;
  desfazer: (entryId: string) => Promise<AcaoDeContaState>;
  /** Enviar para aprovação por alçada. Ausente quando o módulo está desligado ou a pessoa não atua nele. */
  enviarParaAprovacao?: (entryId: string) => Promise<{ error: string } | { ok: true; aviso?: string | null }>;
};

/**
 * As ações de uma conta: o que se faz nela (conferir, pagar) em botão, e o que
 * leva para fora dela num menu "⋯".
 *
 * Até 30/09 "ver nota", "abrir pendência" e "enviar p/ aprovação" eram texto
 * azul solto embaixo dos botões, e a baixa abria data e "Confirmar" dentro da
 * célula, empurrando o resto para fora da tabela. A conferência do Kauan
 * reprovou os dois: link não é botão, e a baixa agora abre num painel próprio.
 */
export function AcoesDaConta({
  entryId,
  situacao,
  status,
  hojeISO,
  acoes,
  aPagar,
  bloqueioDeBaixa = null,
  podeEnviar = false,
  notaHref = null,
  pendenciaHref = null,
  emColunas = false,
  comConferir = true,
}: {
  entryId: string;
  situacao: SituacaoDaConta;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  /** Hoje em São Paulo, calculado no servidor — o relógio do navegador pode estar em outro fuso. */
  hojeISO: string;
  acoes: Acoes;
  aPagar: boolean;
  /** Motivo de a aprovação por alçada travar a baixa, calculado no servidor. A action confere de novo. */
  bloqueioDeBaixa?: string | null;
  /** A conta pode ir para a fila de aprovação (`podeEnviarParaAprovacao`) e há action para isso. */
  podeEnviar?: boolean;
  /** Documento fiscal que originou a conta. */
  notaHref?: string | null;
  /** Abrir pendência para o cliente sobre esta conta — só com o módulo ligado. */
  pendenciaHref?: string | null;
  /** Na coluna da tabela: cada botão no mesmo lugar em todas as linhas (ver `vaga`). */
  emColunas?: boolean;
  /** Alguma linha da tabela tem "Conferir": só então a posição dele fica guardada nas outras. */
  comConferir?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [erroDaBaixa, setErroDaBaixa] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [data, setData] = useState(hojeISO);
  const [pendente, startTransition] = useTransition();
  const idDaData = useId();

  function executar(fn: () => Promise<AcaoDeContaState>, aoTerminar?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErro(r.error);
      else aoTerminar?.();
    });
  }

  function enviar(fechar: () => void) {
    const enviarParaAprovacao = acoes.enviarParaAprovacao;
    if (!enviarParaAprovacao) return;
    fechar();
    setErro(null);
    startTransition(async () => {
      const r = await enviarParaAprovacao(entryId);
      if ("error" in r) setErro(r.error);
      else setAviso(r.aviso ?? null);
    });
  }

  const paga = situacao === "PAGA";
  const cancelada = situacao === "CANCELADA";
  const podeEnviarAgora = !paga && !cancelada && podeEnviar && !!acoes.enviarParaAprovacao;
  const temMenu = !!notaHref || (!!pendenciaHref && !cancelada) || podeEnviarAgora || paga;

  // O gatilho é o do `MenuDeMaisAcoes` (08/10/2026): estava copiado à mão aqui.
  const menu = temMenu && (
    <MenuDeMaisAcoes rotulo="Mais ações" aria-label="Mais ações da conta" width={220}>
      {({ close }) => (
        <div className="flex flex-col gap-0.5">
          {notaHref && (
            <ItemDoMenu href={notaHref} icone={<FileText />} onClick={close}>
              Ver nota fiscal
            </ItemDoMenu>
          )}
          {pendenciaHref && !cancelada && (
            <ItemDoMenu href={pendenciaHref} icone={<MessageSquareWarning />} onClick={close}>
              Abrir pendência
            </ItemDoMenu>
          )}
          {podeEnviarAgora && (
            <ItemDoMenu icone={<Send />} disabled={pendente} onClick={() => enviar(close)}>
              Enviar para aprovação
            </ItemDoMenu>
          )}
          {paga && (
            <ItemDoMenu
              icone={<Undo2 />}
              disabled={pendente}
              onClick={() => {
                close();
                executar(() => acoes.desfazer(entryId));
              }}
            >
              Desfazer {aPagar ? "pagamento" : "recebimento"}
            </ItemDoMenu>
          )}
        </div>
      )}
    </MenuDeMaisAcoes>
  );

  // Na tabela, as três posições existem em toda linha (08/10/2026): a coluna é
  // centralizada (conferência de 30/09), e com o "Conferir" só em algumas
  // linhas o grupo mudava de largura — o "Pagar" da linha a conferir ficava
  // 46px à esquerda dos outros, e o "⋯" de conta paga, no meio da célula. A
  // posição vazia guarda o lugar com uma cópia invisível do botão, que mede o
  // mesmo que ele em qualquer fonte; no cartão do celular não há coluna para
  // alinhar, e ela não aparece.
  const rotuloConferir = (
    <>
      <Check size={12} /> Conferir
    </>
  );
  const rotuloDaBaixa = (
    <>
      <CircleDollarSign size={12} /> {aPagar ? "Pagar" : "Receber"}
    </>
  );
  /** A posição vazia na tabela: o botão, invisível e fora do teclado e do leitor de tela. */
  const vaga = (rotulo: React.ReactNode) =>
    emColunas ? (
      <span aria-hidden className="invisible inline-flex">
        <Button variant="secondary" size="xs" tabIndex={-1}>
          {rotulo}
        </Button>
      </span>
    ) : null;

  if (cancelada || paga) {
    return (
      <div className="flex flex-col gap-1 items-start">
        {emColunas ? (
          <div className="flex items-center gap-1.5">
            {comConferir && vaga(rotuloConferir)}
            {vaga(rotuloDaBaixa)}
            {menu || <span className="w-7 text-center text-micro text-fg-muted">—</span>}
          </div>
        ) : (
          menu || <span className="text-micro text-fg-muted">—</span>
        )}
        {erro && <span className="text-micro text-danger max-w-[220px]">{erro}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <div className="flex items-center gap-1.5">
        {/* Conferir só aparece enquanto há o que conferir — botão que sempre
            recusa é ruído em toda linha. */}
        {status === "PROVISORIO" ? (
          <Button variant="secondary" size="xs" disabled={pendente} onClick={() => executar(() => acoes.conferir(entryId))}>
            {rotuloConferir}
          </Button>
        ) : (
          comConferir && vaga(rotuloConferir)
        )}
        {/* Travado pela aprovação: o botão fica, desabilitado e com o motivo
            embaixo — sumir com ele faria a pessoa procurar a baixa noutro lugar. */}
        {bloqueioDeBaixa !== null ? (
          <Button variant="secondary" size="xs" disabled title={bloqueioDeBaixa}>
            {rotuloDaBaixa}
          </Button>
        ) : (
          <Popover
            align="right"
            width={260}
            aria-label={aPagar ? "Registrar pagamento" : "Registrar recebimento"}
            trigger={({ toggle }) => (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => {
                  setErroDaBaixa(null);
                  setData(hojeISO);
                  toggle();
                }}
              >
                {rotuloDaBaixa}
              </Button>
            )}
          >
            {({ close }) => (
              <form
                className="flex flex-col gap-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setErroDaBaixa(null);
                  startTransition(async () => {
                    const r = await acoes.pagar(entryId, data);
                    if (r?.error) setErroDaBaixa(r.error);
                    else close();
                  });
                }}
              >
                <CampoForm label={aPagar ? "Data do pagamento" : "Data do recebimento"} htmlFor={idDaData} error={erroDaBaixa ?? undefined}>
                  <CampoData id={idDaData} compact value={data} max={hojeISO} onChange={(v) => setData(v)} autoFocus />
                </CampoForm>
                <FormFooter
                  pending={pendente}
                  submitLabel="Confirmar"
                  onCancel={close}
                  submitDisabled={!data}
                  size="sm"
                  semDivisoria
                />
              </form>
            )}
          </Popover>
        )}
        {menu || (emColunas && <span aria-hidden className="w-7 shrink-0" />)}
      </div>
      {bloqueioDeBaixa && <span className="text-micro text-fg-muted max-w-[220px]">{bloqueioDeBaixa}</span>}
      {erro && <span className="text-micro text-danger max-w-[220px]">{erro}</span>}
      {aviso && <span className="text-micro text-warning max-w-[220px]">{aviso}</span>}
    </div>
  );
}
