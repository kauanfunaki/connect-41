"use client";

// A janela do captcha em qualquer tela do Connect (09/11/2026). Pedido do Kauan
// depois de testar a sessão assistida: quem pediu o alvará fica em Licenças e
// não via o captcha sem abrir o sino. Agora, quando o robô para e chama a
// pessoa, a janela "O robô precisa de você" abre sozinha, com a tela ao vivo e
// o clique (o mesmo `AssistenciaAoVivo` da tela `/robo/assistir/[id]`).
//
// A conferência é leve: só monta para quem passa no portão da tela do robô
// (o layout decide), pergunta a cada 5 s enquanto a pessoa tem tarefa na fila
// ou sessão aberta e a cada 30 s no resto, e para com a aba escondida. Pedir
// ao robô em Licenças acelera na hora (`EVENTO_DO_PEDIDO_AO_ROBO`).
//
// "Resolver depois" fecha a janela e deixa um botão no rodapé para reabrir. A
// janela fecha sozinha quando a sessão termina, depois de mostrar o fim.

import { useEffect, useEffectEvent, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { AssistenciaAoVivo } from "@/components/robo/AssistenciaAoVivo";
import { formatInstantTime } from "@/lib/format";
import {
  CONFERENCIA_LENTA_MS,
  CONFERENCIA_RAPIDA_MS,
  EVENTO_DO_PEDIDO_AO_ROBO,
  FECHAR_DEPOIS_DO_FIM_MS,
  avisoDoFim,
  ehFimDaChamada,
  intervaloDaConferencia,
  marcasQueValem,
  sessaoParaAbrir,
  sessoesParaReabrir,
  type ChamadasDaPessoa,
  type FimDaChamada,
  type MarcaDaChamada,
  type SessaoNaTela,
} from "@/lib/robo/chamadaNaTela";

/** As chamadas que a pessoa fechou para depois sobrevivem ao F5 desta aba (e só dela). */
const CHAVE_DAS_MARCAS = "connect:robo-captcha";

function lerMarcas(): Record<string, MarcaDaChamada> {
  if (typeof window === "undefined") return {};
  try {
    const lido: unknown = JSON.parse(sessionStorage.getItem(CHAVE_DAS_MARCAS) ?? "{}");
    if (!lido || typeof lido !== "object") return {};
    return Object.fromEntries(Object.entries(lido).filter(([, v]) => v === "depois" || v === "encerrada")) as Record<string, MarcaDaChamada>;
  } catch {
    return {};
  }
}

function hora(iso: string): string {
  return formatInstantTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
}

export function ChamadaDoRobo() {
  const caminho = usePathname();
  const toast = useToast();
  const [sessoes, setSessoes] = useState<SessaoNaTela[]>([]);
  const [marcas, setMarcas] = useState<Record<string, MarcaDaChamada>>(lerMarcas);
  // A sessão que terminou fica na janela mostrando o fim por um instante, mesmo
  // depois de sair da lista; aí a janela fecha e o aviso do canto diz como foi.
  const [fim, setFim] = useState<{ sessao: SessaoNaTela; fim: FimDaChamada } | null>(null);

  const aplicar = useEffectEvent((c: ChamadasDaPessoa) => {
    setSessoes(c.sessoes);
    setMarcas((m) => marcasQueValem(m, c.sessoes));
  });

  // O laço da conferência: um pedido por vez, parado com a aba escondida.
  useEffect(() => {
    let vivo = true;
    let ocupado = false;
    let deNovo = false;
    let semAcesso = false;
    let intervalo = CONFERENCIA_LENTA_MS;
    let relogio: ReturnType<typeof setTimeout> | undefined;

    async function conferir() {
      clearTimeout(relogio);
      if (!vivo || semAcesso || document.visibilityState !== "visible") return;
      if (ocupado) {
        deNovo = true;
        return;
      }
      ocupado = true;
      deNovo = false;
      try {
        const r = await fetch("/api/robo/assistencia", { cache: "no-store" });
        // Sem acesso à tela do robô: nesta página, não pergunta mais.
        if (r.status === 403) semAcesso = true;
        else if (r.ok) {
          const c = (await r.json()) as ChamadasDaPessoa;
          if (vivo) {
            aplicar(c);
            intervalo = intervaloDaConferencia(c);
          }
        }
      } catch {
        // Rede oscilando: tenta de novo na próxima volta, sem mexer na janela.
      } finally {
        ocupado = false;
      }
      if (!vivo || semAcesso) return;
      relogio = setTimeout(conferir, deNovo ? 0 : intervalo);
    }

    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir();
    };
    const aoPedir = () => {
      intervalo = CONFERENCIA_RAPIDA_MS;
      void conferir();
    };
    void conferir();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener(EVENTO_DO_PEDIDO_AO_ROBO, aoPedir);
    return () => {
      vivo = false;
      clearTimeout(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener(EVENTO_DO_PEDIDO_AO_ROBO, aoPedir);
    };
  }, []);

  // As marcas acompanham a aba: F5 não reabre o que a pessoa deixou para depois.
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE_DAS_MARCAS, JSON.stringify(marcas));
    } catch {
      // Sem armazenamento (aba anônima, bloqueio): a marca vale só até o F5.
    }
  }, [marcas]);

  function marcar(chave: string, marca: MarcaDaChamada | null) {
    setMarcas((m) => {
      const novo = { ...m };
      if (marca) novo[chave] = marca;
      else delete novo[chave];
      return novo;
    });
  }

  const concluir = useEffectEvent((f: { sessao: SessaoNaTela; fim: FimDaChamada }) => {
    setFim(null);
    marcar(f.sessao.chave, "encerrada");
    const aviso = avisoDoFim(f.fim);
    toast.show(aviso.texto, aviso.tom);
  });

  useEffect(() => {
    if (!fim) return;
    const relogio = setTimeout(() => concluir(fim), FECHAR_DEPOIS_DO_FIM_MS);
    return () => clearTimeout(relogio);
  }, [fim]);

  const naJanela = fim?.sessao ?? sessaoParaAbrir(sessoes, marcas, caminho);
  const paraReabrir = naJanela ? [] : sessoesParaReabrir(sessoes, marcas, caminho);

  function aoLerEstado(sessao: SessaoNaTela, estado: string) {
    if (!fim && ehFimDaChamada(estado)) setFim({ sessao, fim: estado });
  }

  /** O X, o Esc, o clique fora e o "Resolver depois": a janela sai e o botão de reabrir fica. */
  function fecharJanela() {
    if (fim) {
      setFim(null);
      marcar(fim.sessao.chave, "encerrada");
    } else if (naJanela) {
      marcar(naJanela.chave, "depois");
    }
  }

  return (
    <>
      <Modal open={!!naJanela} onClose={fecharJanela} title="O robô precisa de você" maxWidth="max-w-6xl">
        {naJanela && (
          <div className="space-y-4">
            <p className="text-ui text-fg-secondary">
              {naJanela.oQue}
              {naJanela.empresa ? ` · ${naJanela.empresa}` : ""}
            </p>
            <AssistenciaAoVivo key={naJanela.chave} tarefaId={naJanela.tarefaId} naJanela onEstado={(estado) => aoLerEstado(naJanela, estado)} />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              {!fim && <span className="mr-auto text-helper text-fg-muted">Fechar não cancela o pedido: dá para reabrir pelo botão no rodapé da tela.</span>}
              <Button variant="secondary" onClick={fecharJanela}>
                {fim ? "Fechar" : "Resolver depois"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {paraReabrir.length > 0 && (
        // No meio do rodapé: o canto direito é dos avisos e do chat de IA.
        <div className="fixed bottom-4 left-1/2 z-40 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2">
          <div role="status" className="c41-surgir flex items-center gap-3 rounded-lg border border-warning/40 bg-surface-elevated py-1.5 pl-3 pr-1.5 shadow-lg">
            <Bot size={16} aria-hidden className="flex-shrink-0 text-warning-fg" />
            <span className="text-ui text-fg">
              {paraReabrir.length === 1 ? `O robô espera você no captcha até ${hora(paraReabrir[0].ate)}` : `${paraReabrir.length} captchas do robô esperam você`}
            </span>
            <Button size="sm" onClick={() => marcar(paraReabrir[0].chave, null)}>
              Resolver o captcha
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
