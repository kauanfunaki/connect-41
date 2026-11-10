"use client";

import { useId, useState, useTransition } from "react";
import { Check, CornerUpLeft, Lock, Play, RotateCcw } from "lucide-react";
import type { HandoffSectorStatus } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { formatarNumero } from "@/lib/format";
import { SectorAssigneePicker } from "@/components/transferencias/SectorAssigneePicker";
import { definirResponsaveisDaParte, mudarAParte } from "@/app/(app)/transferencias/actions";
import { MOTIVO_MAXIMO, aoSetor, avisoDaAcao, doSetor, rotuloDaAcao, type AcaoNaParte } from "@/lib/handoffTransicoes";

export type PessoaDaParte = { id: string; nome: string; foto: string | null };

type Props = {
  parteId: string;
  /** O nome do setor da parte e o do setor de origem. */
  setor: string;
  origem: string;
  status: HandoffSectorStatus;
  /** "Resolvendo" — a situação, já no vocabulário da tela, e o tom do Selo. */
  situacao: { rotulo: string; tom: TomDoSelo };
  /** null = a instrução é de outro setor, e quem olha não a lê. */
  instrucao: string | null;
  podeLerInstrucao: boolean;
  /** As ações do lado do setor que a pessoa pode fazer agora (sem o reenviar, que é de quem pediu). */
  acoes: AcaoNaParte[];
  responsaveis: PessoaDaParte[];
  /** Quem pode entrar na lista; null quando a pessoa não muda os responsáveis. */
  opcoesDeResponsavel: { id: string; name: string }[] | null;
  /** O setor de quem olha: a borda azul, como a coluna destacada da faixa. */
  doMeuSetor: boolean;
  /** Uma frase sobre a situação, quando não há botão a mostrar (a parte devolvida). */
  nota?: string | null;
};

/** A ordem e o peso dos botões: o próximo passo natural é o primário. */
function variante(acao: AcaoNaParte, status: HandoffSectorStatus): "primary" | "secondary" {
  if (status === "NEW") return acao === "comecar" ? "primary" : "secondary";
  return acao === "finalizar" ? "primary" : "secondary";
}

const ICONE: Record<AcaoNaParte, React.ReactNode> = {
  comecar: <Play size={14} aria-hidden />,
  finalizar: <Check size={14} aria-hidden />,
  devolver: <CornerUpLeft size={14} aria-hidden />,
  reenviar: <CornerUpLeft size={14} aria-hidden />,
  reabrir: <RotateCcw size={14} aria-hidden />,
};

/**
 * "Parte do {setor}" (10/11/2026, pedido do Kauan — escolha "B · Andamento no
 * topo e a conversa ao lado"): a instrução, os responsáveis (vários, com
 * acrescentar e retirar) e os botões com a ação escrita — Começar, Finalizar a
 * parte, Devolver (com o motivo, num diálogo) e Reabrir. Aparece só para quem
 * pode agir na parte; o resto vê a faixa do topo.
 */
export function ParteDoSetor(p: Props) {
  const toast = useToast();
  const idDoTitulo = useId();
  const idDoMotivo = useId();
  const [pendente, iniciar] = useTransition();
  const [acaoEmCurso, setAcaoEmCurso] = useState<AcaoNaParte | null>(null);
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null);
  const setores = { parte: p.setor, origem: p.origem };

  // Os responsáveis na tela: a lista muda na hora do clique e volta se o
  // servidor recusar. Quando a página volta do servidor com outra lista (outra
  // pessoa mexeu), a da tela acompanha — mas não no meio de uma gravação.
  const doServidor = p.responsaveis.map((r) => r.id);
  const chaveDoServidor = doServidor.join(",");
  const [vista, setVista] = useState(chaveDoServidor);
  const [ids, setIds] = useState(doServidor);
  const [salvandoResponsaveis, iniciarResponsaveis] = useTransition();
  if (!salvandoResponsaveis && vista !== chaveDoServidor) {
    setVista(chaveDoServidor);
    setIds(doServidor);
  }

  function trocarResponsaveis(proximos: string[]) {
    const anteriores = ids;
    setIds(proximos);
    iniciarResponsaveis(async () => {
      const r = await definirResponsaveisDaParte(p.parteId, proximos);
      if (r.ok) toast.success("Responsáveis atualizados.");
      else {
        setIds(anteriores);
        toast.error(r.erro);
      }
    });
  }

  function agir(acao: AcaoNaParte, texto?: string) {
    setAcaoEmCurso(acao);
    iniciar(async () => {
      const r = await mudarAParte(p.parteId, acao, texto);
      setAcaoEmCurso(null);
      if (r.ok) {
        toast.success(avisoDaAcao(acao, setores));
        if (acao === "devolver") {
          setDevolvendo(false);
          setMotivo("");
        }
      } else if (acao === "devolver") {
        setErroDoMotivo(r.erro);
      } else {
        toast.error(r.erro);
      }
    });
  }

  function confirmarDevolucao() {
    const texto = motivo.trim();
    if (!texto) {
      setErroDoMotivo("Escreva o motivo da devolução.");
      return;
    }
    setErroDoMotivo(null);
    agir("devolver", texto);
  }

  // Os nomes de quem não está entre as opções (saiu do setor) continuam na
  // lista, para poderem ser retirados.
  const opcoes = p.opcoesDeResponsavel
    ? [
        ...p.opcoesDeResponsavel,
        ...p.responsaveis.filter((r) => !p.opcoesDeResponsavel!.some((o) => o.id === r.id)).map((r) => ({ id: r.id, name: r.nome })),
      ]
    : null;

  return (
    <Card as="section" aria-labelledby={idDoTitulo} className={`p-5 space-y-4 ${p.doMeuSetor ? "border-brand!" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={idDoTitulo} className="text-section font-semibold text-fg">
          Parte {doSetor(p.setor)}
        </h2>
        <Selo tom={p.situacao.tom}>{p.situacao.rotulo}</Selo>
      </div>

      {!p.podeLerInstrucao ? (
        <p className="text-ui text-fg-muted italic flex items-center gap-1.5">
          <Lock size={14} aria-hidden className="shrink-0" />
          Instrução restrita ao setor {p.setor}.
        </p>
      ) : p.instrucao ? (
        <p className="text-ui text-fg-secondary whitespace-pre-wrap break-words">{p.instrucao}</p>
      ) : (
        <p className="text-ui text-fg-muted italic">Sem instrução específica para este setor.</p>
      )}

      <div className="space-y-2">
        <h3 className="text-helper font-semibold uppercase tracking-wide text-fg-secondary">Responsáveis</h3>
        {opcoes ? (
          <div className="flex flex-wrap items-center gap-2">
            <SectorAssigneePicker
              options={opcoes}
              value={ids}
              onChange={trocarResponsaveis}
              rotulo={`Responsáveis ${doSetor(p.setor)}`}
            />
            {salvandoResponsaveis && (
              <span role="status" className="text-helper text-fg-muted">
                Salvando…
              </span>
            )}
          </div>
        ) : p.responsaveis.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {p.responsaveis.map((r) => (
              <li key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-helper text-fg-secondary">
                <AvatarImage src={r.foto} name={r.nome} size={22} fontSize={9} />
                {r.nome}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui text-fg-muted">Sem responsável.</p>
        )}
      </div>

      {p.nota && <p className="text-helper text-fg-muted">{p.nota}</p>}

      {p.acoes.length > 0 && (
        <div className="flex flex-col gap-2">
          {p.acoes.map((acao) => (
            <Button
              key={acao}
              type="button"
              variant={variante(acao, p.status)}
              // 44px no celular, para o dedo; 36px na mesa.
              className="w-full max-sm:h-11"
              disabled={pendente}
              loading={pendente && acaoEmCurso === acao && acao !== "devolver"}
              loadingLabel="Salvando…"
              onClick={() => {
                if (acao === "devolver") {
                  setErroDoMotivo(null);
                  setDevolvendo(true);
                } else agir(acao);
              }}
            >
              {ICONE[acao]}
              {rotuloDaAcao(acao, setores)}
            </Button>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={devolvendo}
        title={`Devolver ${aoSetor(p.origem)}?`}
        description={`A parte ${doSetor(p.setor)} volta para quem pediu, com o motivo. Quem pediu responde e reenvia, e a parte volta a ser nova.`}
        confirmLabel={rotuloDaAcao("devolver", setores)}
        pendingLabel="Devolvendo…"
        pending={pendente && acaoEmCurso === "devolver"}
        confirmDisabled={!motivo.trim()}
        error={erroDoMotivo}
        largura="max-w-md"
        onConfirm={confirmarDevolucao}
        onCancel={() => setDevolvendo(false)}
      >
        <label htmlFor={idDoMotivo} className="text-label font-medium leading-5 text-fg">
          Motivo<span className="text-danger"> *</span>
        </label>
        <Textarea
          id={idDoMotivo}
          rows={4}
          maxLength={MOTIVO_MAXIMO}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="O que falta para o setor seguir: um documento, uma informação, uma decisão."
          aria-describedby={`${idDoMotivo}-conta`}
          className="mt-1.5"
        />
        <p id={`${idDoMotivo}-conta`} className="mt-1 text-helper text-fg-muted tabular-nums">
          {formatarNumero(motivo.length, 0)} de {formatarNumero(MOTIVO_MAXIMO, 0)} caracteres
        </p>
      </ConfirmDialog>
    </Card>
  );
}
