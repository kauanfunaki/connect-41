"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { BlocoFiscal, EstadoFiscal, PreviaTexto } from "@/components/fiscal/previa/Compartilhados";
import { ESTADO_DA_EXECUCAO } from "@/lib/fiscal/previa/doMotor";
import type { ExecucaoDoMotor } from "@/lib/sped/motor";
import { lerExecucaoNoMotor } from "@/app/(app)/fiscal/motor-actions";
import { FocoAoAbrir } from "./FocoAoAbrir";

const INTERVALO_MS = 4000;
const ABERTOS = new Set(["pendente", "executando"]);

/**
 * O fim do log de uma execução, atualizado a cada 4 segundos enquanto ela está
 * na fila ou executando (`GET /execucoes/{id}` e `/log`). Parou de mudar, para
 * de perguntar — e atualiza a tela para os arquivos gerados aparecerem.
 */
export function AcompanhamentoDaExecucao({ raiz, inicial, logInicial, truncadoInicial }: { raiz: string; inicial: ExecucaoDoMotor; logInicial: string; truncadoInicial: boolean }) {
  const router = useRouter();
  const [execucao, setExecucao] = useState(inicial);
  const [log, setLog] = useState({ texto: logInicial, truncado: truncadoInicial });
  const [erro, setErro] = useState<string | null>(null);
  const textoDoLog = useRef<HTMLPreElement>(null);
  const aberto = ABERTOS.has(execucao.estado);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    const relogio = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      const r = await lerExecucaoNoMotor({ raiz, id: inicial.id }).catch(() => null);
      if (!vivo) return;
      // Falha de rede também aparece (auditoria de UX, 30/10/2026): era engolida,
      // e o "Atualizando" seguia como se o log estivesse em dia.
      if (!r) { setErro("Sem resposta do Connect agora. O log volta a atualizar quando a conexão voltar."); return; }
      if (!r.ok) { setErro(r.mensagem); return; }
      setErro(null);
      setExecucao(r.dados!.execucao);
      setLog({ texto: r.dados!.log, truncado: r.dados!.truncado });
      if (!ABERTOS.has(r.dados!.execucao.estado)) router.refresh();
    }, INTERVALO_MS);
    return () => { vivo = false; clearInterval(relogio); };
  }, [aberto, raiz, inicial.id, router]);

  // Só o quadro do log acompanha o fim; a página rola uma vez, ao abrir (`FocoAoAbrir`).
  // Rolar a página a cada consulta tirava o usuário do lugar (26/10/2026).
  useEffect(() => { const pre = textoDoLog.current; if (pre) pre.scrollTop = pre.scrollHeight; }, [log.texto]);

  return <FocoAoAbrir rotulo={`Log da execução #${execucao.id}`}><BlocoFiscal titulo={`Execução #${execucao.id} · ${execucao.rotulo || execucao.acao}`} descricao={`${execucao.data_ini} a ${execucao.data_fim}${execucao.agente_host ? ` · agente ${execucao.agente_host}${execucao.pid ? ` (PID ${execucao.pid})` : ""}` : ""}${execucao.solicitado_por ? ` · pedido por ${execucao.solicitado_por}` : ""}`}
    acao={<span className="flex flex-wrap items-center gap-2"><EstadoFiscal>{ESTADO_DA_EXECUCAO[execucao.estado]}</EstadoFiscal>{execucao.travada && <Selo tom="atencao">Sem sinal do agente</Selo>}{aberto && <Selo tom="marca">Atualizando</Selo>}</span>}>
    {execucao.mensagem && <Aviso tom={execucao.estado === "erro" ? "atencao" : "info"} className="mb-3">{execucao.mensagem}</Aviso>}
    {erro && <Aviso tom="atencao" className="mb-3">{erro}</Aviso>}
    {log.truncado && <p className="mb-2 text-helper text-fg-muted">Mostrando as últimas 200 linhas do log.</p>}
    <PreviaTexto ref={textoDoLog} texto={log.texto || (aberto ? "Aguardando o agente registrar o log…" : "Sem log registrado.")} />
  </BlocoFiscal></FocoAoAbrir>;
}
