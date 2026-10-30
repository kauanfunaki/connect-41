"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

/** Quem está digitando não navega: ↑↓ e Esc ficam com o campo. */
function digitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** ↑ anterior, ↓ próxima, Esc fecha — fora dos campos de texto e sem modal aberto. */
export function NavegacaoPorTeclado({ anterior, proxima, fechar }: { anterior: string | null; proxima: string | null; fechar: string }) {
  const router = useRouter();
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || digitando(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const destino = e.key === "ArrowUp" ? anterior : e.key === "ArrowDown" ? proxima : e.key === "Escape" ? fechar : null;
      if (!destino) return;
      e.preventDefault();
      router.push(destino, { scroll: false });
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [anterior, proxima, fechar, router]);
  return null;
}

export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={copiado ? "Copiado" : rotulo}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          // Sem permissão de área de transferência: o valor está à vista para selecionar.
        }
      }}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-fg-muted hover:text-fg hover:bg-surface-hover shrink-0"
    >
      {copiado ? <Check size={13} className="text-success-fg" /> : <Copy size={13} />}
    </button>
  );
}

/**
 * O cabeçalho do painel, parado no topo (14/10/2026): o nome; numa linha só,
 * o subtítulo, as etiquetas e o botão dos dados; as ações à direita (descem
 * quando não cabem); o aviso embaixo.
 *
 * Os dados do contato (telefone, vaga, responsável…) ocupavam cinco linhas
 * entre o nome e a conversa, e quase tudo já está na linha das etiquetas. Agora
 * começam recolhidos — a regra do Kauan para recolhível, com o resumo na linha,
 * que aqui é a própria linha das etiquetas — e abrem pelo botão "Dados".
 */
export function CabecalhoDoPainel({
  titulo,
  subtitulo,
  etiquetas,
  acoes,
  aviso,
  infos,
  rotuloDasInfos = "Dados",
}: {
  titulo: string;
  subtitulo?: ReactNode;
  etiquetas?: ReactNode[];
  acoes?: ReactNode;
  aviso?: ReactNode;
  infos?: ReactNode;
  rotuloDasInfos?: string;
}) {
  const [dadosAbertos, setDadosAbertos] = useState(false);
  const idDosDados = useId();
  const visiveis = (etiquetas ?? []).filter(Boolean);
  const itensDaLinha = [subtitulo ? <span className="text-fg-muted">{subtitulo}</span> : null, ...visiveis].filter(Boolean);
  return (
    <div className="shrink-0 border-b border-border-soft bg-gradient-to-b from-brand/[0.05] to-transparent px-4 sm:px-5 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-[16rem]">
          <h2 className="text-section font-semibold text-fg leading-tight truncate" title={titulo}>
            {titulo}
          </h2>
          {(itensDaLinha.length > 0 || infos) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-ui text-fg-secondary">
              {itensDaLinha.map((e, i) => (
                <span key={i} className="flex items-center gap-2 min-w-0">
                  {i > 0 && (
                    <span className="text-fg-muted" aria-hidden>
                      ·
                    </span>
                  )}
                  {e}
                </span>
              ))}
              {infos && (
                <button
                  type="button"
                  aria-expanded={dadosAbertos}
                  aria-controls={idDosDados}
                  onClick={() => setDadosAbertos((v) => !v)}
                  className="inline-flex items-center gap-1 h-6 px-1.5 -my-0.5 rounded-md text-fs-2 font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
                >
                  {rotuloDasInfos}
                  <ChevronDown size={13} aria-hidden className={`transition-transform ${dadosAbertos ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-1 -mx-2">{acoes}</div>}
      </div>
      {infos && (
        <div id={idDosDados} hidden={!dadosAbertos} className="relative mt-2 max-h-[40dvh] overflow-y-auto scroll-y rounded-md border border-border-soft bg-surface px-3 py-1">
          {infos}
        </div>
      )}
      {/* Os formulários de transferir e encerrar abrem aqui: com teto, para não
          tomarem o painel inteiro numa tela baixa. */}
      {aviso && <div className="relative mt-3 max-h-[45dvh] overflow-y-auto scroll-y">{aviso}</div>}
    </div>
  );
}

/**
 * Uma aba do painel. `cheia`: o conteúdo ocupa o resto do painel e rola por
 * conta própria (a conversa: mensagens rolando, caixa de escrever parada);
 * sem ela, o conteúdo rola inteiro, com a margem de sempre.
 */
export type AbaDoPainel = { chave: string; rotulo: string; icone: ReactNode; contagem?: number; conteudo: ReactNode; cheia?: boolean };

/** As abas de baixo do painel (Conversa, Candidatura, Histórico…). A primeira abre; as abas ficam paradas. */
export function AbasDoPainel({ abas, inicial }: { abas: AbaDoPainel[]; inicial?: string }) {
  const [ativa, setAtiva] = useState(inicial ?? abas[0]?.chave ?? "");
  const atual = abas.find((a) => a.chave === ativa) ?? abas[0];
  if (!atual) return null;
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Tabs
        className="px-3 sm:px-4 shrink-0 bg-surface"
        active={atual.chave}
        onChange={setAtiva}
        tabs={abas.map((a) => ({ key: a.chave, label: a.rotulo, icon: a.icone, count: a.contagem, panelId: `aba-${a.chave}` }))}
      />
      <div
        id={`aba-${atual.chave}`}
        role="tabpanel"
        className={atual.cheia ? "relative flex-1 min-h-0 flex flex-col" : "relative flex-1 min-h-0 overflow-y-auto scroll-y px-5 sm:px-6 py-4"}
      >
        {atual.conteudo}
      </div>
    </div>
  );
}

/**
 * A lista de mensagens: abre no fim (a mais nova) e acompanha mensagem nova.
 * Antes de pintar (`useLayoutEffect`): a conversa aberta já aparece no fim, sem
 * mostrar o começo por um instante.
 */
export function RolarParaOFim({ children, quantas, className = "" }: { children: ReactNode; quantas: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [quantas]);
  return (
    <div ref={ref} className={`relative overflow-y-auto scroll-y ${className}`.trim()}>
      {children}
    </div>
  );
}
