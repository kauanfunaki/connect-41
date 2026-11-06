"use client";
// O andamento do Gerar SPED pela fila do Connect (06/11/2026). O agente do
// motor busca o pedido, gera e devolve o arquivo; a tela relê o estado a cada 5
// segundos enquanto há geração na fila ou executando, e para quando fecha.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, X } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { useConfirm } from "@/components/ui/useConfirm";
import { BlocoFiscal } from "@/components/fiscal/previa/Compartilhados";
import { formatarBytes } from "@/lib/fileSize";
import { formatInstantDateTime } from "@/lib/format";
import type { StatusDaTarefa } from "@/lib/robo/tarefas";
import type { AgenteNaTela, GeracaoNaTela } from "@/lib/fiscal/sped/local/geracao";
import type { GrupoDeFaltas } from "@/lib/fiscal/sped/local/conferenciaDoArquivo";

/** `faltas`: o cadastro que o agente exige para o ICMS/IPI e ainda não está preenchido (vazio no Contribuições). */
export type GeracaoDaEstacao = { opsLigado: boolean; motivo: string | null; geracoes: GeracaoNaTela[]; agente: AgenteNaTela | null; faltas: GrupoDeFaltas[] };
type Estado = Pick<GeracaoDaEstacao, "geracoes" | "agente">;

const INTERVALO_MS = 5000;

const TOM: Record<StatusDaTarefa, TomDoSelo> = { PENDENTE: "neutro", EM_EXECUCAO: "marca", CONCLUIDA: "sucesso", PRECISA_DE_GENTE: "atencao", CANCELADA: "neutro" };
export const ROTULO_DA_OBRIGACAO = { icms_ipi: "EFD ICMS/IPI", contribuicoes: "EFD Contribuições" } as const;
export const rotuloDoTipo = (tipo: "0" | "1") => (tipo === "1" ? "substituto" : "original");
const quando = (iso: string) => formatInstantDateTime(new Date(iso));
export const hrefDoGerado = (id: string) => `/api/fiscal/sped/local/gerados/${id}`;

/**
 * As gerações da tela, vivas: começa no que o servidor mandou e, enquanto há
 * uma aberta, relê o andamento. Quando uma fecha, atualiza a página para a
 * lista e o botão de gerar refletirem o fim. O que o servidor manda de novo
 * (depois de um pedido ou de um refresh) substitui o que foi relido.
 */
export function useGeracoes(inicial: Estado, consulta: { empresa: string; competencia: string }, ativo: boolean) {
  const router = useRouter();
  const [relido, setRelido] = useState<{ base: Estado; dados: Estado } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const atual = relido && relido.base === inicial ? relido.dados : inicial;
  const abertas = atual.geracoes.filter((g) => g.aberta).map((g) => g.id).join(",");

  useEffect(() => {
    if (!ativo || !abertas) return;
    let vivo = true;
    const controle = new AbortController();
    const relogio = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch(`/api/fiscal/sped/local/geracoes?empresa=${encodeURIComponent(consulta.empresa)}&competencia=${encodeURIComponent(consulta.competencia)}`, { cache: "no-store", signal: controle.signal });
        const corpo = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !corpo) { setErro((corpo as { error?: string } | null)?.error ?? "Sem resposta do Connect agora. O andamento volta a atualizar quando a conexão voltar."); return; }
        const novo = corpo as Estado;
        setErro(null);
        setRelido({ base: inicial, dados: novo });
        if (abertas.split(",").some((id) => novo.geracoes.some((g) => g.id === id && !g.aberta))) router.refresh();
      } catch {
        if (vivo && !controle.signal.aborted) setErro("Sem resposta do Connect agora. O andamento volta a atualizar quando a conexão voltar.");
      }
    }, INTERVALO_MS);
    return () => { vivo = false; controle.abort(); clearInterval(relogio); };
  }, [ativo, abertas, consulta.empresa, consulta.competencia, inicial, router]);

  return { ...atual, erro };
}

const ONDE_NA_TELA: Record<GrupoDeFaltas["onde"], string> = { cadastro: "No cadastro da empresa", importacao: "Na importação" };

/**
 * O que falta para o agente gerar o EFD ICMS/IPI, dito antes do pedido e com o
 * caminho para resolver: o cadastro da empresa, na ficha dela (etapas
 * "Dados fiscais" e "SPED fiscal"). Sem contabilista, lembra que o padrão do
 * escritório resolve todas as empresas de uma vez.
 */
export function FaltasDoArquivo({ faltas, hrefDaEmpresa }: { faltas: GrupoDeFaltas[]; hrefDaEmpresa: string }) {
  if (!faltas.length) return null;
  const doCadastro = faltas.find((g) => g.onde === "cadastro");
  const semContabilista = !!doCadastro?.itens.some((i) => i.endsWith("do contabilista"));
  return <Aviso tom="atencao">
    <div className="space-y-2">
      <p>Para gerar o EFD ICMS/IPI, complete antes:</p>
      <ul className="list-disc space-y-1 pl-5">{faltas.map((g) => <li key={g.onde}><span className="font-medium">{ONDE_NA_TELA[g.onde]}:</span> {g.itens.join(", ")}.</li>)}</ul>
      {semContabilista && <p className="text-helper">O contabilista também pode ficar como padrão do escritório, em Administração › Dados e e-mail de envio. Ele vale para todas as empresas sem contabilista próprio.</p>}
      {doCadastro && <div className="pt-1"><Button size="xs" variant="secondary" href={hrefDaEmpresa}>Abrir cadastro da empresa</Button></div>}
    </div>
  </Aviso>;
}

/** A máquina do agente: ligada, sem sinal ou ainda nenhuma. */
export function SinalDoAgente({ agente }: { agente: AgenteNaTela | null }) {
  if (!agente) return <p className="text-helper text-fg-secondary">Nenhuma máquina buscou geração neste escritório ainda. O pedido fica na fila até o agente do motor buscar.</p>;
  return <p className="flex flex-wrap items-center gap-2 text-helper text-fg-secondary">
    <Selo tom={agente.semSinal ? "atencao" : "sucesso"}>{agente.semSinal ? "Agente sem sinal" : "Agente ligado"}</Selo>
    <span>{agente.nome}{agente.ultimoSinal ? `, último sinal em ${quando(agente.ultimoSinal)}` : ", sem sinal registrado"}</span>
  </p>;
}

type PropsDoCartao = { geracao: GeracaoNaTela; agente: AgenteNaTela | null; revisaoAtual: number; pode: boolean; erro: string | null; cancelar: (id: string) => Promise<unknown> };

/** A geração mais recente da obrigação, com o que dá para fazer nela agora. */
export function CartaoDaGeracao({ geracao: g, agente, revisaoAtual, pode, erro, cancelar }: PropsDoCartao) {
  const { dialog, requestConfirm } = useConfirm();
  const titulo = `${ROTULO_DA_OBRIGACAO[g.obrigacao]} ${rotuloDoTipo(g.tipoSped)}`;
  const pedirCancelamento = () => requestConfirm(
    { title: "Tirar esta geração da fila?", description: "O agente não vai gerar este pedido. Dá para pedir de novo quando quiser.", confirmLabel: "Tirar da fila" },
    async () => { await cancelar(g.id); },
  );
  return <BlocoFiscal titulo={titulo} descricao={`Revisão ${g.revisao}, pedida em ${quando(g.pedidaEm)}`} acao={<Selo tom={TOM[g.estado]}>{g.rotuloDoEstado}</Selo>}>
    <div className="space-y-3">
      {/* Só o texto do andamento é lido ao mudar; os botões ficam fora da região viva. */}
      <div className="space-y-3" role="status" aria-live="polite">
      {g.estado === "PENDENTE" && <p className="text-ui text-fg-secondary">Na fila desde {quando(g.desde)}. O agente do motor gera quando buscar a próxima tarefa.</p>}
      {g.estado === "PENDENTE" && agente?.semSinal && <Aviso tom="atencao">A máquina do agente está sem sinal. O pedido continua na fila e é gerado quando ela voltar.</Aviso>}
      {g.estado === "EM_EXECUCAO" && <p className="text-ui text-fg-secondary">Gerando{g.maquina ? ` na máquina ${g.maquina}` : ""} desde {quando(g.desde)}{g.tentativas > 1 ? ` (tentativa ${g.tentativas})` : ""}. Esta área se atualiza sozinha.</p>}
      {g.estado === "CONCLUIDA" && g.arquivo && <>
        <p className="text-ui text-fg break-all">{g.arquivo.nome}</p>
        <p className="text-helper text-fg-secondary">{formatarBytes(g.arquivo.bytes)}{g.concluidaEm ? `, gerado em ${quando(g.concluidaEm)}` : ""}. SHA-256 <span className="break-all">{g.arquivo.sha256}</span></p>
        {g.revisao !== revisaoAtual && <Aviso tom="atencao">Os dados mudaram depois desta geração (revisão {g.revisao}, agora {revisaoAtual}). Gere de novo para o arquivo trazer as alterações.</Aviso>}
      </>}
      {g.estado === "PRECISA_DE_GENTE" && <Aviso tom="atencao">{g.motivo ?? "O agente parou e chamou alguém."} Confira e peça a geração de novo.</Aviso>}
      {g.estado === "CANCELADA" && <p className="text-ui text-fg-secondary">Tirada da fila antes de a máquina pegar.</p>}
      {erro && g.aberta && <Aviso tom="atencao">{erro}</Aviso>}
      </div>
      {(g.estado === "CONCLUIDA" && g.arquivo || g.estado === "PENDENTE" && pode) && <div className="flex flex-wrap gap-2">
        {g.estado === "CONCLUIDA" && g.arquivo && <Button variant="secondary" size="sm" href={hrefDoGerado(g.id)} download><Download size={14} /> Baixar arquivo</Button>}
        {g.estado === "PENDENTE" && pode && <Button variant="ghost" size="sm" onClick={pedirCancelamento}><X size={14} /> Tirar da fila</Button>}
      </div>}
    </div>
    {dialog}
  </BlocoFiscal>;
}
