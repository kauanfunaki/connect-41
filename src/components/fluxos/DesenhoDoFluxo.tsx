"use client";

import { useId, useMemo } from "react";
import { COR_DO_EXECUTOR, nomeCurtoDaEtapa, numerosDasEtapas, rotuloDoExecutor, saidasDasEtapas, type Etapa } from "@/lib/fluxos/etapas";
import { desenharFluxo, MEDIDAS, type NoDoDesenho } from "@/lib/fluxos/desenho";

type Props = {
  etapas: Etapa[];
  titulo: string;
  rotuloDoSetor: (codigo: string) => string;
  selecionada?: string | null;
  /**
   * Clique ou Enter numa etapa (a leitura, opção A). Sem ele o desenho é só
   * imagem — o editor desenha ao lado da lista, e quem edita usa a lista.
   */
  aoEscolher?: (id: string) => void;
  /** O id do painel da etapa, para o `aria-controls` dos botões. */
  painelId?: string;
  /** Prefixo do id de cada botão de etapa: o painel devolve o foco a ele no Esc. */
  prefixoDoId?: string;
};

const LINHA = MEDIDAS.alturaDaLinhaDeTexto;
/** Largura do chip de executor no desenho — estimativa a 11px. */
const larguraDoChip = (texto: string) => 26 + texto.length * 6.2;
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/**
 * O fluxograma desenhado da lista (10/11/2026, pedido do Kauan): um SVG só,
 * com `role="img"` e o título como nome, que escala com a largura e rola de
 * lado no celular. O desenho vem pronto de `desenharFluxo` — aqui só se pinta
 * com os tokens do Connect (caixa da etapa com o número e o chip de quem
 * executa, losango de decisão no tom de atenção, Início e Fim em pílula,
 * seta cheia e "volta" tracejada).
 *
 * Na leitura, por cima de cada caixa vai um botão transparente, na ordem da
 * lista: é por ele que o teclado e o leitor de tela chegam às etapas — o
 * nome do botão diz o número, o título, quem executa e, na decisão, para
 * onde vão o Sim e o Não.
 */
export function DesenhoDoFluxo({ etapas, titulo, rotuloDoSetor, selecionada = null, aoEscolher, painelId, prefixoDoId = "etapa-" }: Props) {
  const d = useMemo(() => desenharFluxo(etapas), [etapas]);
  const ponta = `ponta-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const numeros = useMemo(() => numerosDasEtapas(etapas), [etapas]);
  const total = numeros.size;
  const saidas = useMemo(() => saidasDasEtapas(etapas), [etapas]);
  const porId = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);

  if (d.nos.length === 0) return null;

  const nomeDoBotao = (n: NoDoDesenho) => {
    const e = porId.get(n.id)!;
    const onde = n.numero ? `${nomeCurtoDaEtapa(e, numeros)} de ${total}` : nomeCurtoDaEtapa(e, numeros);
    const partes = [`${onde}: ${e.titulo || "sem nome"}`];
    if (e.executor) partes.push(rotuloDoExecutor(e.executor, rotuloDoSetor));
    if (e.tipo === "decisao") {
      for (const s of saidas.get(e.id) ?? []) {
        const alvo = porId.get(s.para);
        if (alvo) partes.push(`${s.tipo === "sim" ? "Sim" : "Não"} vai para ${nomeCurtoDaEtapa(alvo, numeros)}`);
      }
    }
    if (n.foraDoCaminho) partes.push("fora do caminho");
    return partes.join(". ");
  };

  return (
    // A rolagem de lado é só desta caixa: a página nunca rola de lado.
    <div className="overflow-x-auto">
      <div className="relative mx-auto" style={{ width: "100%", maxWidth: d.largura, minWidth: Math.min(d.largura, 520) }}>
        <svg viewBox={`0 0 ${d.largura} ${d.altura}`} role="img" aria-label={`Fluxograma de ${titulo}`} className="block h-auto w-full select-none">
          <defs>
            <marker id={ponta} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" className="fill-fg-muted" />
            </marker>
          </defs>

          {d.setas.map((s) => (
            <polyline
              key={`${s.de}-${s.para}-${s.tipo}`}
              points={s.pontos.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              className="stroke-fg-muted"
              strokeWidth={1.6}
              strokeDasharray={s.volta ? "5 4" : undefined}
              markerEnd={`url(#${ponta})`}
            />
          ))}

          {d.nos.map((n) => (
            <Caixa key={n.id} no={n} selecionada={n.id === selecionada} rotuloDoSetor={rotuloDoSetor} />
          ))}

          {/* Os rótulos por último, por cima de tudo, com uma borda da cor do fundo para ler sobre a seta. */}
          {d.setas
            .filter((s) => s.rotulo)
            .map((s) => (
              <text
                key={`r-${s.de}-${s.para}-${s.tipo}`}
                x={s.rotulo!.x}
                y={s.rotulo!.y}
                textAnchor={s.rotulo!.ancora}
                className="fill-fg-secondary text-fs-1 font-semibold"
                stroke="var(--c41-surface)"
                strokeWidth={4}
                paintOrder="stroke"
              >
                {s.rotulo!.texto}
              </text>
            ))}
        </svg>

        {aoEscolher && (
          <ol aria-label="Etapas do fluxo, na ordem da lista" className="absolute inset-0 m-0 list-none p-0">
            {d.nos.map((n) => (
              <li key={n.id} className="absolute" style={{ left: pct(n.x, d.largura), top: pct(n.y, d.altura), width: pct(n.w, d.largura), height: pct(n.h, d.altura) }}>
                <button
                  id={`${prefixoDoId}${n.id}`}
                  type="button"
                  onClick={() => aoEscolher(n.id)}
                  aria-label={nomeDoBotao(n)}
                  aria-controls={painelId}
                  aria-expanded={n.id === selecionada}
                  className={`size-full cursor-pointer transition-colors hover:bg-brand/5 ${n.tipo === "decisao" ? "rounded-md" : n.tipo === "etapa" ? "rounded-[10px]" : "rounded-full"}`}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Caixa({ no: n, selecionada, rotuloDoSetor }: { no: NoDoDesenho; selecionada: boolean; rotuloDoSetor: (c: string) => string }) {
  const contorno = selecionada ? "stroke-brand" : n.tipo === "decisao" ? "" : "stroke-border-strong";
  const largura = selecionada ? 2.4 : 1.2;
  const tracejado = n.foraDoCaminho ? "4 3" : undefined;
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const texto = n.linhas.length * LINHA;
  const chip = n.executor && (n.tipo === "etapa" || n.tipo === "inicio") ? rotuloDoExecutor(n.executor, rotuloDoSetor) : null;

  if (n.tipo === "decisao") {
    const topo = cy - texto / 2;
    return (
      <g>
        <polygon
          points={`${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`}
          style={{ fill: "color-mix(in srgb, var(--c41-warning) 12%, var(--c41-surface))", stroke: selecionada ? undefined : "var(--c41-warning)" }}
          className={contorno}
          strokeWidth={selecionada ? 2.4 : 1.6}
          strokeDasharray={tracejado}
        />
        {n.numero !== null && <Numero x={n.x + 14} y={n.y + 14} n={n.numero} />}
        <text textAnchor="middle" className="fill-fg text-ui font-semibold">
          {n.linhas.map((l, i) => (
            <tspan key={i} x={cx} y={topo + 13 + i * LINHA}>
              {l}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  if (n.tipo === "etapa") {
    const topo = n.y + 14;
    return (
      <g>
        <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} className={`fill-surface ${contorno}`} strokeWidth={largura} strokeDasharray={tracejado} />
        {n.numero !== null && <Numero x={n.x + 18} y={topo + 8} n={n.numero} />}
        <text className="fill-fg text-ui font-semibold">
          {n.linhas.map((l, i) => (
            <tspan key={i} x={n.x + 36} y={topo + 12 + i * LINHA}>
              {l}
            </tspan>
          ))}
        </text>
        {chip && <Chip x={n.x + 36} y={topo + texto + 6} texto={chip} cor={COR_DO_EXECUTOR[n.executor!.tipo]} max={n.w - 36 - 10} />}
      </g>
    );
  }

  // Início e Fim: pílula, texto ao centro.
  const bloco = texto + (chip ? 26 : 0);
  const topo = n.y + (n.h - bloco) / 2;
  return (
    <g>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.h / 2} className={`fill-surface-hover ${contorno}`} strokeWidth={largura} strokeDasharray={tracejado} />
      <text textAnchor="middle" className="fill-fg text-ui font-semibold">
        {n.linhas.map((l, i) => (
          <tspan key={i} x={cx} y={topo + 12 + i * LINHA}>
            {l}
          </tspan>
        ))}
      </text>
      {chip && <Chip x={cx - larguraDoChip(caber(chip, n.w - 32)) / 2} y={topo + texto + 6} texto={chip} cor={COR_DO_EXECUTOR[n.executor!.tipo]} max={n.w - 32} />}
    </g>
  );
}

function Numero({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} className="fill-brand-subtle" />
      <text x={x} y={y + 4} textAnchor="middle" className="fill-brand text-fs-1 font-bold tabular-nums">
        {n}
      </text>
    </g>
  );
}

/** Corta o nome do chip para caber na caixa (o nome inteiro está no botão e no painel). */
function caber(texto: string, largura: number): string {
  const letras = Math.floor((largura - 26) / 6.2);
  return texto.length <= letras ? texto : `${texto.slice(0, Math.max(1, letras - 1)).trimEnd()}…`;
}

/** O chip de quem executa, desenhado: ponto na cor e o nome (a cor nunca diz sozinha). */
function Chip({ x, y, texto: inteiro, cor, max }: { x: number; y: number; texto: string; cor: string; max: number }) {
  const texto = caber(inteiro, max);
  const w = larguraDoChip(texto);
  return (
    <g>
      <rect x={x} y={y} width={w} height={20} rx={10} className="fill-surface-hover stroke-border" strokeWidth={1} />
      <circle cx={x + 11} cy={y + 10} r={3.5} style={{ fill: cor }} />
      <text x={x + 19} y={y + 14} className="fill-fg-secondary text-fs-1 font-medium">
        {texto}
      </text>
    </g>
  );
}
