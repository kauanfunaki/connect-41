"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { CartaoDeConversa, ColunaDaLista, RecortesDaCaixa } from "@/components/conversas/caixa/Caixa";
import { useCaixaDoWhatsapp } from "@/components/whatsapp/contextoDaCaixa";
import { quandoCurto } from "@/lib/conversas/caixa";
import {
  situacaoDaConversa,
  telefoneLegivel,
  resumoDoLote,
  MAX_NO_LOTE,
  SITUACAO_LABEL,
  SITUACAO_TOM,
  type AcaoEmLote,
  type ResultadoDoLote,
} from "@/lib/whatsapp/conversas";
import { RECORTES, contarRecortes, hrefDaConversa, hrefDoRecorte } from "@/lib/whatsapp/caixa";
import { DESFECHOS, DESFECHOS_DA_TELA } from "@/lib/whatsapp/atendimentos";
import { agirEmLote } from "@/app/(app)/whatsapp/actions";

/** O valor do seletor de transferência que quer dizer "o assistente". */
const ASSISTENTE = "__assistente__";

/**
 * A lista do atendimento em cartões (09/10/2026, desenho da caixa de
 * conversas): as abas do recorte, a busca, os cartões. A busca filtra na hora;
 * "Selecionar" liga as caixas do lote — transferir ou encerrar várias de uma
 * vez, como antes.
 *
 * Mora no layout de /whatsapp (14/10/2026) e lê tudo da `CaixaDoWhatsapp`:
 * abrir outra conversa não a remonta, e a rolagem, a busca, a aba e a seleção
 * ficam como estavam.
 */
export function ConversasLista() {
  const router = useRouter();
  const { conversas: todas, doRecorte: conversas, visiveis, recorte, busca, setBusca, agora, userId, pessoas, abertaId } = useCaixaDoWhatsapp();
  const filtrada = recorte !== "todas";
  const [selecionando, setSelecionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [para, setPara] = useState("");
  const [desfecho, setDesfecho] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<{ texto: string; puladas: ResultadoDoLote["puladas"]; erro: boolean } | null>(null);
  const contagem = contarRecortes(todas, userId);

  // Passando de conversa pelo ↑↓, o cartão aberto pode sair da área à vista:
  // a lista rola só o necessário para mostrá-lo.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abertaId) return;
    raiz.current?.querySelector(`[data-cartao="${CSS.escape(abertaId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [abertaId]);

  // A seleção vale só para o que está na tela: trocar de recorte ou buscar não
  // leva junto conversa escondida.
  const ids = new Set(visiveis.map((c) => c.id));
  const selecionadas = [...marcadas].filter((id) => ids.has(id));
  const todasMarcadas = visiveis.length > 0 && selecionadas.length === visiveis.length;

  function alternar(id: string) {
    setRetorno(null);
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function sairDaSelecao() {
    setSelecionando(false);
    setMarcadas(new Set());
    setPara("");
    setDesfecho("");
  }

  async function aplicar(acao: AcaoEmLote) {
    setOcupado(true);
    setRetorno(null);
    const r = await agirEmLote(selecionadas, acao);
    setOcupado(false);
    if ("error" in r) {
      setRetorno({ texto: r.error, puladas: [], erro: true });
      return;
    }
    setRetorno({ texto: resumoDoLote(r, acao.tipo), puladas: r.puladas, erro: false });
    sairDaSelecao();
    router.refresh();
  }

  // As abas, a busca e os cartões com a mesma largura (pedido do Kauan,
  // 14/10/2026): as abas dividem a linha, a busca estica e o "Selecionar"
  // encosta à direita. O alinhamento com a barra de rolagem é da `ColunaDaLista`.
  const topo = (
    <>
      <RecortesDaCaixa
        itens={RECORTES.map((r) => ({
          rotulo: r.rotulo,
          n: contagem[r.chave],
          href: hrefDoRecorte(abertaId, r.chave),
          ativo: r.chave === recorte,
          tom: r.chave === "sem_responsavel" ? "atencao" : undefined,
        }))}
        // Só a URL muda: a lista inteira já está aqui, e o painel não recarrega.
        aoEscolher={(href) => window.history.pushState(null, "", href)}
      />
      <div className="flex items-center gap-2">
        <CampoDeBusca
          compact
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome, telefone ou vaga"
          aria-label="Buscar conversa"
          className="flex-1 min-w-0"
        />
        {conversas.length > 0 &&
          (selecionando ? (
            <Button size="sm" variant="ghost" onClick={sairDaSelecao}>
              <X size={14} /> Cancelar
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setSelecionando(true)} title="Transferir ou encerrar várias">
              <CheckSquare size={14} /> Selecionar
            </Button>
          ))}
      </div>
    </>
  );

  const lote =
    selecionando && (
      <div className="rounded-lg border border-brand/40 bg-surface shadow-[var(--c41-shadow-xs)] p-3 flex flex-col gap-2" role="toolbar" aria-label="Ações nas conversas selecionadas">
        <Checkbox
          id="marcar-todas"
          checked={todasMarcadas}
          onChange={() => {
            setRetorno(null);
            setMarcadas(todasMarcadas ? new Set() : new Set(visiveis.slice(0, MAX_NO_LOTE).map((c) => c.id)));
          }}
          label={selecionadas.length > 0 ? `${selecionadas.length} selecionada${selecionadas.length === 1 ? "" : "s"}` : "Selecionar todas"}
        />
        {selecionadas.length > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <Select compact aria-label="Transferir para" value={para} onChange={(e) => setPara(e.target.value)} className="flex-1 min-w-0">
                <option value="">Transferir para…</option>
                <option value={ASSISTENTE}>O assistente</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === userId ? `${p.nome} (você)` : p.nome}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado || !para}
                onClick={() => aplicar(para === ASSISTENTE ? { tipo: "devolver" } : { tipo: "transferir", paraId: para })}
              >
                Transferir
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Select compact aria-label="Encerrar como" value={desfecho} onChange={(e) => setDesfecho(e.target.value)} className="flex-1 min-w-0">
                <option value="">Encerrar como…</option>
                {DESFECHOS_DA_TELA.map((d) => (
                  <option key={d} value={d}>
                    {DESFECHOS[d]}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="secondary" disabled={ocupado || !desfecho} onClick={() => aplicar({ tipo: "encerrar", desfecho })}>
                Encerrar
              </Button>
            </div>
            <p className="text-micro text-fg-muted">
              Nada é enviado aos candidatos. Cada conversa passa pela mesma regra de quando é feita uma por vez — a que não puder, fica de
              fora com o motivo.
            </p>
          </>
        )}
      </div>
    );

  const avisoDoLote = retorno && (
    <div
      role="status"
      className={`rounded-md border px-3 py-2 text-ui ${retorno.erro ? "border-danger/30 bg-danger/5 text-danger" : "border-border bg-surface text-fg"}`}
    >
      <p>{retorno.texto}</p>
      {retorno.puladas.length > 0 && (
        <ul className="mt-1 text-fs-2 text-fg-secondary">
          {retorno.puladas.map((p, i) => (
            <li key={`${p.nome}-${i}`}>
              {p.nome}: {p.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const cartoes =
    visiveis.length === 0 ? (
      <EmptyState
        title={busca ? "Nada encontrado" : filtrada ? "Nada neste recorte" : "Nenhuma conversa ainda"}
        description={
          busca
            ? "Busque pelo nome, pelo telefone ou pela vaga."
            : filtrada
              ? "Nenhuma conversa se encaixa aqui agora."
              : "Quando um candidato escrever para o número do Recrutamento, a conversa aparece aqui."
        }
        icon={<MessageSquare />}
      />
    ) : (
      visiveis.map((c) => {
        const situacao = situacaoDaConversa(c, agora);
        const nome = c.nome ?? telefoneLegivel(c.waPhone);
        const comQuem = c.responsavel
          ? c.responsavel.id === userId
            ? "com você"
            : `com ${c.responsavel.nome}`
          : c.handoffAt && !c.optedOutAt
            ? "ninguém assumiu"
            : null;
        return (
          <CartaoDeConversa
            key={c.id}
            href={hrefDaConversa(c.id, recorte)}
            nome={nome}
            nomeDasIniciais={c.nome}
            selo={{ tom: SITUACAO_TOM[situacao], texto: SITUACAO_LABEL[situacao] }}
            quando={quandoCurto(c.ultimaMensagemEm, agora)}
            contexto={
              <>
                {comQuem && <span className={comQuem === "ninguém assumiu" ? "text-danger font-medium" : undefined}>{comQuem}</span>}
                {comQuem && (c.vaga || c.nome) && " · "}
                {c.vaga ?? (c.nome ? telefoneLegivel(c.waPhone) : null)}
              </>
            }
            previa={c.ultimaMensagem}
            naoLidas={c.naoRespondidas}
            rotuloDasNaoLidas={c.naoRespondidas === 1 ? "mensagem sem resposta" : "mensagens sem resposta"}
            selecionada={c.id === abertaId}
            ancora={c.id}
            antes={
              selecionando ? (
                <label className="flex items-start pl-3 pt-3.5 cursor-pointer">
                  <Checkbox checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} aria-label={`Selecionar a conversa com ${nome}`} />
                </label>
              ) : undefined
            }
          />
        );
      })
    );

  return (
    // `contents`: a caixa não existe para o layout, só para achar o cartão aberto.
    <div ref={raiz} className="contents">
      <ColunaDaLista topo={topo} rodape={lote || undefined}>
        {avisoDoLote}
        {cartoes}
      </ColunaDaLista>
    </div>
  );
}
