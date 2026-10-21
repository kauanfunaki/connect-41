"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatarReaisDeCentavos } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { centavosDosPercentuais, MAXIMO_DE_LINHAS_DO_RATEIO, type LinhaDoRateio } from "@/lib/financeiro/rateio";

type Opcao = { id: string; nome: string };
type Modo = "valor" | "percentual";
type LinhaNaTela = { chave: number; categoriaId: string; centroId: string; projetoId: string; valor: string; percentual: string };

/** "1.234,56" — como o campo de valor recebe. */
const valorNoCampo = (centavos: number) => Number(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentualNoCampo = (p: number) => Number(p).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const lerPercentual = (t: string) => {
  // "33,33" ou "33.33": com vírgula, o ponto é milhar; sem ela, é a casa decimal.
  const limpo = t.trim();
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// As colunas da linha: a categoria sempre; centro e projeto quando a empresa tem.
const GRADE = {
  dois: "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_120px_32px]",
  um: "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_32px]",
  nenhum: "sm:grid-cols-[minmax(0,1fr)_140px_32px]",
} as const;

/**
 * O rateio da conta (lote D, 20/10): a conta dividida em linhas de categoria,
 * centro e projeto, por valor ou por percentual. Usado no lançamento manual e
 * na edição; a regra e a conferência moram em `lib/financeiro/rateio.ts`.
 *
 * Manda o campo oculto `rateio` (as linhas em centavos, em JSON). No modo
 * "%", os centavos saem do valor da conta (`valorTexto`), fechando o total
 * quando os percentuais fecham 100. Embaixo, o que falta para fechar — o
 * servidor recusa rateio que não soma o valor da conta.
 *
 * `travado` (o motivo) mostra as linhas só para ler, sem o campo oculto: é a
 * conta do Omie antes da virada, cujo rateio vem de lá (20/10).
 */
export function CamposDoRateio({
  categorias,
  centros,
  projetos,
  valorTexto,
  iniciais,
  categoriaInicial,
  onDesfazer,
  travado,
  className = "",
}: {
  categorias: Opcao[];
  centros: Opcao[];
  projetos: Opcao[];
  /** O texto do campo de valor da conta, como está na tela agora. */
  valorTexto: string;
  /** As linhas que a conta já tem (edição). */
  iniciais?: LinhaDoRateio[];
  /** A categoria que já estava escolhida — vira a da primeira linha. */
  categoriaInicial?: string;
  onDesfazer: () => void;
  /** Por que o rateio não se edita aqui; ausente, edita. */
  travado?: string;
  className?: string;
}) {
  const id = useId();
  const total = centavosDeTexto(valorTexto);
  const [modo, setModo] = useState<Modo>("valor");
  const [proxima, setProxima] = useState(10);
  const [linhas, setLinhas] = useState<LinhaNaTela[]>(() =>
    iniciais && iniciais.length > 0
      ? iniciais.map((l, i) => ({
          chave: i,
          categoriaId: l.categoriaId ?? "",
          centroId: l.centroId ?? "",
          projetoId: l.projetoId ?? "",
          valor: valorNoCampo(l.centavos),
          percentual: "",
        }))
      : [0, 1].map((i) => ({ chave: i, categoriaId: i === 0 ? categoriaInicial ?? "" : "", centroId: "", projetoId: "", valor: "", percentual: "" }))
  );

  const centavos =
    modo === "valor"
      ? linhas.map((l) => centavosDeTexto(l.valor) ?? 0)
      : total
        ? centavosDosPercentuais(total, linhas.map((l) => lerPercentual(l.percentual)))
        : linhas.map(() => 0);
  const soma = centavos.reduce((s, c) => s + c, 0);
  const json = JSON.stringify(
    linhas.map((l, i) => ({ categoriaId: l.categoriaId || null, centroId: l.centroId || null, projetoId: l.projetoId || null, centavos: centavos[i] }))
  );

  const mudar = (chave: number, campo: keyof Omit<LinhaNaTela, "chave">, valor: string) =>
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  function trocarModo(novo: Modo) {
    if (novo === modo) return;
    // Converte o que já foi digitado, para a troca não apagar o trabalho.
    if (novo === "percentual") {
      setLinhas((atual) =>
        atual.map((l, i) => ({ ...l, percentual: total && centavos[i]! > 0 ? percentualNoCampo((centavos[i]! / total) * 100) : "" }))
      );
    } else {
      setLinhas((atual) => atual.map((l, i) => ({ ...l, valor: centavos[i]! > 0 ? valorNoCampo(centavos[i]!) : "" })));
    }
    setModo(novo);
  }

  const comCentro = centros.length > 0;
  const comProjeto = projetos.length > 0;
  const grade = comCentro && comProjeto ? GRADE.dois : comCentro || comProjeto ? GRADE.um : GRADE.nenhum;
  const situacao =
    total === null || total <= 0
      ? { tom: "text-fg-muted", texto: "Informe o valor da conta para conferir o rateio." }
      : soma === total
        ? { tom: "text-success-fg", texto: `As linhas fecham ${formatarReaisDeCentavos(total)}.` }
        : soma < total
          ? { tom: "text-warning-fg", texto: `Faltam ${formatarReaisDeCentavos(total - soma)} para fechar ${formatarReaisDeCentavos(total)}.` }
          : { tom: "text-danger", texto: `Passou ${formatarReaisDeCentavos(soma - total)} do valor da conta (${formatarReaisDeCentavos(total)}).` };

  return (
    <div className={`flex flex-col gap-3 rounded-md border border-border p-3 ${className}`.trim()}>
      {!travado && <input type="hidden" name="rateio" value={json} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-label font-semibold text-fg">Rateio</span>
        {travado && <span className="text-helper text-fg-secondary">{travado}</span>}
        {!travado && (
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Ratear por">
              {(["valor", "percentual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => trocarModo(m)}
                  aria-pressed={modo === m}
                  className={`h-6 rounded px-2 text-micro font-medium transition-colors ${modo === m ? "bg-brand-subtle text-brand" : "text-fg-muted hover:text-fg"}`}
                >
                  {m === "valor" ? "Valor" : "%"}
                </button>
              ))}
            </div>
            <Button type="button" variant="linkMuted" className="text-helper" onClick={onDesfazer}>
              Desfazer rateio
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className={`hidden sm:grid gap-2 text-micro font-medium uppercase tracking-wide text-fg-muted ${grade}`}>
          <span>Categoria</span>
          {comCentro && <span>Centro de custo</span>}
          {comProjeto && <span>Projeto</span>}
          <span>{modo === "valor" ? "Valor" : "Percentual"}</span>
          <span />
        </div>
        {linhas.map((l, i) => (
          <div key={l.chave} className={`grid grid-cols-1 gap-2 items-center ${grade}`}>
            <Select
              compact
              value={l.categoriaId}
              onChange={(e) => mudar(l.chave, "categoriaId", e.target.value)}
              disabled={!!travado}
              aria-label={`Categoria da linha ${i + 1}`}
            >
              <option value="">Escolha a categoria…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            {comCentro && (
              <Select compact value={l.centroId} onChange={(e) => mudar(l.chave, "centroId", e.target.value)} disabled={!!travado} aria-label={`Centro de custo da linha ${i + 1}`}>
                <option value="">Sem centro</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            )}
            {comProjeto && (
              <Select compact value={l.projetoId} onChange={(e) => mudar(l.chave, "projetoId", e.target.value)} disabled={!!travado} aria-label={`Projeto da linha ${i + 1}`}>
                <option value="">Sem projeto</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            )}
            {modo === "valor" ? (
              <Input
                compact
                prefix="R$"
                inputMode="decimal"
                placeholder="0,00"
                value={l.valor}
                onChange={(e) => mudar(l.chave, "valor", e.target.value)}
                disabled={!!travado}
                aria-label={`Valor da linha ${i + 1}`}
              />
            ) : (
              <Input
                compact
                suffix="%"
                inputMode="decimal"
                placeholder="0"
                value={l.percentual}
                onChange={(e) => mudar(l.chave, "percentual", e.target.value)}
                disabled={!!travado}
                aria-label={`Percentual da linha ${i + 1}`}
              />
            )}
            {!travado && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                disabled={linhas.length <= 2}
                aria-label={`Tirar a linha ${i + 1}`}
                title={linhas.length <= 2 ? "Rateio tem ao menos duas linhas — para voltar a uma categoria só, use “Desfazer rateio”." : undefined}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!travado && (
          <Button
            type="button"
            variant="link"
            className="inline-flex items-center gap-1 text-helper"
            disabled={linhas.length >= MAXIMO_DE_LINHAS_DO_RATEIO}
            onClick={() => {
              setLinhas((atual) => [...atual, { chave: proxima, categoriaId: "", centroId: "", projetoId: "", valor: "", percentual: "" }]);
              setProxima((n) => n + 1);
            }}
          >
            <Plus size={13} /> Adicionar linha
          </Button>
        )}
        <p id={`${id}-situacao`} className={`text-helper font-medium ${situacao.tom}`} aria-live="polite">
          {situacao.texto}
        </p>
      </div>
    </div>
  );
}
