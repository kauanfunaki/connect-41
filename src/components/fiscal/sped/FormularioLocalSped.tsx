"use client";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { SlideOver } from "@/components/ui/SlideOver";
import { TIPO_ITEM } from "@/lib/fiscal/sped/arquivoIcms";
import { apoioSchema, parametrosSchema, type ApoioEscriturado, type ProdutoFiscal } from "@/lib/fiscal/sped/local/dominio";

export type EdicaoSped = { tipo: "perfil" | "parametros" | "classificar" | "apoio" | "ajuste" | "tributacao"; dados: Record<string, unknown>; chaves?: string[]; produto?: ProdutoFiscal };
export type ExecutarSped = (acao: string, dados: Record<string, unknown>) => Promise<void>;
const texto = (v: unknown) => v === null || v === undefined ? "" : String(v);
const numero = (v: FormDataEntryValue | null) => { const t = texto(v).trim(); return t === "" ? null : t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t; };
export function FormularioLocalSped({ edicao, competencia, onClose, executar, anexos }: { edicao: EdicaoSped; competencia: string; onClose: () => void; executar: ExecutarSped; anexos: { id: string; name: string }[] }) {
  const [erro, setErro] = useState<string | null>(null), [pendente, setPendente] = useState(false);
  const titulos = { perfil: "Perfil fiscal da empresa", parametros: "Parâmetros da competência", classificar: edicao.chaves?.length === 1 ? "Classificar produto" : `Classificar ${edicao.chaves?.length ?? 0} produtos`, apoio: "Documento sem nota", ajuste: "Ajuste da apuração", tributacao: "Tributação fiscal do item" };
  const d = edicao.dados;
  const lote = (edicao.chaves?.length ?? 0) > 1;
  function campo(chave: string, rotulo: string, tipo = "text", obrigatorio = false) { return <label key={chave} className="block space-y-1 text-label text-fg-secondary">{rotulo}<Input name={chave} type={tipo} required={obrigatorio} defaultValue={texto(d[chave])} inputMode={/saldo|receita|valor|bruto|liquido|credito/.test(chave) ? "decimal" : undefined} /></label>; }
  function select(chave: string, rotulo: string, opcoes: [string, string][]) { return <label key={chave} className="block space-y-1 text-label text-fg-secondary">{rotulo}<Select name={chave} defaultValue={texto(d[chave])}>{opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</Select></label>; }
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget), dados: Record<string, unknown> = Object.fromEntries(f.entries());
    setPendente(true); setErro(null);
    try {
      if (edicao.tipo === "perfil") dados.obrigacoes = f.getAll("obrigacoes");
      if (edicao.tipo === "classificar") {
        dados.chaves = edicao.chaves;
        dados.classificacao = { tipoItem: f.get("tipoItem"), definicao: f.get("definicao") || null, creditoPisCofins: f.get("creditoPisCofins"), observacao: f.get("observacao") };
        if (lote) dados.classificacao = { ...(f.get("tipoItem") !== "__manter__" ? { tipoItem: f.get("tipoItem") } : {}), ...(f.get("definicao") ? { definicao: f.get("definicao") } : {}), ...(f.get("creditoPisCofins") !== "__manter__" ? { creditoPisCofins: f.get("creditoPisCofins") } : {}), ...(f.get("observacao") ? { observacao: f.get("observacao") } : {}) };
        dados.credito = numero(f.get("credito"));
        dados.restaurarCredito = f.has("restaurarCredito");
      }
      if (edicao.tipo === "parametros") { for (const k of Object.keys(parametrosSchema.parse({}))) { if (k === "semMovimento") dados[k] = f.has(k); else if (f.has(k)) dados[k] = numero(f.get(k)); } }
      if (edicao.tipo === "apoio") {
        dados.dataPagamento = f.get("dataPagamento") || null; dados.anexoId = f.get("anexoId") || null;
        dados.bruto = numero(f.get("bruto")); dados.liquido = numero(f.get("liquido")); dados.contratoInformado = f.has("contratoInformado");
      }
      if (edicao.tipo === "ajuste") {
        dados.id = d.id ?? crypto.randomUUID(); dados.valor = numero(f.get("valor"));
        dados.camposEstaduais = Object.fromEntries(["dime_item_credito", "dime_item_debito", "dcip_numero", "dcip_origem", "cod_receita", "classe_vencimento", "dt_vencimento", "dt_pagamento", "numero_acordo", "base_calculo"].map(k => [k, texto(f.get(k))]).filter(([, v]) => v));
      }
      if (edicao.tipo === "tributacao") {
        dados.documentoId = d.documentoId; dados.ordem = d.ordem;
        dados.tributos = Object.fromEntries((d.obrigacao === "contribuicoes" ? ["pis", "cofins"] : ["icms", "ipi"]).map(t => [t, { cst: texto(f.get(`${t}.cst`)), base: numero(f.get(`${t}.base`)), aliquota: numero(f.get(`${t}.aliquota`)), valor: numero(f.get(`${t}.valor`)) }]));
      }
      await executar(edicao.tipo, dados); onClose();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setPendente(false); }
  }
  return <SlideOver open onClose={() => { if (!pendente) onClose(); }} title={titulos[edicao.tipo]} width="max-w-xl">
    <form onSubmit={salvar} className="space-y-5 p-5">
      {edicao.tipo === "perfil" && <>{campo("uf", "UF", "text", true)}{select("regime", "Regime", [["real", "Lucro real"], ["presumido", "Lucro presumido"], ["simples", "Simples Nacional"]])}{campo("inscricaoEstadual", "Inscrição estadual")}<fieldset className="space-y-2"><legend className="text-label mb-2">Obrigações aplicáveis</legend>{[["icms_ipi", "EFD ICMS/IPI"], ["contribuicoes", "EFD Contribuições"]].map(([v, r]) => <div key={v}><Checkbox name="obrigacoes" value={v} label={r} defaultChecked={Array.isArray(d.obrigacoes) && d.obrigacoes.includes(v)} /></div>)}</fieldset></>}
      {edicao.tipo === "classificar" && <>
        <Aviso tom="info">A destinação, o CFOP e a decisão de PIS/COFINS valem para este fornecedor e produto na raiz inteira. O crédito de ICMS é desta empresa e período.</Aviso>
        {edicao.produto && <p className="text-ui">{edicao.produto.descricao} · fornecedor {edicao.produto.fornecedor}</p>}
        {select("tipoItem", "Destinação", [...(lote ? [["__manter__", "Manter destinação atual"] as [string, string]] : []), ...Object.entries(TIPO_ITEM)])}
        {campo("definicao", "Definição do CFOP (três últimos dígitos)")}
        <p className="text-helper text-fg-muted">Uso e consumo: sugestão 556, sujeita à sua confirmação.</p>
        {select("creditoPisCofins", "Crédito de PIS/COFINS", [...(lote ? [["__manter__", "Manter decisão atual"] as [string, string]] : []), ["", "Não decidido"], ["S", "Com direito a crédito"], ["N", "Sem direito a crédito"]])}
        {campo("credito", `${competencia.length === 4 ? "Crédito de ICMS do ano (rateado por competência)" : "Crédito de ICMS do mês"}${lote ? " para cada produto" : ""}`)}
        <p className="text-helper text-fg-muted">Deixe o crédito vazio para preservar a decisão anterior.</p>
        <Checkbox name="restaurarCredito" label="Remover a decisão de crédito de ICMS e voltar ao valor do documento original" />
        {campo("observacao", "Observação")}
      </>}
      {edicao.tipo === "parametros" && <><Aviso tom="info">Informe os saldos conferidos da competência anterior. Deixe vazio quando ainda não houver referência. As alíquotas de documentos de apoio precisam de confirmação fiscal para a empresa e competência.</Aviso>{[["saldoIcms", "Saldo anterior de ICMS"], ["saldoIpi", "Saldo anterior de IPI"], ["saldoPis", "Saldo anterior de PIS"], ["saldoCofins", "Saldo anterior de COFINS"], ["receitaBruta", "Receita bruta (0111)"], ["receitaNaoCumulativa", "Receita não cumulativa"], ["receitaCumulativa", "Receita cumulativa"], ["aliquotaApoioPis", "PIS de documentos de apoio (%)"], ["aliquotaApoioCofins", "COFINS de documentos de apoio (%)"], ["aliquotaMotoristaPis", "PIS de motorista autônomo (%)"], ["aliquotaMotoristaCofins", "COFINS de motorista autônomo (%)"]].filter(([k]) => d.obrigacao === "icms_ipi" ? ["saldoIcms", "saldoIpi"].includes(k) : !["saldoIcms", "saldoIpi"].includes(k)).map(([k, r]) => campo(k, r))}<Checkbox name="semMovimento" label="Confirmei que este período não tem movimento fiscal" defaultChecked={d.semMovimento === true} /></>}
      {edicao.tipo === "apoio" && <>
        {campo("identidade", "Identificação do documento", "text", true)}{campo("competencia", "Competência (AAAA-MM)", "text", true)}
        {select("categoria", "Tipo", [["rpa", "RPA"], ["recibo", "Recibo"], ["recibo_motorista", "Recibo de motorista"], ["contrato_motorista", "Contrato de motorista"], ["contrato_locacao", "Contrato de locação"], ["contrato_locacao_imovel", "Aluguel de imóvel"], ["fatura", "Fatura"]])}
        {campo("documento", "CPF/CNPJ da pessoa (somente números)", "text", true)}{campo("nome", "Nome", "text", true)}
        {campo("dataPagamento", "Data do pagamento", "date")}{campo("bruto", "Valor bruto", "text", true)}{campo("liquido", "Valor líquido", "text", true)}
        {select("credito", "Crédito de PIS/COFINS", [["", "A decidir"], ["S", "Com direito a crédito"], ["N", "Sem direito a crédito"]])}{campo("natureza", "Natureza da base de crédito")}
        {select("decisao", "Conferência", [["pendente", "A conferir"], ["aceito", "Aceito"], ["rejeitado", "Rejeitado"]])}{campo("motivo", "Motivo / ressalva")}
        <Checkbox name="contratoInformado" label="Contrato de aluguel informado" defaultChecked={d.contratoInformado === true} />
        {select("anexoId", "PDF de apoio", [["", "Sem anexo"], ...anexos.map(a => [a.id, a.name] as [string, string])])}
      </>}
      {edicao.tipo === "ajuste" && <>
        {select("obrigacao", "Obrigação", [["icms_ipi", "ICMS/IPI"], ["contribuicoes", "PIS/COFINS"]])}
        {select("tributo", "Tributo", [["icms", "ICMS"], ["ipi", "IPI"], ["pis", "PIS"], ["cofins", "COFINS"]])}
        {campo("codigo", "Código do ajuste", "text", true)}{campo("descricao", "Descrição / fundamento", "text", true)}
        {select("natureza", "Natureza", [["debito", "Outros débitos"], ["credito", "Outros créditos"], ["estorno_credito", "Estorno de crédito"], ["estorno_debito", "Estorno de débito"], ["deducao", "Dedução"], ["debito_especial", "Débito especial"]])}
        {campo("valor", "Valor", "text", true)}
        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2"><legend className="mb-3 text-label">Informações estaduais, quando aplicáveis</legend>{[["dime_item_credito", "Item DIME de crédito"], ["dime_item_debito", "Item DIME de débito"], ["dcip_numero", "Número DCIP"], ["dcip_origem", "Origem DCIP"], ["cod_receita", "Código de receita"], ["classe_vencimento", "Classe de vencimento"], ["dt_vencimento", "Vencimento"], ["dt_pagamento", "Pagamento"], ["numero_acordo", "Número do acordo"], ["base_calculo", "Base de cálculo"]].map(([k, r]) => campo(k, r, k.startsWith("dt_") ? "date" : "text"))}</fieldset>
      </>}
      {edicao.tipo === "tributacao" && <><Aviso tom="info">Esta decisão é deste item, estabelecimento e competência. Confira CST, base, alíquota e valor com a documentação fiscal. O XML original será preservado.</Aviso>{(d.obrigacao === "contribuicoes" ? ["pis", "cofins"] : ["icms", "ipi"]).map(t => <fieldset key={t} className="grid grid-cols-2 gap-3"><legend className="mb-3 text-label">{t.toUpperCase()}</legend>{campo(`${t}.cst`, "CST/CSOSN")}{campo(`${t}.base`, "Base de cálculo")}{campo(`${t}.aliquota`, "Alíquota (%)")}{campo(`${t}.valor`, "Valor do imposto")}</fieldset>)}</>}
      <FormFooter pending={pendente} onCancel={onClose} erro={erro} />
    </form>
  </SlideOver>;
}
export function novoApoio(competencia: string): Record<string, unknown> { return apoioSchema.parse({ identidade: "novo", competencia: competencia.length === 7 ? competencia : `${competencia}-01`, categoria: "recibo", documento: "00000000000", nome: "novo", dataPagamento: null, bruto: "0.00", liquido: "0.00" }); }
export function dadosDoApoio(a: ApoioEscriturado) { return { ...a } as Record<string, unknown>; }
