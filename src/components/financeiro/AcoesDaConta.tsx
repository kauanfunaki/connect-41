"use client";

import { useState, useTransition } from "react";
import { Check, CircleDollarSign, Send, FileText, MessageSquareWarning, Pencil, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import type { AcaoDeContaState } from "@/lib/financeiro/acoes";
import type { SituacaoDaConta } from "@/lib/financeiro/contas";
import { useEdicaoDeLancamento } from "./EditarLancamento";
import { useJanelaDaBaixa } from "./JanelaDaBaixa";

type Acoes = {
  conferir: (entryId: string) => Promise<AcaoDeContaState>;
  /** Enviar para aprovação por alçada. Ausente quando o módulo está desligado ou a pessoa não atua nele. */
  enviarParaAprovacao?: (entryId: string) => Promise<{ error: string } | { ok: true; aviso?: string | null }>;
};

/**
 * As ações de uma conta: a do dia (pagar ou receber) em botão, e o resto —
 * conferir, editar, ver a nota, abrir pendência — num menu "⋯", lado a lado
 * numa linha só (escolha 12A, 20/10/2026).
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
  podeEditar = false,
  temBaixas = false,
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
  /** Na coluna da tabela: alinhado à direita, com a vaga do "⋯" guardada quando não há menu. */
  emColunas?: boolean;
  /** "Editar" no "⋯" (19/10). O que cada campo permite, a janela pergunta ao servidor. */
  podeEditar?: boolean;
  /** A conta tem baixa — total ou parcial: "⋯ › Baixas" lista e desfaz (lote C, 19/10). */
  temBaixas?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  // A baixa abre numa janela (lote C): data, conta bancária, valor, juros,
  // multa e desconto — era um balão só com a data. Baixa parcial avisa na linha.
  const baixa = useJanelaDaBaixa(hojeISO, (avisoDaBaixa) => setAviso(avisoDaBaixa));
  // Conta que voltou para a aprovação ao mudar de valor diz isso na linha.
  const edicao = useEdicaoDeLancamento((avisoDaEdicao) => setAviso(avisoDaEdicao));

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
  // "Conferir" no "⋯" (escolha 12A, 20/10/2026): era um botão ao lado da
  // baixa, e a coluna empilhava em duas linhas. Na linha, o selo "A conferir"
  // diz que falta; muitas de uma vez, "Conferir marcadas", na barra do lote.
  const conferivel = status === "PROVISORIO" && !paga && !cancelada;
  const podeEnviarAgora = !paga && !cancelada && podeEnviar && !!acoes.enviarParaAprovacao;
  const editavel = podeEditar && !cancelada;
  // Paga, as baixas são a ação da linha ("Ver baixa"); em aberto com baixa
  // parcial, ficam no "⋯".
  const baixasNoMenu = temBaixas && !paga;
  const temMenu = conferivel || editavel || !!notaHref || (!!pendenciaHref && !cancelada) || podeEnviarAgora || baixasNoMenu;

  // O gatilho é o do `MenuDeMaisAcoes` (08/10/2026): estava copiado à mão aqui.
  // Sempre "⋯", mesmo com uma ação só: na coluna, todo "⋯" no mesmo lugar.
  const menu = temMenu && (
    <MenuDeMaisAcoes rotulo="Mais ações" aria-label="Mais ações da conta" width={220} sempreMenu>
      {({ close }) => (
        <div className="flex flex-col gap-0.5">
          {conferivel && (
            <ItemDoMenu
              icone={<Check />}
              disabled={pendente}
              onClick={() => {
                close();
                executar(() => acoes.conferir(entryId));
              }}
            >
              Conferir
            </ItemDoMenu>
          )}
          {/* Logo depois: é o que o BPO procurou aqui (retorno de 19/10). */}
          {editavel && (
            <ItemDoMenu
              icone={<Pencil />}
              onClick={() => {
                close();
                edicao.abrir(entryId);
              }}
            >
              Editar
            </ItemDoMenu>
          )}
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
          {baixasNoMenu && (
            // As baixas da conta, com "Desfazer" em cada uma — era o "Desfazer
            // pagamento" (D3, 15/10/2026), que com baixa parcial não diz qual.
            <ItemDoMenu
              icone={<ReceiptText />}
              onClick={() => {
                close();
                baixa.abrir(entryId);
              }}
            >
              {aPagar ? "Pagamentos" : "Recebimentos"}
            </ItemDoMenu>
          )}
        </div>
      )}
    </MenuDeMaisAcoes>
  );

  // A ação do dia, em azul, com o "⋯" ao lado (escolha 12A, 20/10/2026): era
  // uma grade de duas linhas, Conferir e Pagar em cima e o "⋯" sozinho
  // embaixo, com vãos invisíveis guardando o lugar. Paga, a ação vira "Ver
  // baixa"; cancelada não tem ação.
  let principal: React.ReactNode = null;
  if (paga) {
    principal = temBaixas ? (
      <Button variant="ghost" size="xs" className="whitespace-nowrap" onClick={() => baixa.abrir(entryId)}>
        <ReceiptText size={12} /> Ver baixa
      </Button>
    ) : null;
  } else if (!cancelada) {
    principal =
      bloqueioDeBaixa !== null ? (
        // Travado pela aprovação: o botão fica, apagado e com o motivo na dica
        // — sumir com ele faria a pessoa procurar a baixa noutro lugar. O
        // selo da aprovação, na Situação, diz o mesmo.
        <span title={bloqueioDeBaixa} className="inline-flex">
          <Button variant="secondary" size="xs" className="whitespace-nowrap" disabled>
            <CircleDollarSign size={12} /> {aPagar ? "Pagar" : "Receber"}
          </Button>
        </span>
      ) : (
        <Button
          variant="primary"
          size="xs"
          className="whitespace-nowrap"
          onClick={() => {
            setAviso(null);
            baixa.abrir(entryId);
          }}
        >
          <CircleDollarSign size={12} /> {aPagar ? "Pagar" : "Receber"}
        </Button>
      );
  }

  // Sem "⋯", a vaga dele fica guardada na tabela, para a ação do dia não
  // mudar de lugar; sem nada, um traço.
  const semMenu = emColunas ? (
    <span className="inline-flex w-7 justify-center text-micro text-fg-muted">{principal ? null : "—"}</span>
  ) : principal ? null : (
    <span className="text-micro text-fg-muted">—</span>
  );

  return (
    <div className={`flex min-w-0 max-w-full flex-col gap-1 ${emColunas ? "w-full items-end text-right" : "items-start"}`}>
      <div className="flex items-center gap-1.5 [&>*]:shrink-0">
        {principal}
        {menu || semMenu}
      </div>
      {/* No cartão do celular, o motivo da trava embaixo; na tabela, a dica do botão e o selo. */}
      {bloqueioDeBaixa && !emColunas && !paga && !cancelada && (
        <span className="text-micro text-fg-muted max-w-[220px]">{bloqueioDeBaixa}</span>
      )}
      {erro && <span className="text-micro text-danger max-w-full">{erro}</span>}
      {aviso && <span className="text-micro text-warning-fg max-w-full">{aviso}</span>}
      {edicao.janela}
      {baixa.janela}
    </div>
  );
}
