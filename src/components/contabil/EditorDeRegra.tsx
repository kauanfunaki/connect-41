"use client";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { SlideOver } from "@/components/ui/SlideOver";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { useToast } from "@/components/ui/Toast";
import { salvarRegra } from "@/app/(app)/contabil/sped/actions";
import { aplicarCoringas, fornecedorNoFim, HISTORICO_PADRAO, CORINGAS_DO_HISTORICO, type ContaDoPlano, type Entrada, type Regra } from "@/lib/contabil/lancamentos";
import type { DadosDaRegra } from "@/lib/contabil/regras";

export function CampoConta({ nome, valor, mudar, contas }: { nome: string; valor: string; mudar: (v: string) => void; contas: ContaDoPlano[] }) {
  const id = useId();
  const [buscando, setBuscando] = useState(false);
  const conta = contas.find((c) => c.reduzido === valor);
  return <div className="space-y-1">
    <label htmlFor={id} className="block text-label text-fg-secondary">{nome}</label>
    <div className="flex gap-2"><Input id={id} aria-describedby={id + "-descricao"} value={valor} inputMode="numeric" maxLength={20} onChange={(e) => mudar(e.target.value.replace(/\D/g, ""))} /><Button aria-label={"Buscar " + nome} type="button" variant="secondary" size="sm" disabled={!contas.length} onClick={() => setBuscando((v) => !v)}>Buscar</Button></div>
    {buscando && <Select aria-label={"Buscar " + nome + " no plano"} value="" onChange={(e) => { mudar(e.target.value); setBuscando(false); }}><option value="">Escolher no plano</option>{contas.map((c) => <option key={c.reduzido} value={c.reduzido}>{c.reduzido + " · " + c.classificacao + " · " + c.nome}</option>)}</Select>}
    <p id={id + "-descricao"} className="text-helper text-fg-muted">{conta ? conta.nome : valor && contas.length ? "Conta fora do plano carregado." : "Código reduzido da Domínio."}</p>
  </div>;
}

export function EditorDeRegra({ empresaId, mes, inicial, contas, notas, fechar }: { empresaId: string; mes: string; inicial: Partial<Regra> & { id?: string }; contas: ContaDoPlano[]; notas: Entrada[]; fechar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [r, setR] = useState<DadosDaRegra>(() => ({
    empresa: empresaId, id: inicial.id, cnpjFornecedor: inicial.cnpjFornecedor ?? "", cfop: inicial.cfop ?? "", nomeFornecedor: inicial.nomeFornecedor ?? "",
    contaDebito: inicial.contaDebito ?? "", contaCredito: inicial.contaCredito ?? "", codigoHistorico: inicial.codigoHistorico ?? "", historico: inicial.historico ?? "",
    observacao: inicial.observacao ?? "", dataLancamento: inicial.dataLancamento ?? "", valor: inicial.valorCentavos == null ? "" : (inicial.valorCentavos / 100).toFixed(2).replace(".", ","),
    iniciaLote: (inicial.iniciaLote ?? "") as "" | "S" | "N", codigoFilial: inicial.codigoFilial ?? "", centroCustoDebito: inicial.centroCustoDebito ?? "", centroCustoCredito: inicial.centroCustoCredito ?? "", desconsiderar: inicial.desconsiderar ?? false,
  }));
  const mudar = (chave: keyof DadosDaRegra, valor: string | boolean) => setR((v) => ({ ...v, [chave]: valor }));
  const [leitura, setLeitura] = useState<{ chave: string; notas: Entrada[]; erro?: string; carregando?: boolean } | null>(null);
  const chaveDasNotas = r.cnpjFornecedor + "|" + r.cfop;
  useEffect(() => {
    if (notas.length || !/^(\d{11}|\d{14})$/.test(r.cnpjFornecedor) || !/^(\d{4})?$/.test(r.cfop)) return;
    const abortar = new AbortController();
    const relogio = setTimeout(() => {
      setLeitura({ chave: chaveDasNotas, notas: [], carregando: true });
      const q = new URLSearchParams({ empresa: empresaId, mes, fornecedor: r.cnpjFornecedor, cfop: r.cfop });
      fetch("/api/contabil/documentos?" + q, { signal: abortar.signal }).then(async (resposta) => {
        if (!resposta.ok) throw new Error("Não foi possível consultar as notas deste fornecedor.");
        const dados = await resposta.json() as { notas: Entrada[] };
        if (!abortar.signal.aborted) setLeitura({ chave: chaveDasNotas, notas: dados.notas });
      }).catch(() => { if (!abortar.signal.aborted) setLeitura({ chave: chaveDasNotas, notas: [], erro: "Não foi possível consultar as notas. Consulte Notas de entrada." }); });
    }, 250);
    return () => { clearTimeout(relogio); abortar.abort(); };
  }, [empresaId, mes, r.cnpjFornecedor, r.cfop, notas.length, chaveDasNotas]);
  const relacionadas = notas.length ? notas.filter((n) => n.cnpj === r.cnpjFornecedor && (!r.cfop || n.cfops.includes(r.cfop))) : leitura?.chave === chaveDasNotas ? leitura.notas : [];
  const exemplo: Entrada = relacionadas[0] ?? { chave: "", tipo: "NF-e", cnpj: r.cnpjFornecedor, nome: r.nomeFornecedor || "FORNECEDOR", numero: "123", serie: "1", data: "2026-10-15", centavos: 10000, cfops: r.cfop ? [r.cfop] : [], cancelada: false };
  const previa = fornecedorNoFim(aplicarCoringas(r.historico || HISTORICO_PADRAO, exemplo, r.nomeFornecedor || exemplo.nome), r.nomeFornecedor || exemplo.nome);
  const campo = (chave: keyof DadosDaRegra, nome: string, maxLength = 255) => <label className="grid gap-1 text-label text-fg-secondary">{nome}<Input maxLength={maxLength} value={String(r[chave] ?? "")} onChange={(e) => mudar(chave, e.target.value)} /></label>;
  return <SlideOver open onClose={() => { if (!pendente) fechar(); }} title={r.id ? "Editar regra" : "Nova regra"} width="max-w-2xl">
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); iniciar(async () => { setErro(""); const x = await salvarRegra(r); if (!x.ok) { setErro(x.erro); return; } toast.success(x.mensagem); router.refresh(); fechar(); }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-label text-fg-secondary">CPF/CNPJ do fornecedor<Input value={r.cnpjFornecedor} maxLength={14} inputMode="numeric" onChange={(e) => mudar("cnpjFornecedor", e.target.value.replace(/\D/g, ""))} /></label>
        <label className="grid gap-1 text-label text-fg-secondary">CFOP (vazio: todos do fornecedor)<Input value={r.cfop} maxLength={4} inputMode="numeric" onChange={(e) => mudar("cfop", e.target.value.replace(/\D/g, ""))} /></label>
      </div>
      {campo("nomeFornecedor", "Nome do fornecedor", 180)}
      <div className="grid gap-3 sm:grid-cols-2"><CampoConta nome="Conta de débito" valor={r.contaDebito} mudar={(v) => mudar("contaDebito", v)} contas={contas} /><CampoConta nome="Conta de crédito" valor={r.contaCredito} mudar={(v) => mudar("contaCredito", v)} contas={contas} /></div>
      {campo("codigoHistorico", "Código do histórico (opcional)", 10)}
      {campo("historico", "Complemento do histórico")}
      <div className="flex flex-wrap gap-1">{CORINGAS_DO_HISTORICO.map((c) => <Button key={c} type="button" size="xs" variant="ghost" onClick={() => mudar("historico", (r.historico ? r.historico + " " : "") + c)}>{c}</Button>)}</div>
      <p className="rounded-md bg-surface-hover p-3 text-helper text-fg-secondary"><strong>Prévia {relacionadas.length ? "com uma nota do período" : "ilustrativa"}:</strong> {previa}<span className="block mt-1">CT-e, NFS-e e imobilizado configurados usam o histórico do modelo.</span></p>
      <Checkbox label="Deixar fora dos lançamentos" checked={r.desconsiderar} onChange={(e) => mudar("desconsiderar", e.target.checked)} />
      <BlocoRecolhivel titulo="Opções avançadas">
        <div className="mt-4 space-y-3">
          <Aviso tom="info">Data e valor preenchidos substituem os dados de todas as notas abrangidas pela regra. Em branco, valem os dados de cada nota.</Aviso>
          {campo("observacao", "Observação", 500)}
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-label text-fg-secondary">Data substituta<CampoData value={r.dataLancamento} onChange={(v) => mudar("dataLancamento", v)} /></label>{campo("valor", "Valor substituto (sem milhar)", 16)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-label text-fg-secondary">Inicia lote<Select value={r.iniciaLote} onChange={(e) => mudar("iniciaLote", e.target.value)}><option value="">Padrão</option><option value="S">Sim</option><option value="N">Não</option></Select></label>{campo("codigoFilial", "Código matriz/filial", 10)}{campo("centroCustoDebito", "Centro de custo débito", 40)}{campo("centroCustoCredito", "Centro de custo crédito", 40)}</div>
        </div>
      </BlocoRecolhivel>
      <BlocoRecolhivel titulo={leitura?.chave === chaveDasNotas && leitura.carregando ? "Consultando notas…" : relacionadas.length + " nota(s) deste fornecedor no período"}>{leitura?.chave === chaveDasNotas && leitura.erro && <Aviso tom="atencao">{leitura.erro}</Aviso>}<ul className="mt-2 space-y-2">{relacionadas.slice(0, 50).map((n) => <li key={n.chave} className="text-helper"><Button size="xs" variant="link" href={"/documentos-fiscais/" + n.documentoId} target="_blank">{n.tipo + " " + n.numero + " · " + n.data.split("-").reverse().join("/")}</Button></li>)}</ul>{relacionadas.length > 50 && <Button variant="link" size="sm" href={"/contabil/sped?" + new URLSearchParams({ empresa: empresaId, mes, aba: "lancamentos", secao: "entradas", q: r.cnpjFornecedor, cfop: r.cfop })}>Consultar todas em Notas de entrada</Button>}</BlocoRecolhivel>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      <div className="flex gap-2 sticky bottom-0 bg-surface-elevated py-3 border-t border-border"><Button type="submit" loading={pendente}>Salvar regra</Button><Button type="button" variant="secondary" disabled={pendente} onClick={fechar}>Cancelar</Button></div>
    </form>
  </SlideOver>;
}
