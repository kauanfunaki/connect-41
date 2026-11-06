"use client";

// A tela espelhada do robô parado no captcha (06/11/2026). Pergunta ao Connect a
// cada ~0,7 s enquanto a sessão está aberta, mostra o quadro mais novo e manda
// cada clique como fração da imagem. Só mouse, de propósito: não existe caminho
// para tecla, então pela janela não se digita nada no site do órgão.

import { useCallback, useEffect, useRef, useState } from "react";
import { MousePointerClick } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { ROTULO_DO_ESTADO, type EstadoDaAssistencia } from "@/lib/robo/assistencia";
import { formatInstantTime } from "@/lib/format";

type Estado = EstadoDaAssistencia | "sem_sessao";
type Leitura = { estado: Estado; ate: string | null; cliques: number; quadro: { dataUrl: string; em: number } | null };

const INTERVALO_MS = 700;
const INTERVALO_ESCONDIDA_MS = 3000;
const ABERTOS: readonly Estado[] = ["aguardando_tela", "ao_vivo", "sem_sinal"];

const TOM: Record<Estado, TomDoSelo> = {
  aguardando_tela: "neutro",
  ao_vivo: "sucesso",
  sem_sinal: "atencao",
  resolvida: "sucesso",
  expirada: "atencao",
  encerrada: "neutro",
  sem_sessao: "neutro",
};

function minutosAte(ate: string | null, agora: number): string | null {
  if (!ate) return null;
  const ms = new Date(ate).getTime() - agora;
  if (ms <= 0) return null;
  const min = Math.ceil(ms / 60_000);
  const hora = formatInstantTime(new Date(ate), { hour: "2-digit", minute: "2-digit" });
  return `até ${hora} (${min === 1 ? "1 minuto" : `${min} minutos`})`;
}

export function AssistenciaAoVivo({ tarefaId }: { tarefaId: string }) {
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [quadro, setQuadro] = useState<Leitura["quadro"]>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marca, setMarca] = useState<{ x: number; y: number; n: number } | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const desdeRef = useRef(0);
  const enviandoRef = useRef(false);
  const cliqueRef = useRef(0);

  // O laço de leitura: para sozinho quando a sessão termina.
  useEffect(() => {
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    async function ler() {
      try {
        const r = await fetch(`/api/robo/assistencia/${tarefaId}?desde=${desdeRef.current}`, { cache: "no-store" });
        if (!vivo) return;
        if (!r.ok) {
          setErro(r.status === 403 ? "Você não tem acesso à tela do robô." : "A tarefa não foi encontrada.");
          return;
        }
        const dados = (await r.json()) as Leitura;
        if (!vivo) return;
        setLeitura(dados);
        setAgora(Date.now());
        if (dados.quadro) {
          desdeRef.current = dados.quadro.em;
          setQuadro(dados.quadro);
        }
        if (!ABERTOS.includes(dados.estado)) return;
      } catch {
        // Rede oscilando: tenta de novo na próxima volta, sem tirar a tela.
      }
      if (vivo) temporizador = setTimeout(ler, document.hidden ? INTERVALO_ESCONDIDA_MS : INTERVALO_MS);
    }
    ler();
    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [tarefaId]);

  const clicar = useCallback(
    async (e: React.MouseEvent<HTMLImageElement>) => {
      if (enviandoRef.current) return;
      const caixa = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - caixa.left) / caixa.width;
      const y = (e.clientY - caixa.top) / caixa.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      // A marca do clique some sozinha: mostra onde foi, sem ficar piscando na tela.
      const n = ++cliqueRef.current;
      setMarca({ x, y, n });
      setTimeout(() => setMarca((m) => (m && m.n === n ? null : m)), 700);
      enviandoRef.current = true;
      try {
        const r = await fetch(`/api/robo/assistencia/${tarefaId}/clique`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ x, y }),
        });
        if (!r.ok) setErro(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "O clique não chegou ao robô. Tente de novo.");
        else setErro(null);
      } catch {
        setErro("O clique não chegou ao robô. Confira a internet e tente de novo.");
      } finally {
        // Um clique por vez, com um respiro: dois cliques colados viram duplo clique no site.
        setTimeout(() => (enviandoRef.current = false), 300);
      }
    },
    [tarefaId],
  );

  const estado = leitura?.estado ?? "aguardando_tela";
  const aberto = ABERTOS.includes(estado);
  const prazo = aberto ? minutosAte(leitura?.ate ?? null, agora) : null;

  if (erro && !leitura) return <Aviso>{erro}</Aviso>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
        <Selo tom={TOM[estado]}>{estado === "sem_sessao" ? "Sem pedido de ajuda" : ROTULO_DO_ESTADO[estado]}</Selo>
        {prazo && <span className="text-helper text-fg-secondary tnum">O robô espera {prazo}</span>}
        {leitura && leitura.cliques > 0 && aberto && (
          <span className="text-helper text-fg-muted tnum">{leitura.cliques === 1 ? "1 clique enviado" : `${leitura.cliques} cliques enviados`}</span>
        )}
      </div>

      {aberto && (
        <Aviso tom="marca" icone={<MousePointerClick />}>
          Clique na caixa <strong>Não sou um robô</strong> na tela abaixo. Se aparecer um desafio de imagens, clique nas imagens pedidas e depois em Verificar. O robô continua sozinho assim que o site liberar.
        </Aviso>
      )}
      {estado === "sem_sinal" && (
        <Aviso tom="atencao">O robô parou de mandar a tela há alguns segundos. A janela dele pode ter sido fechada na máquina do TI; se a tela não voltar, a tarefa segue pelo caminho do PDF no fim do prazo.</Aviso>
      )}
      {estado === "resolvida" && (
        <Aviso tom="sucesso">Resolvido. O robô seguiu sozinho; o resultado aparece em Robô do Societário.</Aviso>
      )}
      {estado === "expirada" && (
        <Aviso tom="atencao">O prazo acabou sem o captcha marcado. A tarefa seguiu pelo caminho do PDF, como antes.</Aviso>
      )}
      {(estado === "encerrada" || estado === "sem_sessao") && (
        <Aviso tom="neutro">{estado === "sem_sessao" ? "Esta tarefa não pediu ajuda. Quando o robô parar num captcha, o aviso chega no sino e no celular." : "O robô encerrou a espera."}</Aviso>
      )}
      {erro && leitura && <Aviso>{erro}</Aviso>}

      {aberto && (
        <div className="relative w-full max-w-[1280px] overflow-hidden rounded-lg border border-border bg-surface">
          {quadro ? (
            <>
              {/* Imagem e não canvas: o navegador mostra o JPEG direto, e a fração do clique sai da caixa da própria imagem. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={quadro.dataUrl}
                alt="Tela do navegador do robô, ao vivo. Clique onde quer marcar."
                className="block w-full h-auto cursor-crosshair select-none"
                draggable={false}
                onClick={clicar}
              />
              {marca && (
                <span
                  key={marca.n}
                  aria-hidden
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-brand motion-safe:animate-ping"
                  style={{ left: `${marca.x * 100}%`, top: `${marca.y * 100}%` }}
                />
              )}
            </>
          ) : (
            <div className="flex aspect-video items-center justify-center text-helper text-fg-muted">Esperando a tela do robô…</div>
          )}
        </div>
      )}

      {!aberto && (
        <Button href="/robo" variant="secondary">
          Voltar ao Robô do Societário
        </Button>
      )}
    </div>
  );
}
