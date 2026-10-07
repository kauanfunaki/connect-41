"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { formatInstantDateTime } from "@/lib/format";
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
};

/** O valor do seletor de transferência que quer dizer "o assistente". */
const ASSISTENTE = "__assistente__";

export function ConversasLista({ conversas, agora, userId, filtrada = false, pessoas }: Props) {
  const router = useRouter();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [para, setPara] = useState("");
  const [desfecho, setDesfecho] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<{ texto: string; puladas: ResultadoDoLote["puladas"]; erro: boolean } | null>(null);

  if (conversas.length === 0 && filtrada) {
    return <EmptyState title="Nada neste recorte" description="Nenhuma conversa se encaixa aqui agora." icon={<MessageSquare />} />;
  }
  if (conversas.length === 0) {
    return (
      <EmptyState
        title="Nenhuma conversa ainda"
        description="Quando um candidato escrever para o número do Recrutamento, a conversa aparece aqui."
        icon={<MessageSquare />}
      />
    );
  }

  // A seleção vale só para o que está na tela: trocar de recorte não leva junto
  // conversa escondida.
  const visiveis = new Set(conversas.map((c) => c.id));
  const selecionadas = [...marcadas].filter((id) => visiveis.has(id));
  const todas = selecionadas.length === conversas.length;

  function alternar(id: string) {
    setRetorno(null);
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function alternarTodas() {
    setRetorno(null);
    setMarcadas(todas ? new Set() : new Set(conversas.slice(0, MAX_NO_LOTE).map((c) => c.id)));
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
    setMarcadas(new Set());
    setPara("");
    setDesfecho("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {/* A barra do lote: fica no topo enquanto se rola a lista. */}
      <div
        className={`sticky top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 transition-colors ${
          selecionadas.length > 0 ? "border-brand/40 bg-surface shadow-[var(--c41-shadow-xs)]" : "border-transparent"
        }`}
        role="toolbar"
        aria-label="Ações nas conversas selecionadas"
      >
        <Checkbox
          id="marcar-todas"
          checked={todas}
          onChange={alternarTodas}
          label={selecionadas.length > 0 ? `${selecionadas.length} selecionada${selecionadas.length === 1 ? "" : "s"}` : "Selecionar todas"}
        />
        {selecionadas.length > 0 && (
          <>
            <span className="hidden sm:block h-5 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-1.5">
              <Select compact aria-label="Transferir para" value={para} onChange={(e) => setPara(e.target.value)} className="w-52">
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
              <Select compact aria-label="Encerrar como" value={desfecho} onChange={(e) => setDesfecho(e.target.value)} className="w-56">
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
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setMarcadas(new Set())} className="ml-auto">
              <X size={14} /> Limpar
            </Button>
            <p className="basis-full text-[length:var(--fs-micro)] text-fg-muted">
              Nada é enviado aos candidatos. Cada conversa passa pela mesma regra de quando é feita uma por vez — a que não
              puder, fica de fora com o motivo.
            </p>
          </>
        )}
      </div>

      {retorno && (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-[length:var(--fs-ui)] ${retorno.erro ? "border-danger/30 bg-danger/5 text-danger" : "border-border bg-surface text-fg"}`}
        >
          <p>{retorno.texto}</p>
          {retorno.puladas.length > 0 && (
            <ul className="mt-1 text-[length:var(--fs-2)] text-fg-secondary">
              {retorno.puladas.map((p, i) => (
                <li key={`${p.nome}-${i}`}>
                  {p.nome}: {p.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {conversas.map((c) => {
        const situacao = situacaoDaConversa(c, agora);
        const marcada = marcadas.has(c.id);
        return (
          // A borda acende no hover, como os cartões das outras filas (30/09).
          <Card
            key={c.id}
            className={`p-0 overflow-hidden flex items-stretch transition-colors ${marcada ? "border-brand/60 bg-brand/5" : "hover:border-brand/40"}`}
          >
            {/* A caixa fora do link: marcar não abre a conversa. */}
            <label className="flex items-start pl-3.5 pr-1 pt-4 cursor-pointer">
              <Checkbox
                checked={marcada}
                onChange={() => alternar(c.id)}
                aria-label={`Selecionar a conversa com ${c.nome ?? telefoneLegivel(c.waPhone)}`}
              />
            </label>
            <Link href={`/whatsapp/${c.id}`} className="block flex-1 min-w-0 p-3.5 pl-2.5 hover:bg-surface-hover transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{c.nome ?? telefoneLegivel(c.waPhone)}</span>
                    <Selo tom={SITUACAO_TOM[situacao]}>{SITUACAO_LABEL[situacao]}</Selo>
                    {c.responsavel ? (
                      <span className="text-[length:var(--fs-micro)] text-fg-secondary">
                        {c.responsavel.id === userId ? "com você" : `com ${c.responsavel.nome}`}
                      </span>
                    ) : (
                      c.handoffAt &&
                      !c.optedOutAt && <span className="text-[length:var(--fs-micro)] text-danger font-medium">ninguém assumiu</span>
                    )}
                    {c.naoRespondidas > 0 && (
                      <span className="text-[length:var(--fs-micro)] text-danger font-medium">
                        {c.naoRespondidas === 1 ? "1 sem resposta" : `${c.naoRespondidas} sem resposta`}
                      </span>
                    )}
                  </div>
                  {/* Sem vínculo, o telefone é a única identidade que temos —
                      e quem vai atender precisa dele à mão para ligar. */}
                  {c.nome && (
                    <p className="text-[length:var(--fs-micro)] text-fg-muted mt-0.5">
                      {telefoneLegivel(c.waPhone)}
                      {c.vaga && ` · ${c.vaga}`}
                    </p>
                  )}
                  {c.ultimaMensagem && <p className="text-[length:var(--fs-ui)] text-fg-secondary mt-1 truncate max-w-[52ch]">{c.ultimaMensagem}</p>}
                  {c.handoffReason && <p className="text-[length:var(--fs-micro)] text-warning mt-1">passou para você: {c.handoffReason}</p>}
                </div>
                <span className="text-[length:var(--fs-micro)] text-fg-muted whitespace-nowrap tabular-nums shrink-0">
                  {c.ultimaMensagemEm ? formatInstantDateTime(c.ultimaMensagemEm) : "—"}
                </span>
              </div>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
