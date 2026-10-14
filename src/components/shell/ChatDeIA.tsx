"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  FileText,
  History,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { Contador } from "@/components/ui/Contador";
import { Ceci, type EstadoDaCeci } from "@/components/ia/Ceci";
import { especialidadeDoAgente, NOME_DA_ASSISTENTE } from "@/lib/ia/ceci";
import { RespostaDaCeci } from "@/components/ia/RespostaDaCeci";
import { respostaEmTextoSimples } from "@/lib/ia/chat/markdown";
import { ACEITA_NO_CAMPO, conferirEscolha, separarAnexos } from "@/lib/ia/chat/anexos-regras";
import { contextoParaMostrar } from "@/lib/ia/chat/telas";
import { assinarPedidosParaAbrirCeci } from "@/lib/ia/chat/abrirCeci";
import {
  boasVindasPendentes,
  CHAVE_DAS_BOAS_VINDAS,
  entradaAtual,
  mensagensNovas,
  respostaNaoLidaDepois,
  rotuloDoAviso,
  sugestoesDasBoasVindas,
  textoDasBoasVindas,
} from "@/lib/ia/chat/boasVindas";
import { formatInstantDateTime } from "@/lib/format";
import type { AgenteDoChat } from "@/lib/ia/chat/agentes";
import type { ConversaNaLista, MensagemNaTela } from "@/lib/ia/chat/conversas";
import {
  descreverProposta,
  MOTIVOS_DO_NAO,
  opcoesDeRespostaRapida,
  rotulosDaDecisao,
  SUGERIR_RESPOSTAS,
  type Avaliacao,
  type MotivoDoNao,
} from "@/lib/ia/chat/regras";
import {
  abrirConversaDoChat,
  apagarConversaDoChat,
  aplicarPropostaDoChat,
  avaliarRespostaDoChat,
  conversasDoChat,
  recusarPropostaDoChat,
  substituirDesdeAMensagem,
} from "@/app/(app)/ia/chat-actions";

type Evento =
  | { tipo: "conversa"; id: string }
  | { tipo: "passo"; texto: string }
  | { tipo: "mensagem"; mensagem: MensagemNaTela }
  | { tipo: "erro"; texto: string };

/** A pergunta da pessoa; os arquivos anexados aparecem como etiquetas embaixo. */
function BalaoDaPergunta({ texto }: { texto: string }) {
  const p = separarAnexos(texto);
  return (
    <div className="rounded-lg rounded-br-sm bg-brand-solid text-on-brand px-3.5 py-2.5 text-ui flex flex-col gap-2">
      <p className="whitespace-pre-wrap break-words">{p.texto}</p>
      {p.anexos.length > 0 && (
        <span className="flex flex-wrap justify-end gap-1">
          {p.anexos.map((nome, i) => (
            <span key={`${nome}-${i}`} className="inline-flex max-w-[200px] items-center gap-1 rounded-md bg-black/15 px-1.5 py-0.5 text-micro">
              <FileText size={11} className="flex-shrink-0" />
              <span className="truncate">{nome}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

// ─── "Já abriu o chat?" — o brilho atrás da Ceci respira até a primeira vez ───
//
// Em localStorage, por pessoa e navegador. Se não der para ler ou gravar
// (janela anônima, bloqueio), conta como já aberto: não brilha à toa.
//
// Até 13/10/2026 isto também mostrava o balão "Pergunte à IA do {setor}" com a
// primeira sugestão. Saiu a pedido do Kauan: voltava a cada abertura do
// Connect — o "x" do balão não ficava guardado, e cada endereço de setor tem o
// seu localStorage. O chamado ficou: é discreto e some na primeira abertura —
// era um anel pulsando em volta da pílula e, desde o botão só com o desenho
// (13/10/2026), é um brilho suave atrás dela.
const CHAVE_JA_ABRIU = "c41:chat-ia:ja-abriu";
const EVENTO_JA_ABRIU = "c41:chat-ia";
function lerJaAbriu(): boolean {
  try {
    return localStorage.getItem(CHAVE_JA_ABRIU) === "1";
  } catch {
    return true;
  }
}
function assinarJaAbriu(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO_JA_ABRIU, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO_JA_ABRIU, aviso);
  };
}
function marcarJaAbriu() {
  try {
    localStorage.setItem(CHAVE_JA_ABRIU, "1");
  } catch {
    /* sem armazenamento: só não lembra */
  }
  window.dispatchEvent(new Event(EVENTO_JA_ABRIU));
}

// ─── As boas-vindas desta entrada (13/10/2026) ──────────────────────────────
//
// A marca da entrada vem do cookie que o login grava; a última vista, do
// localStorage. A foto é a string "entrada\nvista" (o `useSyncExternalStore`
// compara por igualdade). Sem armazenamento, foto vazia: conta como vista e o
// aviso não insiste. No servidor também vazia — as boas-vindas só aparecem
// depois de a tela montar. Regras em `src/lib/ia/chat/boasVindas.ts`.
const EVENTO_BOAS_VINDAS = "c41:ceci:boas-vindas";
function fotoDasBoasVindas(): string {
  try {
    return `${entradaAtual(document.cookie)}\n${localStorage.getItem(CHAVE_DAS_BOAS_VINDAS) ?? ""}`;
  } catch {
    return "";
  }
}
function assinarBoasVindas(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO_BOAS_VINDAS, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO_BOAS_VINDAS, aviso);
  };
}
function marcarBoasVindasVistas(entrada: string) {
  try {
    localStorage.setItem(CHAVE_DAS_BOAS_VINDAS, entrada);
  } catch {
    /* sem armazenamento: só não lembra */
  }
  window.dispatchEvent(new Event(EVENTO_BOAS_VINDAS));
}

/** Copiar com o fallback para o navegador que recusa a área de transferência. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

const ALTURA_MAXIMA_DO_CAMPO = 6 * 20 + 8; // seis linhas

/** Quanto tempo a Ceci fica com cara de "deu certo" depois de uma resposta ou proposta concluída. */
const TEMPO_DE_COMEMORAR = 2800;

/**
 * O chat de IA do canto inferior direito, em todas as telas internas
 * (redesenho de 02/10/2026 — referências do Untitled UI, "referência, não
 * cópia"). Desenho em Projects/Connect-41/Chat-de-IA-Redesign-2026-10-01.
 *
 * Desde 13/10/2026 quem atende é a Ceci, assistente do Connect (decisão do
 * Kauan): o mesmo rosto e o mesmo nome em todos os setores, com o setor
 * embaixo do nome — no lugar de "IA do BPO", "IA do DP"… O rosto muda com a
 * conversa: pensando enquanto a resposta chega, "deu certo" por um instante
 * depois de uma resposta ou proposta aplicada, e preocupada no erro.
 *
 * Só aparece para quem tem ao menos um agente disponível (`agentes`, calculado
 * no servidor pelo layout). A pergunta vai pela rota `/api/ia/chat`, que
 * devolve o passo atual e depois a resposta; o resto (histórico, aplicar
 * proposta) são server actions.
 */
export function ChatDeIA({
  agentes,
  nome,
}: {
  agentes: AgenteDoChat[];
  /** Nome de quem está usando — o "Oi, Camila" das boas-vindas. */
  nome: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [vendoHistorico, setVendoHistorico] = useState(false);
  // O agente escolhido; nulo = o padrão (o do setor ativo, primeiro da lista).
  // Derivado, e não copiado para o estado: trocar de setor muda o padrão sem
  // efeito nenhum.
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemNaTela[]>([]);
  const [conversas, setConversas] = useState<ConversaNaLista[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [passo, setPasso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  /** A resposta com os motivos do 👎 abertos. */
  const [motivosDe, setMotivosDe] = useState<string | null>(null);
  const [copiada, setCopiada] = useState<string | null>(null);
  // A pergunta sendo editada: o campo leva o texto dela, e ao enviar ela e o
  // que veio depois ficam substituídos.
  const [editando, setEditando] = useState<MensagemNaTela | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  // Anexos desta pergunta (02/10/2026): vão só com ela e não ficam guardados.
  const [arquivos, setArquivos] = useState<File[]>([]);
  const seletorDeArquivoRef = useRef<HTMLInputElement>(null);
  const jaAbriu = useSyncExternalStore(assinarJaAbriu, lerJaAbriu, () => true);
  // Boas-vindas e aviso de mensagem nova (13/10/2026). As boas-vindas esperam
  // dentro do chat — nunca o abrem sozinhas —, e o botão do canto avisa.
  const fotoBoasVindas = useSyncExternalStore(assinarBoasVindas, fotoDasBoasVindas, () => "");
  const [entradaDaFoto = "", vistaDaFoto = ""] = fotoBoasVindas.split("\n");
  const agenteDoSetor = agentes.find((a) => a.doSetorAtivo) ?? null;
  const boasVindasEsperando =
    fotoBoasVindas !== "" && boasVindasPendentes({ entrada: entradaDaFoto, vista: vistaDaFoto || null, temAgenteDoSetor: agenteDoSetor !== null });
  /** As boas-vindas aparecem como a primeira mensagem desta conversa nova. */
  const [boasVindasNaTela, setBoasVindasNaTela] = useState(false);
  /** A Ceci terminou de responder com o chat fechado. */
  const [respostaNaoLida, setRespostaNaoLida] = useState(false);
  const abertoRef = useRef(false);
  useEffect(() => {
    abertoRef.current = aberto;
  }, [aberto]);
  // O "deu certo" da Ceci: liga numa resposta ou proposta concluída e se
  // desliga sozinho — não é um estado da conversa, é uma reação.
  const [comemorando, setComemorando] = useState(false);
  const comemoracaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comemorar = useCallback(() => {
    if (comemoracaoRef.current) clearTimeout(comemoracaoRef.current);
    setComemorando(true);
    comemoracaoRef.current = setTimeout(() => setComemorando(false), TEMPO_DE_COMEMORAR);
  }, []);
  useEffect(
    () => () => {
      if (comemoracaoRef.current) clearTimeout(comemoracaoRef.current);
    },
    []
  );

  const agentePadrao = agentes[0]?.code ?? "";
  const agentCode = escolhido && agentes.some((a) => a.code === escolhido) ? escolhido : agentePadrao;

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, passo, aberto]);

  // Fechar pelo X, pelo Esc ou pelo clique fora devolve o foco ao botão do
  // canto, que volta no lugar do painel — sem isso o foco caía no <body> e
  // quem usa teclado recomeçava do topo da página (13/10/2026).
  const botaoRef = useRef<HTMLButtonElement>(null);
  const devolverFocoRef = useRef(false);
  const fecharChat = useCallback(() => {
    devolverFocoRef.current = true;
    setAberto(false);
  }, []);
  useEffect(() => {
    if (aberto || !devolverFocoRef.current) return;
    devolverFocoRef.current = false;
    botaoRef.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => {
      // Esc com um menu aberto por cima (o do agente, o ⋯) fecha só o menu:
      // o menu marca o Esc como usado.
      if (e.key === "Escape" && !e.defaultPrevented) fecharChat();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto, fecharChat]);

  // O campo cresce com o texto, de uma a seis linhas — e volta ao enviar.
  useLayoutEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAXIMA_DO_CAMPO)}px`;
  }, [pergunta, aberto]);

  // Aberta por um botão da tela (14/10/2026 — "Perguntar à Ceci sobre esta
  // vaga"; ver `src/lib/ia/chat/abrirCeci.ts`). O pedido traz o agente: a
  // conversa aberta com outro agente dá lugar a uma nova, porque o assunto da
  // tela só chega ao agente pedido. O assunto vai para o campo de pergunta,
  // enquanto a pessoa estiver na mesma página.
  const [assuntoDaTela, setAssuntoDaTela] = useState<{ texto: string; caminho: string } | null>(null);
  useEffect(
    () =>
      assinarPedidosParaAbrirCeci((pedido) => {
        const alvo = pedido.agente && agentes.some((a) => a.code === pedido.agente) ? pedido.agente : null;
        if (alvo && alvo !== agentCode) {
          if (conversaId || mensagens.length > 0) {
            setConversaId(null);
            setMensagens([]);
            setErro(null);
          }
          setBoasVindasNaTela(false);
          setEscolhido(alvo);
        }
        // As boas-vindas pendentes contam como vistas: quem abriu pelo botão já veio com o assunto.
        if (boasVindasEsperando) marcarBoasVindasVistas(entradaDaFoto);
        setAssuntoDaTela(pedido.assunto ? { texto: pedido.assunto, caminho: window.location.pathname } : null);
        setVendoHistorico(false);
        marcarJaAbriu();
        setRespostaNaoLida(false);
        setAberto(true);
        requestAnimationFrame(() => campoRef.current?.focus());
      }),
    [agentes, agentCode, conversaId, mensagens.length, boasVindasEsperando, entradaDaFoto]
  );

  if (agentes.length === 0) return null;
  const agente = agentes.find((a) => a.code === agentCode) ?? agentes[0]!;
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? "";
  const ultimaResposta = [...mensagens].reverse().find((x) => x.papel === "assistente");
  // Pensando ganha de tudo; depois o erro (o da tela ou a última resposta que
  // falhou); o "deu certo" só por um instante; senão, parada.
  const estadoDaCeci: EstadoDaCeci = enviando
    ? "pensando"
    : erro || mensagens.at(-1)?.falhou
      ? "naoConsegui"
      : comemorando
        ? "deuCerto"
        : "parada";
  // Resposta a uma pergunta com arquivo não tem Refazer: o arquivo não ficou guardado.
  const semRefazer = new Set<string>();
  let comArquivo = false;
  for (const x of mensagens) {
    if (x.papel === "usuario") comArquivo = separarAnexos(x.texto).anexos.length > 0;
    else if (comArquivo) semRefazer.add(x.id);
  }

  const novas = mensagensNovas({ boasVindasEsperando, respostaNaoLida });
  const aviso = rotuloDoAviso(novas);

  function abrirChat() {
    marcarJaAbriu();
    setRespostaNaoLida(false);
    if (boasVindasEsperando && agenteDoSetor) {
      marcarBoasVindasVistas(entradaDaFoto);
      // Só numa conversa nova: no meio de outra, a mensagem ficaria solta.
      if (!conversaId && mensagens.length === 0) {
        setBoasVindasNaTela(true);
        setEscolhido(agenteDoSetor.code);
      }
    }
    setAberto(true);
    requestAnimationFrame(() => campoRef.current?.focus());
  }

  function novaConversa() {
    setBoasVindasNaTela(false);
    setConversaId(null);
    setMensagens([]);
    setErro(null);
    setVendoHistorico(false);
    setEscolhido(null);
  }

  async function verHistorico() {
    setVendoHistorico(true);
    setConversas(await conversasDoChat());
  }

  async function abrir(id: string) {
    const r = await abrirConversaDoChat(id);
    if ("error" in r) {
      setErro(r.error);
      return;
    }
    setBoasVindasNaTela(false);
    setConversaId(id);
    setEscolhido(r.agentCode);
    setMensagens(r.mensagens);
    setErro(null);
    setVendoHistorico(false);
  }

  async function apagar(id: string) {
    await apagarConversaDoChat(id);
    setConversas((cs) => cs.filter((c) => c.id !== id));
    if (id === conversaId) novaConversa();
  }

  async function enviar(texto: string, comArquivos: File[] = []) {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    setPasso(comArquivos.length ? "Lendo os arquivos…" : "Pensando…");
    setPergunta("");
    setArquivos([]);
    // Recusada pelo servidor (arquivo grande, limite do dia): a pergunta e os
    // arquivos voltam para o campo, para tentar de novo.
    const devolver = () => {
      setPergunta(t);
      if (comArquivos.length) setArquivos(comArquivos);
    };
    // A última resposta chegou inteira? É o que faz a Ceci comemorar no fim.
    let respondeu = false;
    // Depois das boas-vindas com o "Oi, {nome}!", a primeira resposta não cumprimenta de novo.
    const jaCumprimentada = boasVindasNaTela && mensagens.length === 0;
    try {
      let pedido: RequestInit;
      if (comArquivos.length) {
        const form = new FormData();
        if (conversaId) form.set("conversaId", conversaId);
        form.set("agentCode", agentCode);
        form.set("pergunta", t);
        form.set("caminho", pathname);
        if (jaCumprimentada) form.set("jaCumprimentada", "1");
        for (const f of comArquivos) form.append("anexos", f);
        pedido = { method: "POST", body: form };
      } else {
        pedido = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversaId, agentCode, pergunta: t, caminho: pathname, jaCumprimentada }),
        };
      }
      const res = await fetch("/api/ia/chat", pedido);
      if (!res.body) throw new Error("Sem resposta do servidor.");
      const leitor = res.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const e = JSON.parse(linha) as Evento;
          if (e.tipo === "conversa") setConversaId(e.id);
          else if (e.tipo === "passo") setPasso(e.texto);
          else if (e.tipo === "mensagem") {
            setMensagens((ms) => [...ms, e.mensagem]);
            if (e.mensagem.papel === "usuario") setPasso("Pensando…");
            else {
              respondeu = !e.mensagem.falhou;
              // Respondeu com o chat fechado: o botão do canto avisa.
              setRespostaNaoLida((ja) => respostaNaoLidaDepois({ chatAberto: abertoRef.current, jaHavia: ja }));
            }
          } else if (e.tipo === "erro") {
            respondeu = false;
            setErro(e.texto);
            if (!res.ok) devolver();
          }
        }
      }
      if (respondeu) comemorar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu para falar com a Ceci agora. Tente de novo.");
      devolver();
    } finally {
      setPasso(null);
      setEnviando(false);
    }
  }

  async function aplicar(m: MensagemNaTela, indice: number) {
    setAplicando(`${m.id}:${indice}`);
    const r = await aplicarPropostaDoChat(m.id, indice);
    setAplicando(null);
    if ("error" in r) {
      setErro(r.error);
      return;
    }
    setMensagens((ms) =>
      ms.map((x) => (x.id === m.id ? { ...x, propostas: x.propostas.map((p, i) => (i === indice ? { ...p, aplicada: true } : p)) } : x))
    );
    comemorar();
    // A tela de trás mudou (a etapa foi concluída): recarrega o que ela mostra.
    router.refresh();
  }

  /** Tira da tela a mensagem e o que veio depois — o servidor já as marcou como substituídas. */
  function cortarDesde(id: string) {
    setMensagens((ms) => {
      const i = ms.findIndex((x) => x.id === id);
      return i >= 0 ? ms.slice(0, i) : ms;
    });
  }

  function comecarEdicao(m: MensagemNaTela) {
    setEditando(m);
    setPergunta(separarAnexos(m.texto).texto);
    requestAnimationFrame(() => campoRef.current?.focus());
  }

  function cancelarEdicao() {
    setEditando(null);
    setPergunta("");
  }

  /** O enviar do campo: com uma pergunta em edição, substitui antes de mandar. */
  async function enviarDoCampo(texto: string) {
    if (!texto.trim() || enviando) return;
    if (editando) {
      const alvo = editando;
      const r = await substituirDesdeAMensagem(alvo.id);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      cortarDesde(alvo.id);
      setEditando(null);
    }
    await enviar(texto, arquivos);
  }

  /** Os arquivos escolhidos no 📎 — conferidos aqui, e de novo no servidor. */
  function escolherArquivos(lista: FileList | null) {
    if (!lista?.length) return;
    const juntos = [...arquivos, ...Array.from(lista)];
    const problema = conferirEscolha(juntos);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setArquivos(juntos);
  }

  /** Refazer: a mesma pergunta de novo, no lugar da resposta (conta no limite do dia). */
  async function refazer(m: MensagemNaTela) {
    if (enviando) return;
    const i = mensagens.findIndex((x) => x.id === m.id);
    const anterior = mensagens.slice(0, i).reverse().find((x) => x.papel === "usuario");
    if (!anterior) return;
    const r = await substituirDesdeAMensagem(anterior.id);
    if ("error" in r) {
      setErro(r.error);
      return;
    }
    cortarDesde(anterior.id);
    await enviar(anterior.texto);
  }

  /** 👍/👎: muda na tela na hora e volta atrás se o servidor recusar. */
  async function avaliar(m: MensagemNaTela, avaliacao: Avaliacao | null, motivo: MotivoDoNao | null = null) {
    const trocar = (a: Avaliacao | null, mo: MotivoDoNao | null) =>
      setMensagens((ms) => ms.map((x) => (x.id === m.id ? { ...x, avaliacao: a, motivo: mo } : x)));
    trocar(avaliacao, motivo);
    const r = await avaliarRespostaDoChat(m.id, avaliacao, motivo);
    if ("error" in r) {
      setErro(r.error);
      trocar(m.avaliacao, m.motivo);
    }
  }

  function cliqueNoPolegar(m: MensagemNaTela, qual: Avaliacao) {
    // O mesmo polegar de novo tira a avaliação.
    if (m.avaliacao === qual) {
      setMotivosDe(null);
      void avaliar(m, null);
      return;
    }
    setMotivosDe(qual === "ruim" ? m.id : null);
    void avaliar(m, qual);
  }

  async function recusar(m: MensagemNaTela, indice: number) {
    setAplicando(`${m.id}:${indice}`);
    const r = await recusarPropostaDoChat(m.id, indice);
    setAplicando(null);
    if ("error" in r) {
      setErro(r.error);
      return;
    }
    setMensagens((ms) =>
      ms.map((x) => (x.id === m.id ? { ...x, propostas: x.propostas.map((p, i) => (i === indice ? { ...p, recusada: true } : p)) } : x))
    );
  }

  async function aplicarTodas(m: MensagemNaTela) {
    for (const [i, p] of m.propostas.entries()) {
      if (p.aplicada || p.recusada || p.ferramenta === SUGERIR_RESPOSTAS || p.ferramenta === "abrir_transferencia") continue;
      await aplicar(m, i);
    }
  }

  async function copiar(m: MensagemNaTela) {
    // A resposta vai como se lê na tela: sem os ** do Markdown, sem id e sem caminho.
    if (await copiarTexto(m.papel === "assistente" ? respostaEmTextoSimples(m.texto) || m.texto : m.texto)) {
      setCopiada(m.id);
      setTimeout(() => setCopiada((c) => (c === m.id ? null : c)), 1500);
    }
  }

  // ─── O botão do canto ─────────────────────────────────────────────────────
  //
  // Só a Ceci, 56 px no computador e 48 px no celular (pedido do Kauan,
  // 13/10/2026): o nome e o setor ocupavam espaço demais na pílula, e o
  // desenho sozinho, sem pílula, borda girando, fundo nem folga em volta, fica
  // mais visível. O anel do próprio desenho faz o papel de borda. A margem
  // que sobra dentro do desenho é a do nó girando no "pensando".
  //
  // Nome e setor continuam no `aria-label` e na dica ao passar o mouse (a
  // `DicaFlutuante`, por `data-dica`). O anel de foco é o de todo o Connect
  // (`:focus-visible` em globals.css): só no teclado, não no clique. A sombra
  // leve segue o contorno do desenho e existe para o anel não sumir sobre
  // fundo azul (`.c41-ceci-flutuante`). Até a primeira abertura, um brilho
  // suave respira atrás dela (`.c41-chamar`).
  //
  // Mensagem nova (13/10/2026) — as boas-vindas esperando, ou a resposta que
  // chegou com o chat fechado: o contador vermelho no canto do desenho, a Ceci
  // sorrindo e o aviso no nome acessível ("1 mensagem nova da Ceci"), que
  // também é anunciado quando aparece. Abrir o chat limpa.
  if (!aberto) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        {!jaAbriu && <span aria-hidden className="c41-chamar pointer-events-none absolute -inset-2" />}
        <button
          ref={botaoRef}
          type="button"
          onClick={abrirChat}
          aria-label={`Falar com a ${NOME_DA_ASSISTENTE}, assistente do Connect — ${agente.especialidade}${aviso ? `. ${aviso}` : ""}`}
          data-dica={`${NOME_DA_ASSISTENTE} · ${agente.especialidade}`}
          className="relative flex size-12 sm:size-14 rounded-full outline-none transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
        >
          <Ceci tamanho={56} estado={novas > 0 && estadoDaCeci === "parada" ? "deuCerto" : estadoDaCeci} className="c41-ceci-flutuante size-full" />
          {novas > 0 && <Contador valor={novas} tom="alerta" pequeno className="pointer-events-none absolute -top-0.5 -right-0.5 border-2 border-surface" />}
        </button>
        <span role="status" className="sr-only">
          {aviso ?? ""}
        </span>
      </div>
    );
  }

  // ─── O painel ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Clicar fora só fecha o chat (13/10/2026). Desde 02/10 o clique fora
          fechava, mas era um `mousedown` no documento: o clique seguia para o que
          estava embaixo, e um botão do Connect funcionava junto. Agora uma camada
          transparente cobre a página enquanto o chat está aberto — o mesmo
          desenho do fundo da gaveta do menu (AppShell), sem a cor — e o clique
          ou toque nela fecha e para ali. Fecha no `click`, e não no `mousedown`:
          sumir no meio do clique deixaria o soltar cair no que está embaixo.
          Os menus do chat (o ⋯, o agente) abrem por portal em z-[60], acima dela;
          no celular o painel ocupa a tela toda e a cobre. */}
      <div aria-hidden className="fixed inset-0 z-40" onClick={fecharChat} />
      <section
        className="fixed z-40 inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[420px] sm:h-[min(840px,calc(100dvh-2rem))] flex flex-col bg-surface-elevated sm:border sm:border-border sm:rounded-lg shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)] overflow-hidden"
        aria-label={`Chat com a ${NOME_DA_ASSISTENTE}`}
      >
        <header className="flex items-center gap-2.5 px-4 py-3">
          {vendoHistorico ? (
            <button type="button" onClick={() => setVendoHistorico(false)} className="p-1 -ml-1 rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover" aria-label="Voltar">
              <ArrowLeft size={16} />
            </button>
          ) : (
            <Ceci tamanho={32} estado={estadoDaCeci} />
          )}
          {vendoHistorico ? (
            <p className="flex-1 min-w-0 text-label font-semibold text-fg truncate">Conversas</p>
          ) : (
            // O nome e, embaixo, o setor que ela atende nesta conversa.
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-label font-semibold text-fg truncate">{NOME_DA_ASSISTENTE}</p>
              <p className="text-micro text-fg-muted truncate">{agente.especialidade}</p>
            </div>
          )}
          <Popover
            align="right"
            width={220}
            aria-label="Mais opções do chat"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover" aria-label="Mais opções" data-dica="Mais opções">
                <MoreHorizontal size={16} />
              </button>
            )}
          >
            {({ close }) => (
              <>
                <ItemDoMenu
                  icone={<Plus />}
                  onClick={() => {
                    close();
                    novaConversa();
                  }}
                >
                  Nova conversa
                </ItemDoMenu>
                <ItemDoMenu
                  icone={<History />}
                  onClick={() => {
                    close();
                    void verHistorico();
                  }}
                >
                  Conversas anteriores
                </ItemDoMenu>
              </>
            )}
          </Popover>
          <button type="button" onClick={fecharChat} className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover" aria-label="Fechar o chat">
            <X size={16} />
          </button>
        </header>
  
        {vendoHistorico ? (
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {conversas.length === 0 ? (
              <p className="p-3 text-ui text-fg-muted">Nenhuma conversa ainda. Elas ficam guardadas por 90 dias.</p>
            ) : (
              <ul className="flex flex-col">
                {conversas.map((c) => (
                  <li key={c.id} className="flex items-center gap-1 rounded-lg hover:bg-surface-hover">
                    <button type="button" onClick={() => abrir(c.id)} className="flex-1 min-w-0 text-left px-3 py-2.5">
                      <span className="block text-ui text-fg truncate">{c.titulo}</span>
                      <span className="block text-micro text-fg-muted">
                        {especialidadeDoAgente(c.agentCode) ?? NOME_DA_ASSISTENTE} ·{" "}
                        {formatInstantDateTime(new Date(c.atualizadaEm), { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </button>
                    <button type="button" onClick={() => apagar(c.id)} className="p-2 text-fg-muted hover:text-danger" aria-label="Apagar conversa" data-dica="Apagar">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-5">
              {/* As boas-vindas desta entrada (13/10/2026): a primeira mensagem da
                  conversa nova, com até três sugestões do setor. Texto local —
                  não vai ao modelo nem fica gravado. */}
              {boasVindasNaTela && agenteDoSetor && (
                <div className="flex items-start gap-2.5">
                  <Ceci tamanho={24} className="mt-0.5" estado="parada" />
                  <div className="min-w-0 flex-1 flex flex-col gap-2.5">
                    <p className="text-ui leading-relaxed text-fg">
                      {textoDasBoasVindas({ primeiroNome, especialidade: agenteDoSetor.especialidade })}
                    </p>
                    {mensagens.length === 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {sugestoesDasBoasVindas(agenteDoSetor.sugestoes).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={enviando}
                            onClick={() => void enviar(s)}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/40 bg-brand-subtle/50 px-3 py-1 text-left text-fs-2 font-medium text-brand hover:bg-brand-subtle disabled:opacity-[var(--c41-disabled-op)] transition-colors"
                          >
                            <MessageSquareText size={13} className="flex-shrink-0" />
                            <span className="min-w-0">{s}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mensagens.length === 0 && !enviando && !boasVindasNaTela && (
                <div className="flex flex-col items-center text-center pt-8 pb-2">
                  <Ceci tamanho={64} estado={estadoDaCeci} />
                  <p className="mt-4 text-section font-semibold text-fg">
                    {primeiroNome ? `Oi, ${primeiroNome}! Eu sou a ${NOME_DA_ASSISTENTE}.` : `Oi! Eu sou a ${NOME_DA_ASSISTENTE}.`}
                  </p>
                  <p className="text-body text-fg-secondary">Em que posso ajudar?</p>
                  <p className="mt-3 max-w-[300px] text-fs-2 text-fg-muted leading-relaxed">
                    Consulto o Connect com o mesmo acesso que você tem e <strong className="text-fg-secondary">não altero nada sozinha</strong> — sugestão
                    só vale depois do seu “Aplicar”.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {agente.sugestoes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => enviar(s)}
                        className="inline-flex items-center gap-1.5 max-w-full text-left text-fs-2 text-fg-secondary border border-border rounded-full px-3 py-1.5 hover:border-brand hover:text-brand transition-colors"
                      >
                        <MessageSquareText size={13} className="flex-shrink-0 text-brand" />
                        <span className="truncate">{s}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
  
              {mensagens.map((m) =>
                m.papel === "usuario" ? (
                  <div key={m.id} className="group self-end max-w-[85%] flex flex-col items-end gap-1">
                    <BalaoDaPergunta texto={m.texto} />
                    <span className="flex items-center gap-1.5">
                      {contextoParaMostrar(m.contexto) && (
                        <span className="text-micro text-fg-muted truncate max-w-[200px]">{contextoParaMostrar(m.contexto)}</span>
                      )}
                      <AcoesDaMensagem>
                        {!enviando && (
                          <BotaoDeAcao rotulo="Editar" onClick={() => comecarEdicao(m)}>
                            <Pencil size={13} />
                          </BotaoDeAcao>
                        )}
                        <BotaoDeAcao rotulo={copiada === m.id ? "Copiado" : "Copiar"} onClick={() => void copiar(m)}>
                          {copiada === m.id ? <Check size={13} /> : <Copy size={13} />}
                        </BotaoDeAcao>
                      </AcoesDaMensagem>
                    </span>
                  </div>
                ) : (
                  <div key={m.id} className="group flex items-start gap-2.5">
                    <Ceci
                      tamanho={24}
                      className="mt-0.5"
                      estado={m.falhou ? "naoConsegui" : m.id === ultimaResposta?.id && comemorando ? "deuCerto" : "parada"}
                    />
                    <div className="min-w-0 flex-1 flex flex-col gap-2">
                      {contextoParaMostrar(m.contexto) && <span className="c41-rotulo text-brand">{contextoParaMostrar(m.contexto)}</span>}
                      <div className={`text-ui leading-relaxed break-words ${m.falhou ? "rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-danger" : "text-fg"}`}>
                        <RespostaDaCeci texto={m.texto} citados={m.citados} aoNavegar={() => setAberto(false)} />
                      </div>
                      {m.truncada && (
                        <p className="flex items-start gap-1.5 text-micro text-warning-fg">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> A {NOME_DA_ASSISTENTE} parou antes de terminar — a resposta pode estar incompleta.
                        </p>
                      )}
                      <CartoesDeDecisao
                        m={m}
                        aplicando={aplicando}
                        onAplicar={(i) => void aplicar(m, i)}
                        onRecusar={(i) => void recusar(m, i)}
                        onAplicarTodas={() => void aplicarTodas(m)}
                        onAbrirTransferencia={() => setAberto(false)}
                      />
                      {/* Respostas rápidas: só na última resposta, e não enquanto a próxima está saindo. */}
                      {m.id === ultimaResposta?.id && !enviando && (
                        <RespostasRapidas opcoes={m.propostas.flatMap((p) => opcoesDeRespostaRapida(p))} onEscolher={(t) => void enviar(t)} />
                      )}
                      <AcoesDaMensagem fixo={m.avaliacao !== null}>
                        <BotaoDeAcao rotulo={copiada === m.id ? "Copiado" : "Copiar"} onClick={() => void copiar(m)}>
                          {copiada === m.id ? <Check size={13} /> : <Copy size={13} />}
                        </BotaoDeAcao>
                        {!enviando && !semRefazer.has(m.id) && (
                          <BotaoDeAcao rotulo="Refazer a resposta" onClick={() => void refazer(m)}>
                            <RotateCcw size={13} />
                          </BotaoDeAcao>
                        )}
                        {!m.falhou && (
                          <>
                            <BotaoDeAcao rotulo="Resposta útil" ativo={m.avaliacao === "boa"} onClick={() => cliqueNoPolegar(m, "boa")}>
                              <ThumbsUp size={13} />
                            </BotaoDeAcao>
                            <BotaoDeAcao rotulo="Resposta não ajudou" ativo={m.avaliacao === "ruim"} onClick={() => cliqueNoPolegar(m, "ruim")}>
                              <ThumbsDown size={13} />
                            </BotaoDeAcao>
                          </>
                        )}
                      </AcoesDaMensagem>
                      {motivosDe === m.id && m.avaliacao === "ruim" && (
                        <MotivosDoNao
                          escolhido={m.motivo}
                          onEscolher={(motivo) => {
                            setMotivosDe(null);
                            void avaliar(m, "ruim", motivo === m.motivo ? null : motivo);
                          }}
                          onFechar={() => setMotivosDe(null)}
                        />
                      )}
                    </div>
                  </div>
                )
              )}
  
              {passo && (
                <p className="flex items-center gap-2.5 text-fs-2 text-fg-muted">
                  <Ceci tamanho={24} estado="pensando" />
                  {passo}
                </p>
              )}
              {erro && <p className="text-fs-2 text-danger">{erro}</p>}
              <div ref={fimRef} />
            </div>
  
            {/* ── O campo: caixa arredondada, o enviar dentro, e embaixo o agente ── */}
            <form
              className="px-3 pb-3"
              onSubmit={(e) => {
                e.preventDefault();
                void enviarDoCampo(pergunta);
              }}
            >
              {editando && (
                <div className="mb-2 flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-fs-2 text-fg-secondary">
                  <Pencil size={13} className="mt-0.5 flex-shrink-0 text-warning-fg" />
                  <span className="flex-1">Editando a pergunta — o que veio depois dela será substituído ao enviar.</span>
                  <Button variant="ghost" size="xs" onClick={cancelarEdicao}>
                    Cancelar
                  </Button>
                </div>
              )}
              <div className="rounded-lg border border-border-strong bg-surface focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] transition-colors">
                {arquivos.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
                    {arquivos.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-1 pl-2 pr-1 text-fs-2 text-fg">
                        <FileText size={13} className="flex-shrink-0 text-brand" />
                        <span className="truncate">{f.name}</span>
                        <span className="flex-shrink-0 text-fg-muted tabular-nums">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                        <button
                          type="button"
                          onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}
                          aria-label={`Tirar ${f.name}`}
                          className="p-0.5 rounded-sm text-fg-muted hover:text-fg hover:bg-surface-hover"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <span className="text-micro text-fg-muted">Vale só para esta pergunta — não fica guardado.</span>
                  </div>
                )}
                <div className="flex items-end gap-2 pl-3.5 pr-2 pt-2.5">
                  <Textarea
                    ref={campoRef}
                    value={pergunta}
                    onChange={(e) => setPergunta(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviarDoCampo(pergunta);
                      } else if (e.key === "Escape" && editando) {
                        e.preventDefault();
                        cancelarEdicao();
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder={
                      assuntoDaTela && assuntoDaTela.caminho === pathname
                        ? `Pergunte à ${NOME_DA_ASSISTENTE} sobre ${assuntoDaTela.texto}…`
                        : `Pergunte à ${NOME_DA_ASSISTENTE}…`
                    }
                    className="min-h-0! flex-1 border-0! bg-transparent! px-0! py-1! text-label! leading-5 shadow-none! focus:shadow-none! focus-visible:shadow-none! overflow-y-auto"
                    aria-label="Pergunta"
                    disabled={enviando}
                  />
                  <button
                    type="submit"
                    disabled={enviando || !pergunta.trim()}
                    aria-label="Enviar"
                    className="mb-0.5 size-8 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-brand text-on-brand hover:bg-brand-hover disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed transition-colors"
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-1">
                  <SeletorDoAgente
                    agentes={agentes}
                    atual={agente}
                    travado={Boolean(conversaId)}
                    onEscolher={(code) => setEscolhido(code)}
                  />
                  <span className="flex items-center gap-2">
                    <input
                      ref={seletorDeArquivoRef}
                      type="file"
                      multiple
                      accept={ACEITA_NO_CAMPO}
                      className="hidden"
                      onChange={(e) => {
                        escolherArquivos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => seletorDeArquivoRef.current?.click()}
                      disabled={enviando}
                      title="PDF, imagem ou planilha — até 3 arquivos e 10 MB"
                      className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-fs-2 font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover disabled:opacity-[var(--c41-disabled-op)]"
                    >
                      <Paperclip size={13} /> Anexar
                    </button>
                  </span>
                </div>
              </div>
            </form>
          </>
        )}
      </section>
    </>
  );
}

/**
 * Em qual setor conversar, embaixo do campo — minimalista, como o "UUI v12.8 ▾"
 * da referência. Só aparece com mais de um agente; com a conversa começada,
 * mostra o setor travado, porque a conversa pertence a um agente. Desde a Ceci
 * (13/10/2026) a lista é de setores: quem atende é sempre ela.
 */
function SeletorDoAgente({
  agentes,
  atual,
  travado,
  onEscolher,
}: {
  agentes: AgenteDoChat[];
  atual: AgenteDoChat;
  travado: boolean;
  onEscolher: (code: string) => void;
}) {
  if (agentes.length < 2) return <span />;
  if (travado) {
    return (
      <span className="px-1.5 text-fs-2 text-fg-muted" title="Esta conversa é deste setor. Para falar de outro, comece uma nova.">
        {atual.especialidade}
      </span>
    );
  }
  return (
    <Popover
      width={220}
      aria-label="Em qual setor conversar"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-fs-2 font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover"
        >
          {atual.especialidade}
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col">
          {agentes.map((a) => (
            <ItemDoMenu
              key={a.code}
              icone={a.code === atual.code ? <Check /> : <span className="inline-block w-3.5" />}
              onClick={() => {
                onEscolher(a.code);
                close();
              }}
            >
              {a.especialidade}
            </ItemDoMenu>
          ))}
        </div>
      )}
    </Popover>
  );
}

/**
 * As propostas da resposta como cartões de decisão (02/10/2026): a descrição e
 * os botões dentro da resposta — Sim/Não, ou Aprovar/Recusar na candidatura.
 * A transferência continua indo ao formulário preenchido, para revisar antes.
 * Nada foi feito enquanto ninguém clica.
 */
function CartoesDeDecisao({
  m,
  aplicando,
  onAplicar,
  onRecusar,
  onAplicarTodas,
  onAbrirTransferencia,
}: {
  m: MensagemNaTela;
  aplicando: string | null;
  onAplicar: (indice: number) => void;
  onRecusar: (indice: number) => void;
  onAplicarTodas: () => void;
  onAbrirTransferencia: () => void;
}) {
  const cartoes = m.propostas.map((p, i) => ({ p, i })).filter(({ p }) => p.ferramenta !== SUGERIR_RESPOSTAS);
  if (cartoes.length === 0) return null;
  const pendentes = cartoes.filter(({ p }) => !p.aplicada && !p.recusada && p.ferramenta !== "abrir_transferencia");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="c41-rotulo">Sugestões — nada foi feito ainda</p>
        {pendentes.length > 1 && (
          <Button variant="secondary" size="xs" onClick={onAplicarTodas} disabled={aplicando !== null}>
            Aplicar todas
          </Button>
        )}
      </div>
      {cartoes.map(({ p, i }) => {
        const rotulos = rotulosDaDecisao(p.ferramenta);
        const ocupado = aplicando === `${m.id}:${i}`;
        return (
          <div key={i} className={`rounded-lg border px-3 py-2.5 ${p.aplicada ? "border-success/40 bg-success-bg/40" : p.recusada ? "border-border bg-surface-2/40" : "border-border bg-surface"}`}>
            <p className={`text-ui ${p.recusada ? "text-fg-muted line-through" : "text-fg"}`}>{descreverProposta(p)}</p>
            <div className="mt-2 flex items-center justify-end gap-2">
              {p.ferramenta === "abrir_transferencia" ? (
                // Não aplica daqui: abre o formulário preenchido, e a pessoa
                // revisa empresa, setores e texto antes de mandar.
                <Button size="xs" variant="secondary" href={`/transferencias/novo?daIa=${m.id}&indice=${i}`} onClick={onAbrirTransferencia}>
                  Revisar e abrir
                </Button>
              ) : p.aplicada ? (
                <span className="inline-flex items-center gap-1 text-fs-2 font-medium text-success-fg">
                  <Check size={13} /> Aplicado
                </span>
              ) : p.recusada ? (
                <span className="text-fs-2 text-fg-muted">Recusado</span>
              ) : (
                <>
                  <Button size="xs" variant="secondary" disabled={ocupado} onClick={() => onRecusar(i)}>
                    <X size={12} /> {rotulos.nao}
                  </Button>
                  <Button size="xs" disabled={ocupado} onClick={() => onAplicar(i)}>
                    <Check size={12} /> {ocupado ? "Aplicando…" : rotulos.sim}
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-micro text-fg-muted">Precisa de outra opção? É só dizer.</p>
    </div>
  );
}

/** Os botões que a IA ofereceu para a próxima resposta — o clique manda o texto. */
/**
 * Depois do 👎: o motivo, opcional, e o aviso de para onde a resposta vai —
 * o painel de `/admin/ia` mostra as respostas com 👎, sem o nome de quem marcou.
 */
function MotivosDoNao({
  escolhido,
  onEscolher,
  onFechar,
}: {
  escolhido: MotivoDoNao | null;
  onEscolher: (motivo: MotivoDoNao) => void;
  onFechar: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5" role="group" aria-label="Por que não ajudou">
      <div className="flex items-center justify-between gap-2">
        <p className="text-fs-2 font-medium text-fg">
          O que não foi bom? <span className="font-normal text-fg-muted">Opcional</span>
        </p>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="p-0.5 rounded-sm text-fg-muted hover:text-fg hover:bg-surface-hover">
          <X size={13} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(MOTIVOS_DO_NAO) as [MotivoDoNao, string][]).map(([codigo, rotulo]) => (
          <button
            key={codigo}
            type="button"
            onClick={() => onEscolher(codigo)}
            aria-pressed={escolhido === codigo}
            className={`rounded-full border px-3 py-1 text-fs-2 font-medium transition-colors ${
              escolhido === codigo ? "border-brand-solid bg-brand-solid text-on-brand" : "border-border bg-surface text-fg-secondary hover:text-fg hover:border-border-strong"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      <p className="text-micro text-fg-muted">
        Esta pergunta e a resposta vão para a revisão dos administradores da IA, sem o seu nome e sem o resto da conversa.
      </p>
    </div>
  );
}

function RespostasRapidas({ opcoes, onEscolher }: { opcoes: string[]; onEscolher: (texto: string) => void }) {
  if (opcoes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onEscolher(o)}
          className="max-w-full truncate rounded-full border border-brand/40 bg-brand-subtle/50 px-3 py-1 text-fs-2 font-medium text-brand hover:bg-brand-subtle transition-colors"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * A barrinha de ações da mensagem: aparece no hover; no toque, sempre visível.
 * `fixo` a deixa à vista no computador também (resposta já avaliada).
 */
function AcoesDaMensagem({ children, fixo = false }: { children: React.ReactNode; fixo?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 transition-opacity ${fixo ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"}`}
    >
      {children}
    </span>
  );
}

function BotaoDeAcao({
  rotulo,
  onClick,
  ativo,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  /** Botão de liga/desliga (👍/👎): marca o estado. */
  ativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      aria-pressed={ativo}
      data-dica={rotulo}
      className={`size-6 inline-flex items-center justify-center rounded-md hover:bg-surface-hover ${ativo ? "text-brand bg-brand/10" : "text-fg-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );
}
