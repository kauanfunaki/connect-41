"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/useConfirm";
import { AcoesFiscais, CampoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { DECISOES, lerCompetencias, normalizarDecimal, rotuloDoCampo, textoDoValor, type CampoDeDecisao, type TipoDeDecisao } from "@/lib/fiscal/motor/decisoes";
import { apagarDecisaoNoMotor, criarDecisaoNoMotor, gravarDecisaoNoMotor } from "@/app/(app)/fiscal/decisoes-actions";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

export type LinhaDeDecisao = { chave: Record<string, unknown>; valor: Record<string, unknown>; natureza?: unknown; decidido_por: string | null; atualizado_em: string | null };

type Edicao = { modo: "nova" } | { modo: "editar"; linhas: LinhaDeDecisao[] };

const dataHora = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—");

/** Só os campos da chave que a definição conhece — o GET pode trazer mais. */
function chaveLimpa(tipo: TipoDeDecisao, chave: Record<string, unknown>) {
  return Object.fromEntries(DECISOES[tipo].chave.map((c) => [c.nome, chave[c.nome]]));
}
const idDaLinha = (l: LinhaDeDecisao) => JSON.stringify(l.chave);

/**
 * Uma lista de decisões do motor (API-CONNECT §5), para qualquer tipo: as
 * linhas atuais com quem decidiu e quando, a edição de uma ou de várias
 * (lote, tudo ou nada no motor), apagar quando o tipo permite e a criação.
 * O que não muda fica ausente do corpo — no motor, ausente é "não mexer".
 */
export function TabelaDeDecisoes({ tipo, raiz, linhas, permiteAgir, permiteExcluir, estabelecimentos, competencia }: {
  tipo: TipoDeDecisao;
  raiz: string;
  linhas: LinhaDeDecisao[];
  permiteAgir: boolean;
  permiteExcluir: boolean;
  estabelecimentos: { cnpj: string; rotulo: string }[];
  competencia: string;
}) {
  const def = DECISOES[tipo];
  const router = useRouter();
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const { dialog, requestConfirm } = useConfirm();
  const nomeDoEstab = useMemo(() => new Map(estabelecimentos.map((e) => [e.cnpj, e.rotulo])), [estabelecimentos]);
  const marcadas = linhas.filter((l) => selecionadas.includes(idDaLinha(l)));
  const apagavel = def.apagar && permiteAgir && permiteExcluir;

  const celula = (l: LinhaDeDecisao, nome: string) => {
    const bruto = nome === "natureza" ? l.natureza ?? l.valor.natureza : nome in l.chave ? l.chave[nome] : l.valor[nome];
    const campo = [...def.chave, ...def.valor].find((c) => c.nome === nome);
    if (campo?.estabelecimento && typeof bruto === "string") return nomeDoEstab.get(bruto) ?? bruto;
    return textoDoValor(def, nome, bruto);
  };

  const apagar = (alvo: LinhaDeDecisao[]) => requestConfirm({
    title: alvo.length === 1 ? "Apagar esta decisão?" : `Apagar ${alvo.length} decisões?`,
    description: "O motor volta a usar o que vem do documento. A remoção fica no registro de decisões.",
    confirmLabel: "Apagar", destructive: true,
  }, async () => {
    const corpo = alvo.length === 1 ? { chave: chaveLimpa(tipo, alvo[0].chave) } : { chaves: alvo.map((l) => chaveLimpa(tipo, l.chave)) };
    const r = await apagarDecisaoNoMotor({ raiz, tipo, ...corpo, idempotencia: chave });
    depoisDe(r);
    if (!r.ok) throw new Error(r.mensagem);
    setAviso({ ok: true, texto: r.mensagem });
    setSelecionadas([]);
    router.refresh();
  });

  return <div className="space-y-3">
    {aviso && <div role={aviso.ok ? "status" : "alert"}><Aviso tom={aviso.ok ? "sucesso" : "atencao"}>{aviso.texto}</Aviso></div>}
    {permiteAgir && <div className="flex flex-wrap items-center gap-2">
      {def.criar && <Button size="sm" onClick={() => setEdicao({ modo: "nova" })}>{def.criarPorPost ? "Lançar ajuste" : "Nova decisão"}</Button>}
      {marcadas.length > 0 && <>
        <span className="text-ui text-fg-secondary tabular-nums">{marcadas.length} selecionada(s)</span>
        <Button size="sm" variant="secondary" onClick={() => setEdicao({ modo: "editar", linhas: marcadas })}>Editar selecionadas</Button>
        {apagavel && <Button size="sm" variant="danger" onClick={() => apagar(marcadas)}>Apagar selecionadas</Button>}
        <Button size="sm" variant="ghost" onClick={() => setSelecionadas([])}>Desmarcar</Button>
      </>}
    </div>}
    <TabelaFiscal vazio="Nenhuma decisão neste recorte." descricaoVazio={def.filtros.includes("competencia") ? `Competência ${competencia}. Sem decisão gravada, o motor usa o que vem do documento.` : "Sem decisão gravada, o motor usa o que vem do documento."}
      colunas={[...(permiteAgir ? ["Selecionar"] : []), ...def.colunas.map((c) => rotuloDoCampo(def, c)), "Decidido por", ...(permiteAgir ? ["Ações"] : [])]}
      linhas={linhas.map((l) => {
        const id = idDaLinha(l);
        return { id, celulas: [
          ...(permiteAgir ? [<Checkbox key="sel" aria-label={`Selecionar decisão ${def.chave.map((c) => texto(l.chave[c.nome])).filter(Boolean).join(" · ")}`.trim()} checked={selecionadas.includes(id)} onChange={() => setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />] : []),
          ...def.colunas.map((c) => <span key={c} className="block max-w-56 break-words">{celula(l, c)}</span>),
          <span key="quem" className="text-helper">{l.decidido_por ?? "—"}<span className="block text-fg-muted">{dataHora(l.atualizado_em)}</span></span>,
          ...(permiteAgir ? [<AcoesFiscais key="acoes">
            <Button size="xs" variant="secondary" onClick={() => setEdicao({ modo: "editar", linhas: [l] })}>Editar</Button>
            {apagavel && <Button size="xs" variant="ghost" onClick={() => apagar([l])}>Apagar</Button>}
          </AcoesFiscais>] : []),
        ] };
      })} />
    {!def.apagar && permiteAgir && <p className="text-helper text-fg-muted">O motor não permite apagar este tipo de decisão; mude o valor para a nova escolha.</p>}
    {edicao && <EdicaoDeDecisao tipo={tipo} raiz={raiz} edicao={edicao} estabelecimentos={estabelecimentos} competencia={competencia}
      fechar={(r) => { setEdicao(null); if (r) { setAviso({ ok: true, texto: r }); setSelecionadas([]); router.refresh(); } }} />}
    {dialog}
  </div>;
}

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function EdicaoDeDecisao({ tipo, raiz, edicao, estabelecimentos, competencia, fechar }: {
  tipo: TipoDeDecisao;
  raiz: string;
  edicao: Edicao;
  estabelecimentos: { cnpj: string; rotulo: string }[];
  competencia: string;
  fechar: (mensagem?: string) => void;
}) {
  const def = DECISOES[tipo];
  const nova = edicao.modo === "nova";
  const lote = edicao.modo === "editar" && edicao.linhas.length > 1;
  const fase = nova && def.criarPorPost ? "criar" : "editar";
  const camposDoValor = def.valor.filter((c) => !c.so || c.so === fase);
  const camposDaChave = nova && !def.criarPorPost ? def.chave : [];
  const inicial = (): Record<string, string> => {
    if (edicao.modo === "editar" && edicao.linhas.length === 1) return Object.fromEntries(camposDoValor.map((c) => [c.nome, texto(edicao.linhas[0].valor[c.nome])]));
    const base: Record<string, string> = {};
    for (const c of [...camposDaChave, ...camposDoValor]) {
      if (c.tipo === "competencia" || c.tipo === "competencias") base[c.nome] = competencia;
      if (c.estabelecimento && estabelecimentos.length === 1) base[c.nome] = estabelecimentos[0].cnpj;
    }
    return base;
  };
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [originais] = useState<Record<string, string>>(inicial);
  const [tocados, setTocados] = useState<string[]>([]);
  const [erro, setErro] = useState<{ texto: string; campos?: Record<string, string> } | null>(null);
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();

  const converter = (c: CampoDeDecisao, bruto: string): { ok: true; v: unknown } | { ok: false; motivo: string } => {
    if (c.tipo === "decimal") {
      if (bruto.trim() === "") return c.anulavel ? { ok: true, v: null } : { ok: false, motivo: "informe um número" };
      const n = normalizarDecimal(bruto);
      return n === null ? { ok: false, motivo: "número inválido" } : { ok: true, v: n };
    }
    if (c.tipo === "competencias") return { ok: true, v: lerCompetencias(bruto) };
    if (c.tipo === "cnpj") return { ok: true, v: bruto.replace(/\D/g, "") };
    return { ok: true, v: bruto.trim() };
  };

  const salvar = () => startTransition(async () => {
    const campos: Record<string, string> = {};
    const montar = (lista: CampoDeDecisao[], so?: (c: CampoDeDecisao) => boolean) => {
      const saida: Record<string, unknown> = {};
      for (const c of lista) {
        if (so && !so(c)) continue;
        const r = converter(c, valores[c.nome] ?? "");
        if (!r.ok) campos[c.nome] = r.motivo; else saida[c.nome] = r.v;
      }
      return saida;
    };
    // Edição de uma: só o que mudou. Lote: só o que foi tocado. Nova: o preenchido.
    const valor = montar(camposDoValor, (c) => (nova ? (valores[c.nome] ?? "") !== "" || (c.tipo === "escolha" && c.nome in valores) : lote ? tocados.includes(c.nome) : (valores[c.nome] ?? "") !== (originais[c.nome] ?? "")));
    const chaveNova = montar(camposDaChave);
    if (Object.keys(campos).length) { setErro({ texto: "Confira os campos destacados.", campos }); return; }
    if (Object.keys(valor).length === 0) { setErro({ texto: "Nada mudou." }); return; }
    const r = nova && def.criarPorPost
      ? await criarDecisaoNoMotor({ raiz, tipo, valor, idempotencia: chave })
      : await gravarDecisaoNoMotor({
        raiz, tipo, valor, idempotencia: chave,
        ...(nova ? { chave: chaveNova } : edicao.modo === "editar" && edicao.linhas.length > 1 ? { chaves: edicao.linhas.map((l) => chaveLimpa(tipo, l.chave)) } : { chave: chaveLimpa(tipo, (edicao as { linhas: LinhaDeDecisao[] }).linhas[0].chave) }),
      });
    depoisDe(r);
    if (!r.ok) { setErro({ texto: r.mensagem, campos: r.campos }); return; }
    fechar(r.mensagem);
  });

  const entrada = (c: CampoDeDecisao) => {
    const valor = valores[c.nome] ?? "";
    const mudar = (v: string) => { setValores((a) => ({ ...a, [c.nome]: v })); setTocados((t) => (t.includes(c.nome) ? t : [...t, c.nome])); };
    if (c.estabelecimento) return <Select value={valor} onChange={(e) => mudar(e.target.value)}><option value="">Selecione</option>{estabelecimentos.map((e) => <option key={e.cnpj} value={e.cnpj}>{e.rotulo}</option>)}</Select>;
    if (c.tipo === "escolha") return <Select value={valor} onChange={(e) => mudar(e.target.value)}>{!c.opcoes?.some((o) => o.valor === "") && <option value="">Selecione</option>}{c.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</Select>;
    if (c.tipo === "data") return <CampoData value={valor} onChange={mudar} />;
    return <Input value={valor} maxLength={c.max} inputMode={c.tipo === "decimal" || c.tipo === "cnpj" ? "decimal" : undefined} placeholder={c.tipo === "competencia" ? "AAAA-MM" : c.tipo === "competencias" ? "2026-09, 2026-10" : c.tipo === "decimal" ? "0,00" : undefined} onChange={(e) => mudar(e.target.value)} />;
  };
  const titulo = nova ? (def.criarPorPost ? `Lançar · ${def.rotulo}` : `Nova decisão · ${def.rotulo}`) : lote ? `Editar ${(edicao as { linhas: unknown[] }).linhas.length} decisões · ${def.rotulo}` : `Editar · ${def.rotulo}`;
  return <Modal open title={titulo} onClose={() => fechar()} maxWidth="max-w-3xl">
    {edicao.modo === "editar" && !lote && <p className="mb-4 text-helper text-fg-secondary">{def.chave.map((c) => `${c.rotulo}: ${texto(edicao.linhas[0].chave[c.nome]) || "—"}`).join(" · ")}</p>}
    {lote && <p className="mb-4 text-helper text-fg-secondary">Só os campos que você alterar serão gravados nas {(edicao as { linhas: unknown[] }).linhas.length} decisões, tudo ou nada.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {[...camposDaChave, ...camposDoValor].map((c) => <CampoFiscal key={c.nome} nome={c.rotulo} erro={erro?.campos?.[c.nome]}>{entrada(c)}</CampoFiscal>)}
    </div>
    {erro && <Aviso tom="atencao" className="mt-4">{erro.texto}</Aviso>}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button loading={pendente} onClick={salvar}>{def.criarPorPost && nova ? "Lançar no motor" : "Gravar no motor"}</Button>
      <Button variant="secondary" onClick={() => fechar()}>Cancelar</Button>
    </div>
  </Modal>;
}
