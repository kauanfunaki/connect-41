"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, MessageSquare, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CartaoDeConversa, ColunaDaLista } from "@/components/conversas/caixa/Caixa";
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
import { DESFECHOS, DESFECHOS_DA_TELA } from "@/lib/whatsapp/atendimentos";
import { agirEmLote } from "@/app/(app)/whatsapp/actions";
import type { LinhaDeConversa } from "@/lib/whatsapp/data";
import type { PessoaDoAtendimento } from "@/lib/whatsapp/equipe";

type Props = {
  conversas: LinhaDeConversa[];
  /** Agora, do servidor — o relógio do navegador pode estar noutro fuso. */
  agora: Date;
  /** Quem está olhando: "com você" em vez do próprio nome. */
  userId: string;
  /** A lista é um recorte (minhas, sem responsável): vazio não é "nenhuma conversa". */
  filtrada?: boolean;
  /** Para quem dá para transferir — quem atende o WhatsApp do setor. */
  pessoas: PessoaDoAtendimento[];
  /** A conversa aberta no painel, para o cartão acender. */
  abertaId?: string | null;
  /** O recorte da URL (`?ver=`), que o cartão leva junto ao abrir. */
  sufixo: string;
};

/** O valor do seletor de transferência que quer dizer "o assistente". */
const ASSISTENTE = "__assistente__";

/**
 * A lista do atendimento em cartões (09/10/2026, desenho da caixa de
 * conversas). A busca filtra na hora; "Selecionar" liga as caixas do lote —
 * transferir ou encerrar várias de uma vez, como antes.
 */
export function ConversasLista({ conversas, agora, userId, filtrada = false, pessoas, abertaId, sufixo }: Props) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [selecionando, setSelecionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [para, setPara] = useState("");
  const [desfecho, setDesfecho] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<{ texto: string; puladas: ResultadoDoLote["puladas"]; erro: boolean } | null>(null);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const digitos = t.replace(/\D/g, "");
    if (!t) return conversas;
    return conversas.filter(
      (c) =>
        (c.nome ?? "").toLowerCase().includes(t) ||
        (c.vaga ?? "").toLowerCase().includes(t) ||
        (digitos.length >= 3 && c.waPhone.includes(digitos))
    );
  }, [busca, conversas]);

  // A seleção vale só para o que está na tela: trocar de recorte ou buscar não
  // leva junto conversa escondida.
  const ids = new Set(visiveis.map((c) => c.id));
  const selecionadas = [...marcadas].filter((id) => ids.has(id));
  const todas = visiveis.length > 0 && selecionadas.length === visiveis.length;

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

  const topo = (
    <div className="flex items-center gap-2 mb-2">
      <Input
        compact
        type="search"
        icon={<Search size={14} />}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Nome, telefone ou vaga"
        aria-label="Buscar conversa"
        className="flex-1"
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
  );

  const lote =
    selecionando && (
      <div className="rounded-lg border border-brand/40 bg-surface shadow-[var(--c41-shadow-xs)] p-3 flex flex-col gap-2" role="toolbar" aria-label="Ações nas conversas selecionadas">
        <Checkbox
          id="marcar-todas"
          checked={todas}
          onChange={() => {
            setRetorno(null);
            setMarcadas(todas ? new Set() : new Set(visiveis.slice(0, MAX_NO_LOTE).map((c) => c.id)));
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

  return (
    <ColunaDaLista topo={topo} rodape={lote || undefined}>
      {avisoDoLote}
      {visiveis.length === 0 ? (
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
              href={`/whatsapp/${c.id}${sufixo}`}
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
      )}
    </ColunaDaLista>
  );
}
