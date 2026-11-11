"use client";

import { useId, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { ALERTAS_INFORMATIVOS } from "@/lib/honorarios/regras/honorariosRegras";
import { dataCurta, moeda, ROTULO_ALERTA, ROTULO_TIPO_DOCUMENTO } from "@/lib/honorarios/rotulos";
import type { EmpresaHonorario } from "@/lib/honorarios/servidor/honorariosService";
import { informarHonorario, usarValorDoAcessorias } from "@/app/(app)/honorarios/actions";

/** "1.234,56", "1234,56", "1234.56" ou "R$ 1.234,56" → 1234.56; null se não for número maior que zero. */
export function lerValor(texto: string): number | null {
  let t = texto.replace(/R\$\s*/i, "").trim();
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

const paraCampo = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));

/** Informar, conferir ou alterar o honorário à mão. */
export function DialogoDoValor({ empresa: e, aoFechar }: { empresa: EmpresaHonorario; aoFechar: () => void }) {
  const toast = useToast();
  const ids = useId();
  const conferir = !e.manual && e.valor !== null;
  const [texto, setTexto] = useState(paraCampo(e.manual?.valor ?? e.valor));
  const chaveAtual = e.documento ? `${e.documento.nomePasta}/${e.documento.caminhoRelativo}` : "";
  const [documento, setDocumento] = useState(e.manual?.documento ?? chaveAtual);
  const [observacao, setObservacao] = useState(e.manual?.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const valor = lerValor(texto);
  const graves = e.alertas.filter((a) => !ALERTAS_INFORMATIVOS.has(a));
  const igualAoLido = conferir && valor !== null && Math.abs(valor - (e.valor ?? 0)) < 0.005;

  function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    if (valor === null) return;
    setErro(null);
    iniciar(async () => {
      const r = await informarHonorario({ companyId: e.empresa.id, valor, documento: documento || null, observacao: observacao.trim() || null });
      if (!r.ok) return setErro(r.erro);
      toast.success(r.mensagem ?? "Valor informado.");
      aoFechar();
    });
  }

  return (
    <Modal open onClose={aoFechar} title={conferir ? "Conferir honorário" : "Informar honorário"} maxWidth="max-w-lg">
      <form onSubmit={salvar} className="space-y-4">
        <p className="font-semibold text-fg">{e.empresa.razaoSocial}</p>
        {conferir && e.documento && (
          <p className="text-label text-fg-secondary">
            Valor lido em {e.documento.nome}. Abra o documento na pasta, confira e confirme (ou corrija). Depois de confirmado, ele vale mesmo que a
            leitura mude.
            {graves.length > 0 && ` Alerta: ${graves.map((a) => ROTULO_ALERTA[a].toLowerCase()).join("; ")}.`}
          </p>
        )}
        <div>
          <label htmlFor={`${ids}-valor`} className="mb-1 block text-label font-medium text-fg">
            Honorário mensal (R$)
          </label>
          <Input
            id={`${ids}-valor`}
            inputMode="decimal"
            placeholder="1.412,00"
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            error={texto.trim() !== "" && valor === null}
            aria-describedby={`${ids}-ajuda`}
            autoFocus
          />
          <p id={`${ids}-ajuda`} className={`mt-1 text-micro ${texto.trim() !== "" && valor === null ? "text-danger" : "text-fg-muted"}`}>
            {texto.trim() === "" ? "Sem o adicional por funcionário." : valor === null ? "Valor inválido." : `Vai ficar ${moeda(valor)}.`}
          </p>
        </div>
        {e.documentos.length > 0 && (
          <div>
            <label htmlFor={`${ids}-doc`} className="mb-1 block text-label font-medium text-fg">
              Documento de onde tirou o valor (opcional)
            </label>
            <Select id={`${ids}-doc`} value={documento} onChange={(ev) => setDocumento(ev.target.value)}>
              <option value="">—</option>
              {e.documentos.map((d) => (
                <option key={`${d.nomePasta}/${d.caminhoRelativo}`} value={`${d.nomePasta}/${d.caminhoRelativo}`}>
                  {d.nome} ({dataCurta(d.data ?? d.modificadoEm)})
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <label htmlFor={`${ids}-obs`} className="mb-1 block text-label font-medium text-fg">
            Observação (opcional)
          </label>
          <Textarea id={`${ids}-obs`} rows={2} maxLength={300} value={observacao} onChange={(ev) => setObservacao(ev.target.value)} />
        </div>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={valor === null || salvando}>
            {salvando ? "Salvando…" : igualAoLido ? "Confirmar valor" : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "Acessórias está certo": vale o valor da última leitura do Acessórias. Nada é enviado a ele. */
export function DialogoAcessoriasCerto({ empresa: e, aoFechar }: { empresa: EmpresaHonorario; aoFechar: () => void }) {
  const toast = useToast();
  const ids = useId();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const valorAcessorias = e.acessorias.valor ?? 0;

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await usarValorDoAcessorias({ companyId: e.empresa.id, valorEsperado: valorAcessorias, observacao: motivo.trim() || null });
      if (!r.ok) return setErro(r.erro);
      toast.success(r.mensagem ?? "Vale o valor do Acessórias.");
      aoFechar();
    });
  }

  return (
    <Modal open onClose={aoFechar} title="O valor do Acessórias está certo?" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-fg">{e.empresa.razaoSocial}</p>
          <p className="text-micro text-fg-muted tabular-nums">{e.empresa.cnpj}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-label">
          <dt className="text-fg-muted">No Acessórias</dt>
          <dd className="font-semibold tabular-nums">{moeda(e.acessorias.valor)}</dd>
          <dt className="text-fg-muted">{e.manual ? "Informado à mão" : "Lido na pasta"}</dt>
          <dd className="tabular-nums">
            {moeda(e.valor)}
            {!e.manual && e.documento && ` (${ROTULO_TIPO_DOCUMENTO[e.documento.tipo].toLowerCase()} de ${dataCurta(e.documento.data ?? e.documento.modificadoEm)})`}
          </dd>
        </dl>
        <p className="text-label text-fg-secondary">
          O Connect passa a usar o valor do Acessórias para esta empresa e deixa a leitura da pasta de lado. Nada é enviado ao Acessórias. Se chegar
          documento novo com outro valor, a empresa ganha um alerta. Para desfazer, abra a empresa e use “Remover e voltar ao valor lido”.
        </p>
        <div>
          <label htmlFor={`${ids}-motivo`} className="mb-1 block text-label font-medium text-fg">
            Motivo (opcional)
          </label>
          <Textarea
            id={`${ids}-motivo`}
            rows={2}
            maxLength={300}
            placeholder="Ex.: aditivo de redução de 01/09/2026"
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
          />
        </div>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando ? "Salvando…" : "Usar o valor do Acessórias"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
