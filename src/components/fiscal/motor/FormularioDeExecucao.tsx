"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { BlocoFiscal, CampoFiscal } from "@/components/fiscal/previa/Compartilhados";
import { MODOS_EXECUCAO, mesInteiro, parametrosExecucaoSchema, parametrosIniciais, type ModoExecucao, type ParametrosExecucao } from "@/lib/fiscal/previa/execucao";
import { solicitarExecucaoNoMotor } from "@/app/(app)/fiscal/motor-actions";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

type Existente = { id?: number; estado?: string; solicitado_por?: string | null; solicitado_em?: string | null };

/**
 * O pedido de execução ao motor (22/10/2026): os mesmos campos e a mesma
 * validação da prévia (`parametrosExecucaoSchema`), e o envio para a fila do
 * motor — quem executa é o agente. A duplicata (`409 execucao_duplicada`)
 * abre a confirmação com o pedido que já existe.
 */
export function FormularioDeExecucao({ raiz, estabelecimentos, estabelecimentoId, competencia, podeSolicitar, motivo }: {
  raiz: string;
  estabelecimentos: { id: number; rotulo: string; matriz: boolean; ativo: boolean }[];
  estabelecimentoId: number | null;
  competencia: string;
  podeSolicitar: boolean;
  /** Por que não pode, quando não pode. */
  motivo: string | null;
}) {
  const router = useRouter();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();
  const [p, setP] = useState<ParametrosExecucao>(() => ({ ...parametrosIniciais(competencia), saida: "saida_sped.txt" }));
  const [estab, setEstab] = useState<string>(estabelecimentoId ? String(estabelecimentoId) : "");
  const [obrigacao, setObrigacao] = useState<"sped" | "sped_contribuicoes">("sped");
  const [workers, setWorkers] = useState({ paralela: 32, simples: 8, erros: 32 });
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [duplicata, setDuplicata] = useState<{ parametros: ParametrosExecucao; existente: Existente } | null>(null);
  const matriz = estabelecimentos.find((e) => e.matriz);
  const campo = <K extends keyof ParametrosExecucao>(k: K, v: ParametrosExecucao[K]) => setP((a) => ({ ...a, [k]: v }));

  function enviar(parametros: ParametrosExecucao, confirmarDuplicado: boolean) {
    startTransition(async () => {
      const r = await solicitarExecucaoNoMotor({ raiz, estabelecimentoId: estab ? Number(estab) : null, parametros, confirmarDuplicado, chave });
      depoisDe(r);
      if (!r.ok && r.codigo === "execucao_duplicada") {
        setDuplicata({ parametros, existente: (r.detalhe?.existente ?? {}) as Existente });
        setResultado(null);
        return;
      }
      setResultado({ ok: r.ok, mensagem: r.mensagem });
      if (r.ok) router.refresh();
    });
  }
  function solicitar(modo: ModoExecucao) {
    const dados = { ...p, modo, workers: modo === "paralela" || modo === "simples" || modo === "erros" ? workers[modo] : p.workers, ...(modo === "sped_contribuicoes" && { forcarErros: false, forcarCobertura: false }) };
    const v = parametrosExecucaoSchema.safeParse(dados);
    if (!v.success) { setResultado({ ok: false, mensagem: v.error.issues[0].message }); return; }
    if (modo !== "sped_contribuicoes" && !estab) { setResultado({ ok: false, mensagem: "Escolha o estabelecimento." }); return; }
    enviar(v.data, false);
  }
  const bloqueado = !podeSolicitar || pendente;
  return <div className="space-y-5">
    {motivo && <Aviso tom="info">{motivo}</Aviso>}
    <BlocoFiscal titulo="Preparar pedido" descricao="O pedido vai para a fila do motor SPED; um agente do motor executa quando estiver livre. Nada roda dentro do Connect.">
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoFiscal nome="Estabelecimento"><Select aria-label="Estabelecimento" value={estab} onChange={(e) => setEstab(e.target.value)}>
          <option value="">Selecione</option>
          {estabelecimentos.map((e) => <option key={e.id} value={e.id} disabled={!e.ativo}>{e.rotulo}{e.ativo ? "" : " (inativo)"}</option>)}
        </Select></CampoFiscal>
        <CampoFiscal nome="Data inicial"><CampoData aria-label="Data inicial" value={p.dataIni} onChange={(v) => campo("dataIni", v)} /></CampoFiscal>
        <CampoFiscal nome="Data final"><CampoData aria-label="Data final" value={p.dataFim} onChange={(v) => campo("dataFim", v)} /></CampoFiscal>
      </div>
      <div className="mt-4 flex flex-wrap gap-5">
        {(["first_mile", "last_mile"] as const).map((etapa) => <Checkbox key={etapa} id={`motor-${etapa}`} label={etapa} checked={p.etapas.includes(etapa)} onChange={(e) => campo("etapas", e.target.checked ? [...p.etapas, etapa] : p.etapas.filter((v) => v !== etapa))} />)}
        <Checkbox id="motor-sem-entradas" label="Pular entradas (SIEG)" checked={p.semEntradas} onChange={(e) => campo("semEntradas", e.target.checked)} />
      </div>
    </BlocoFiscal>
    {resultado && <div role={resultado.ok ? "status" : "alert"}><Aviso tom={resultado.ok ? "sucesso" : "atencao"}>{resultado.mensagem}</Aviso></div>}
    {(["paralela", "simples", "erros"] as const).map((modo) => <BlocoRecolhivel key={modo} titulo={MODOS_EXECUCAO[modo]} className="bg-surface" abertoInicial={false}>
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        {modo === "paralela" && <CampoFiscal nome="Instâncias"><Input aria-label="Instâncias" type="number" min={1} max={16} value={p.instancias} onChange={(e) => campo("instancias", Number(e.target.value))} /></CampoFiscal>}
        <CampoFiscal nome={modo === "paralela" ? "Workers por instância" : "Workers"}><Input aria-label={`Workers · ${MODOS_EXECUCAO[modo]}`} type="number" min={1} max={64} value={workers[modo]} onChange={(e) => setWorkers((a) => ({ ...a, [modo]: Number(e.target.value) }))} /></CampoFiscal>
      </div>
      <Button className="mt-4" disabled={bloqueado} onClick={() => solicitar(modo)}>Solicitar {MODOS_EXECUCAO[modo].toLocaleLowerCase("pt-BR")}</Button>
    </BlocoRecolhivel>)}
    <BlocoRecolhivel titulo="Gerar SPED" abertoInicial className="bg-surface">
      <p className="mb-4 text-ui text-fg-secondary">Um único mês inteiro. ICMS/IPI gera o estabelecimento escolhido; Contribuições gera a raiz inteira pela matriz{matriz ? ` (${matriz.rotulo})` : " — a matriz não está entre as empresas que você acessa"}.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoFiscal nome="Escrituração"><Select aria-label="Escrituração" value={obrigacao} onChange={(e) => { const m = e.target.value as typeof obrigacao; setObrigacao(m); setP((a) => ({ ...a, saida: m === "sped" ? "saida_sped.txt" : "", forcarErros: false, forcarCobertura: false })); }}><option value="sped">EFD ICMS/IPI</option><option value="sped_contribuicoes">EFD Contribuições · PIS/COFINS</option></Select></CampoFiscal>
        <CampoFiscal nome="Tipo do arquivo"><Select aria-label="Tipo do arquivo" value={p.tipoSped ?? ""} onChange={(e) => campo("tipoSped", e.target.value === "0" || e.target.value === "1" ? e.target.value : undefined)}><option value="">Selecione</option><option value="0">Original</option><option value="1">Substituto</option></Select></CampoFiscal>
        {obrigacao === "sped" && <CampoFiscal nome="Arquivo de saída"><Input aria-label="Arquivo de saída" maxLength={200} value={p.saida} onChange={(e) => campo("saida", e.target.value)} /></CampoFiscal>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button variant="secondary" onClick={() => { const [dataIni, dataFim] = mesInteiro(p.dataIni.slice(0, 7) || competencia); setP((a) => ({ ...a, dataIni, dataFim })); }}>Ajustar para o mês inteiro</Button>
        {obrigacao === "sped" && <><Checkbox id="motor-forcar-erros" label="Gerar mesmo com erro pendente" checked={p.forcarErros} onChange={(e) => campo("forcarErros", e.target.checked)} /><Checkbox id="motor-forcar-cobertura" label="Gerar mesmo sem documentos" checked={p.forcarCobertura} onChange={(e) => campo("forcarCobertura", e.target.checked)} /></>}
      </div>
      <Button className="mt-4" disabled={bloqueado || (obrigacao === "sped_contribuicoes" && !matriz)} loading={pendente} loadingLabel="Enviando…" onClick={() => solicitar(obrigacao)}>Solicitar geração</Button>
    </BlocoRecolhivel>
    <Modal open={!!duplicata} title="Já existe um pedido igual" onClose={() => setDuplicata(null)}>
      <p className="text-ui text-fg-secondary">
        O pedido #{duplicata?.existente.id ?? "?"} ({duplicata?.existente.estado ?? "aberto"}{duplicata?.existente.solicitado_por ? `, de ${duplicata.existente.solicitado_por}` : ""}) tem a mesma ação, estabelecimento e período. Enviar outro mesmo assim?
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button disabled={pendente} onClick={() => { const d = duplicata; setDuplicata(null); if (d) enviar(d.parametros, true); }}>Enviar mesmo assim</Button>
        <Button variant="secondary" onClick={() => setDuplicata(null)}>Não enviar</Button>
      </div>
    </Modal>
  </div>;
}
