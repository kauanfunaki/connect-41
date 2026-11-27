"use client";

import { useState, useTransition } from "react";
import { Pencil, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { ORIGENS, formatarNcm } from "@/lib/fiscal/cadastro/regras";
import { salvarProdutoFiscal, salvarProdutosEmLote } from "@/app/(app)/documentos-fiscais/cadastro/actions";

export type ProdutoNaTela = {
  id: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cest: string | null;
  unidade: string | null;
  grupo: string | null;
  origem: string | null;
  tipoItem: string;
  cClassTrib: string | null;
  cstIbsCbs: string | null;
  efetivo: { cClassTrib: string; cst: string | null; fonte: "PRODUTO" | "NCM" } | null;
  sentido: "ENTRADA" | "SAIDA";
  fornecedor: string | null;
  ocorrencias: number;
  ultimaNota: string | null;
  editado: boolean;
};

function CamposComuns({ p, emLote }: { p: ProdutoNaTela | null; emLote: boolean }) {
  const dica = emLote ? "Vazio não muda; “—” limpa." : undefined;
  return (
    <>
      <FieldGrid>
        <CampoForm label="CEST" htmlFor="prod-cest" dica={dica}>
          <Input id="prod-cest" name="cest" defaultValue={p?.cest ?? ""} inputMode="numeric" maxLength={9} />
        </CampoForm>
        <CampoForm label="Unidade" htmlFor="prod-un" dica={dica}>
          <Input id="prod-un" name="unidade" defaultValue={p?.unidade ?? ""} maxLength={6} placeholder="UN" />
        </CampoForm>
        <CampoForm label="Grupo" htmlFor="prod-grupo" dica={dica}>
          <Input id="prod-grupo" name="grupo" defaultValue={p?.grupo ?? ""} maxLength={60} />
        </CampoForm>
        <CampoForm label="Origem" htmlFor="prod-origem">
          <Select id="prod-origem" name="origem" defaultValue={p?.origem ?? ""}>
            <option value="">{emLote ? "Não mudar" : "Não informada"}</option>
            {emLote && <option value="—">Limpar</option>}
            {Object.entries(ORIGENS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </CampoForm>
      </FieldGrid>
      <FieldGrid>
        <CampoForm label="cClassTrib (IBS/CBS)" htmlFor="prod-cct" dica={emLote ? dica : "Vazio usa o vínculo do NCM, quando houver."}>
          <Input id="prod-cct" name="cClassTrib" defaultValue={p?.cClassTrib ?? ""} inputMode="numeric" maxLength={6} placeholder="000001" />
        </CampoForm>
        <CampoForm label="CST de IBS/CBS" htmlFor="prod-cst" dica={dica}>
          <Input id="prod-cst" name="cstIbsCbs" defaultValue={p?.cstIbsCbs ?? ""} inputMode="numeric" maxLength={3} placeholder="000" />
        </CampoForm>
      </FieldGrid>
    </>
  );
}

function FormularioDoProduto({ companyId, p, aoFechar }: { companyId: string; p: ProdutoNaTela; aoFechar: () => void }) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  function salvar(form: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarProdutoFiscal(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Produto salvo.");
      aoFechar();
    });
  }
  return (
    <form action={salvar} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="id" value={p.id} />
      <p className="text-fs-2 text-fg-secondary">
        Código <strong className="text-fg">{p.codigo}</strong>
        {p.fornecedor ? ` · de ${p.fornecedor}` : " · da própria empresa"}. Mudar a descrição ou o NCM aqui faz a atualização do acervo parar de trocá-los.
      </p>
      <CampoForm label="Descrição" htmlFor="prod-desc" required>
        <Input id="prod-desc" name="descricao" defaultValue={p.descricao} maxLength={500} required />
      </CampoForm>
      <FieldGrid>
        <CampoForm label="NCM" htmlFor="prod-ncm">
          <Input id="prod-ncm" name="ncm" defaultValue={formatarNcm(p.ncm)} inputMode="numeric" maxLength={10} />
        </CampoForm>
        <CampoForm label="Tipo do item (SPED)" htmlFor="prod-tipo">
          <Input id="prod-tipo" name="tipoItem" defaultValue={p.tipoItem} inputMode="numeric" maxLength={2} />
        </CampoForm>
      </FieldGrid>
      <CamposComuns p={p} emLote={false} />
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} loadingLabel="Salvando…">
          Salvar
        </Button>
      </div>
    </form>
  );
}

function FormularioDoLote({ companyId, ids, aoFechar }: { companyId: string; ids: string[]; aoFechar: (ok: boolean) => void }) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  function salvar(form: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarProdutosEmLote(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success(`${r.alterados} produtos alterados.`);
      aoFechar(true);
    });
  }
  return (
    <form action={salvar} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={companyId} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      <p className="text-fs-2 text-fg-secondary">
        {ids.length} {ids.length === 1 ? "produto marcado" : "produtos marcados"}. Só os campos preenchidos mudam; descrição e NCM se editam produto a produto.
      </p>
      <CamposComuns p={null} emLote />
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => aoFechar(false)} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} loadingLabel="Salvando…">
          Aplicar aos marcados
        </Button>
      </div>
    </form>
  );
}

/**
 * Os produtos do cadastro fiscal (27/11/2026, funcionalidade-899): a tabela da
 * página aberta, com a edição de um produto e a de vários marcados de uma vez
 * (CEST, unidade, grupo, origem e o cClassTrib/CST de IBS/CBS).
 */
export function TabelaDeProdutos({ companyId, produtos }: { companyId: string; produtos: ProdutoNaTela[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<ProdutoNaTela | null>(null);
  const [emLote, setEmLote] = useState(false);
  const todos = produtos.length > 0 && produtos.every((p) => marcados.has(p.id));

  function marcar(id: string) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEmLote(true)} disabled={marcados.size === 0}>
          <PencilLine size={13} aria-hidden /> Editar marcados{marcados.size > 0 ? ` (${marcados.size})` : ""}
        </Button>
        {marcados.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
            Desmarcar
          </Button>
        )}
      </div>
      <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr>
              <th className="w-8 px-3 py-2">
                <Checkbox
                  aria-label="Marcar os produtos desta página"
                  checked={todos}
                  onChange={() => setMarcados(todos ? new Set() : new Set(produtos.map((p) => p.id)))}
                />
              </th>
              {["Código", "Descrição", "NCM", "CEST", "Un.", "cClassTrib", "Sentido", "Notas", ""].map((c, i) => (
                <th key={i} className="px-3 py-2">
                  {c || <span className="sr-only">Ações</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <Checkbox aria-label={`Marcar ${p.descricao}`} checked={marcados.has(p.id)} onChange={() => marcar(p.id)} />
                </td>
                <td className="px-3 py-2 break-all">{p.codigo}</td>
                <td className="px-3 py-2">
                  <span className="text-fg">{p.descricao}</span>
                  {p.editado && (
                    <Selo tom="neutro" className="ml-1">
                      Editado
                    </Selo>
                  )}
                  {p.fornecedor && <span className="block text-micro text-fg-muted">{p.fornecedor}</span>}
                </td>
                <td className="px-3 py-2 tabular-nums">{p.ncm ? formatarNcm(p.ncm) : <Selo tom="atencao">Sem NCM</Selo>}</td>
                <td className="px-3 py-2 tabular-nums">{p.cest ?? "—"}</td>
                <td className="px-3 py-2">{p.unidade ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {p.efetivo ? (
                    <>
                      {p.efetivo.cClassTrib}
                      {p.efetivo.fonte === "NCM" && <span className="block text-micro text-fg-muted">pelo NCM</span>}
                    </>
                  ) : (
                    <Selo tom="atencao">Sem cClassTrib</Selo>
                  )}
                </td>
                <td className="px-3 py-2">{p.sentido === "ENTRADA" ? "Entrada" : "Saída"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {p.ocorrencias}
                  {p.ultimaNota && <span className="block text-micro text-fg-muted">{p.ultimaNota}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="xs" variant="ghost" onClick={() => setEditando(p)} aria-label={`Editar ${p.descricao}`}>
                    <Pencil size={12} aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={editando !== null} onClose={() => setEditando(null)} title="Editar produto" maxWidth="max-w-2xl">
        {editando && <FormularioDoProduto key={editando.id} companyId={companyId} p={editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Modal open={emLote} onClose={() => setEmLote(false)} title="Editar os produtos marcados" maxWidth="max-w-2xl">
        {emLote && (
          <FormularioDoLote
            companyId={companyId}
            ids={[...marcados]}
            aoFechar={(ok) => {
              setEmLote(false);
              if (ok) setMarcados(new Set());
            }}
          />
        )}
      </Modal>
    </div>
  );
}
