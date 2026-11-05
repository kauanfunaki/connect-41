"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Aviso } from "@/components/ui/Aviso";
import { StatusDot } from "@/components/shared/StatusDot";
import { useConfirm } from "@/components/ui/useConfirm";
import { salvarRegua } from "@/app/(app)/cobranca/actions";
import { MAIOR_PASSO, MAXIMO_DE_PASSOS, textoDosPassos } from "@/lib/financeiro/cobranca/regua";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function dataMenos(hojeISO: string, dias: number): string {
  const d = new Date(`${hojeISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10).split("-").reverse().join("/");
}

/**
 * A régua em trilho (Cobrança A, 04/11/2026): os passos em sequência, com
 * "+ passo", e ao lado o e-mail que o sacado recebe no passo escolhido. Era um
 * campo de texto "1, 7, 15, 30" e não se via o e-mail.
 *
 * Os envios e as empresas fora vêm prontos do servidor e entram nas colunas.
 */
export function ReguaEmTrilho({
  ligada,
  passos: passosSalvos,
  podeEditar,
  hojeISO,
  envios,
  fora,
}: {
  ligada: boolean;
  passos: number[];
  podeEditar: boolean;
  hojeISO: string;
  envios: ReactNode;
  fora: ReactNode;
}) {
  const { dialog, requestConfirm } = useConfirm();
  const [passos, setPassos] = useState(passosSalvos);
  const [escolhido, setEscolhido] = useState<number | null>(passosSalvos[0] ?? null);
  const [novo, setNovo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();
  const mudou = textoDosPassos(passos) !== textoDosPassos(passosSalvos);
  const passo = escolhido !== null && passos.includes(escolhido) ? escolhido : (passos[0] ?? null);

  function salvar(lig: boolean, lista: number[]) {
    setErro(null);
    setSalvo(false);
    const dados = new FormData();
    dados.set("ligada", lig ? "1" : "0");
    dados.set("passos", textoDosPassos(lista));
    startTransition(async () => {
      const r = await salvarRegua(dados);
      if ("error" in r) setErro(r.error);
      else setSalvo(true);
    });
  }

  function alternar() {
    if (ligada) return salvar(false, passosSalvos);
    requestConfirm(
      {
        title: "Ligar a régua de cobrança?",
        description: "A partir da próxima execução, sacados com e-mail e títulos vencidos nos passos recebem lembrete em nome da empresa credora.",
        confirmLabel: "Ligar",
      },
      async () => salvar(true, passosSalvos)
    );
  }

  function adicionar() {
    const n = Number(novo);
    if (!Number.isInteger(n) || n < 1 || n > MAIOR_PASSO) return setErro(`O passo é um número de dias entre 1 e ${MAIOR_PASSO}.`);
    if (passos.includes(n)) return setErro(`Já existe o passo de ${n} dias.`);
    if (passos.length >= MAXIMO_DE_PASSOS) return setErro(`A régua tem no máximo ${MAXIMO_DE_PASSOS} passos.`);
    setErro(null);
    setPassos([...passos, n].sort((a, b) => a - b));
    setEscolhido(n);
    setNovo(null);
  }

  function remover(n: number) {
    setPassos(passos.filter((p) => p !== n));
    setEscolhido(null);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-card-title font-semibold">Régua de lembretes por e-mail</h2>
            <StatusDot color={ligada ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={ligada ? "Ligada" : "Desligada"} />
            {podeEditar && (
              <Button type="button" size="xs" variant={ligada ? "ghost" : "secondary"} className="ml-auto" onClick={alternar} disabled={pendente}>
                {ligada ? "Desligar" : "Ligar"}
              </Button>
            )}
          </div>
          <p className="text-helper text-fg-muted">
            Os e-mails saem nestes dias de atraso, pelo SMTP do escritório e em nome da empresa credora. Clique num passo para ver o e-mail.
          </p>

          {/* O trilho: um botão por passo, ligados por uma linha. */}
          <ol className="flex flex-wrap items-start gap-y-3" aria-label="Passos da régua">
            {passos.map((d, i) => (
              <li key={d} className="flex items-start">
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEscolhido(d)}
                    aria-pressed={passo === d}
                    aria-label={`Passo de ${d} dias`}
                    className={`flex size-11 items-center justify-center rounded-full text-ui font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                      passo === d ? "bg-brand-solid text-on-brand" : "border-2 border-brand/40 bg-surface text-brand hover:bg-brand-subtle"
                    }`}
                  >
                    {d}d
                  </button>
                  <span className="text-micro text-fg-muted">{i + 1}º e-mail</span>
                </div>
                {i < passos.length - 1 && <span aria-hidden className="mx-1 mt-[21px] h-0.5 w-8 rounded-full bg-success/40 sm:w-14" />}
              </li>
            ))}
            {podeEditar && (
              <li className="ml-3 mt-1.5 flex items-center gap-2">
                {novo === null ? (
                  <Button type="button" size="xs" variant="secondary" onClick={() => setNovo("")} disabled={passos.length >= MAXIMO_DE_PASSOS}>
                    <Plus size={12} /> passo
                  </Button>
                ) : (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      adicionar();
                    }}
                  >
                    <Input type="number" min={1} max={MAIOR_PASSO} value={novo} onChange={(e) => setNovo(e.target.value)} className="w-20" aria-label="Dias de atraso do novo passo" autoFocus />
                    <Button type="submit" size="xs">
                      Incluir
                    </Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setNovo(null)} aria-label="Cancelar o novo passo">
                      <X size={12} />
                    </Button>
                  </form>
                )}
              </li>
            )}
          </ol>
          {passos.length === 0 && <p className="text-helper text-warning-fg">Sem passos, a régua não envia nada. Inclua ao menos um.</p>}

          {(mudou || erro || salvo) && (
            <div className="flex flex-wrap items-center gap-2">
              {mudou && podeEditar && (
                <>
                  <Button type="button" size="sm" onClick={() => salvar(ligada, passos)} loading={pendente} disabled={passos.length === 0}>
                    Salvar passos
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPassos(passosSalvos)} disabled={pendente}>
                    Descartar
                  </Button>
                </>
              )}
              {erro && (
                <span role="alert" className="text-helper font-medium text-danger">
                  {erro}
                </span>
              )}
              {salvo && !mudou && <span className="text-helper text-success-fg">Salvo.</span>}
            </div>
          )}
          <Aviso tom="neutro">Pausa sozinha com acordo, contestação ou promessa de pagamento. Sacado sem e-mail fica fora.</Aviso>
          {!podeEditar && <p className="text-micro text-fg-muted">Só a coordenação altera a régua.</p>}
        </Card>
        {envios}
      </div>

      <div className="flex flex-col gap-4">
        <Card as="section" aria-labelledby="previa-do-email" className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="previa-do-email" className="text-card-title font-semibold">
              {passo === null ? "E-mail" : `E-mail do passo de ${passo} dias`}
            </h2>
            {podeEditar && passo !== null && (
              <Button type="button" size="xs" variant="ghost" className="ml-auto text-danger!" onClick={() => remover(passo)}>
                Tirar este passo
              </Button>
            )}
          </div>
          <p className="text-micro text-fg-muted">Prévia com um título de exemplo. O e-mail é o mesmo em todos os passos; muda o tempo de atraso.</p>
          {passo !== null && (
            <div className="rounded-lg border border-border bg-canvas p-3 text-fs-2">
              <p className="text-micro text-fg-muted">
                <span className="font-medium text-fg-secondary">Assunto:</span> Lembrete de pagamento — Empresa credora
              </p>
              <div className="mt-2 rounded-md border border-border-soft bg-surface p-3">
                <p className="font-semibold text-fg">Empresa credora</p>
                <p className="text-micro text-fg-muted">Lembrete de pagamento</p>
                <p className="mt-3 text-fg">Olá, Sacado de exemplo. Consta em aberto, a favor de <strong>Empresa credora</strong>, o título abaixo:</p>
                <dl className="mt-2 divide-y divide-border-soft border-y border-border-soft">
                  {[
                    ["Valor", moeda.format(1000)],
                    ["Vencimento", dataMenos(hojeISO, passo)],
                    ["Em atraso há", passo === 1 ? "1 dia" : `${passo} dias`],
                  ].map(([r, v]) => (
                    <div key={r} className="flex justify-between gap-3 py-1.5">
                      <dt className="text-micro text-fg-muted">{r}</dt>
                      <dd className="font-semibold tabular-nums text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-micro text-fg-secondary">Se o pagamento já foi feito, desconsidere esta mensagem. Para combinar o pagamento, responda a este e-mail.</p>
              </div>
            </div>
          )}
        </Card>
        {fora}
      </div>
      {dialog}
    </div>
  );
}
