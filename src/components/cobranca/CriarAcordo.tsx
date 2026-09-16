"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { moeda } from "@/lib/financeiro/formato";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { gerarParcelas, MAXIMO_DE_PARCELAS, TAMANHO_MAXIMO_DA_NOTA } from "@/lib/financeiro/cobranca/acordo";
import { criarAcordo } from "@/app/(app)/cobranca/actions";

type Candidato = { id: string; valorCentavos: number; vencimentoLabel: string; descricao: string | null; competencia: string };

function dataCurta(key: string): string {
  const [a, m, d] = key.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Criar acordo a partir dos títulos vencidos do mesmo sacado.
 *
 * A simulação roda no navegador com a **mesma** `gerarParcelas` que a action
 * usa para gravar: o que a pessoa confere na tela é, centavo a centavo, o que
 * vai nascer. A confirmação é um segundo passo explícito — acordo encerra
 * títulos e cria contas, e isso não cabe num clique só.
 */
export function CriarAcordo({
  sacadoNome,
  candidatos,
  selecionadoInicial,
  hojeISO,
}: {
  sacadoNome: string;
  candidatos: Candidato[];
  selecionadoInicial: string | null;
  hojeISO: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(selecionadoInicial ? [selecionadoInicial] : candidatos.map((c) => c.id))
  );
  const original = candidatos.filter((c) => selecionados.has(c.id)).reduce((n, c) => n + c.valorCentavos, 0);
  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [primeiro, setPrimeiro] = useState(hojeISO);
  const [notas, setNotas] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const acordadoCentavos = valor.trim() === "" ? original : centavosDeTexto(valor);
  const n = Number(parcelas);
  const simulacao = useMemo(() => {
    if (acordadoCentavos === null || acordadoCentavos <= 0 || !Number.isInteger(n) || n < 1 || n > MAXIMO_DE_PARCELAS) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(primeiro)) return [];
    return gerarParcelas({ totalCentavos: acordadoCentavos, parcelas: n, primeiroVencimentoKey: primeiro });
  }, [acordadoCentavos, n, primeiro]);
  const diferenca = acordadoCentavos === null ? 0 : acordadoCentavos - original;

  if (candidatos.length === 0) return null;

  function fechar() {
    if (pendente) return;
    setAberto(false);
    setConfirmando(false);
    setErro(null);
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
        <Handshake size={13} /> Criar acordo
      </Button>
      <Modal open={aberto} onClose={fechar} title={`Acordo com ${sacadoNome}`} maxWidth="max-w-2xl">
        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-[12px] font-medium text-fg mb-2">Títulos vencidos deste sacado nesta empresa</p>
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {candidatos.map((c) => (
                <Checkbox
                  key={c.id}
                  id={`acordo-${c.id}`}
                  checked={selecionados.has(c.id)}
                  disabled={confirmando}
                  onChange={(e) => {
                    const novo = new Set(selecionados);
                    if (e.target.checked) novo.add(c.id);
                    else novo.delete(c.id);
                    setSelecionados(novo);
                  }}
                  label={
                    <span className="tabular-nums">
                      venc. {c.vencimentoLabel} · {moeda(c.valorCentavos)} · comp. {c.competencia}
                      {c.descricao ? ` · ${c.descricao}` : ""}
                    </span>
                  }
                />
              ))}
            </div>
            <p className="text-[12px] text-fg-muted mt-2">
              Soma dos originais: <strong className="tabular-nums text-fg">{moeda(original)}</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <CampoForm label="Valor do acordo" htmlFor="acordo-valor" helper="Vazio = soma dos originais.">
              <Input id="acordo-valor" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={moeda(original)} disabled={confirmando} inputMode="decimal" />
            </CampoForm>
            <CampoForm label="Parcelas" htmlFor="acordo-parcelas" required>
              <Input id="acordo-parcelas" type="number" min={1} max={MAXIMO_DE_PARCELAS} value={parcelas} onChange={(e) => setParcelas(e.target.value)} disabled={confirmando} />
            </CampoForm>
            <CampoForm label="1ª parcela vence em" htmlFor="acordo-primeiro" required helper="As seguintes, todo mês no mesmo dia.">
              <Input id="acordo-primeiro" type="date" min={hojeISO} value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} disabled={confirmando} />
            </CampoForm>
          </div>
          <CampoForm label="Observação interna" htmlFor="acordo-notas">
            <Textarea id="acordo-notas" rows={2} maxLength={TAMANHO_MAXIMO_DA_NOTA} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={confirmando} />
          </CampoForm>

          {simulacao.length > 0 && (
            <div className="rounded-md border border-border p-3">
              <p className="text-[12px] text-fg-secondary mb-2">
                {diferenca > 0 ? (
                  <>Acréscimo de <strong className="tabular-nums">{moeda(diferenca)}</strong> — outras receitas na DRE econômica deste mês.</>
                ) : diferenca < 0 ? (
                  <>Desconto de <strong className="tabular-nums">{moeda(-diferenca)}</strong> — outras despesas na DRE econômica deste mês.</>
                ) : (
                  <>Sem acréscimo nem desconto.</>
                )}{" "}
                Os originais continuam como receita na competência deles.
              </p>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-1 pr-3 font-medium">Parcela</th>
                    <th className="py-1 pr-3 font-medium">Vencimento</th>
                    <th className="py-1 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacao.map((p) => (
                    <tr key={p.numero} className="border-b border-border-soft">
                      <td className="py-1 pr-3 tabular-nums">
                        {p.numero}/{simulacao.length}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">{dataCurta(p.vencimentoKey)}</td>
                      <td className="py-1 text-right tabular-nums">{moeda(p.valorCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!confirmando ? (
              <Button
                size="sm"
                disabled={selecionados.size === 0 || simulacao.length === 0}
                onClick={() => {
                  setErro(null);
                  setConfirmando(true);
                }}
              >
                Revisar e confirmar
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={pendente}
                  onClick={() => {
                    const dados = new FormData();
                    for (const id of selecionados) dados.append("entryIds", id);
                    dados.set("valor", valor.trim() === "" ? (original / 100).toFixed(2) : valor);
                    dados.set("parcelas", parcelas);
                    dados.set("primeiroVencimento", primeiro);
                    dados.set("notas", notas);
                    setErro(null);
                    startTransition(async () => {
                      const r = await criarAcordo(dados);
                      if ("error" in r) {
                        setErro(r.error);
                        setConfirmando(false);
                      } else {
                        setAberto(false);
                        setConfirmando(false);
                        router.push("/cobranca?aba=acordos");
                      }
                    });
                  }}
                >
                  {pendente ? "Criando…" : `Confirmar: encerrar ${selecionados.size} título(s) e criar ${simulacao.length} parcela(s)`}
                </Button>
                <Button size="sm" variant="secondary" disabled={pendente} onClick={() => setConfirmando(false)}>
                  Voltar
                </Button>
              </>
            )}
            {erro && <span className="text-[12px] text-danger">{erro}</span>}
          </div>
        </div>
      </Modal>
    </>
  );
}
