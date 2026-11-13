"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Checkbox } from "@/components/ui/Checkbox";
import { TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import type { LinhaDaPrevia, SituacaoNaPrevia } from "@/lib/dp2/esocial/importacaoServidor";
import { BuscaNoEsocial } from "@/components/dp2/BuscaNoEsocial";
import { importarDoEsocialAction, previaDoEsocialAction, type EstadoDaImportacao } from "@/app/(app)/dp2/actions";

const NOME: Record<SituacaoNaPrevia, string> = { NOVA: "Novo", EXISTE: "Já cadastrado", OUTRA_EMPRESA: "Em outra empresa", DESLIGADO: "Desligado", ERRO: "Com erro" };
const TOM: Record<SituacaoNaPrevia, "sucesso" | "neutro" | "atencao" | "perigo"> = { NOVA: "sucesso", EXISTE: "neutro", OUTRA_EMPRESA: "atencao", DESLIGADO: "neutro", ERRO: "perigo" };
const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");

/**
 * Importar os colaboradores da empresa do eSocial (13/11/2026). Dois caminhos
 * que terminam na mesma prévia, e nada é gravado antes de "Importar":
 * - buscar no eSocial por CPF e admissão, como a Domínio, pelo Assinador do
 *   Connect (funcionalidade-671, `BuscaNoEsocial`), respeitando os 10 acessos
 *   por dia por empresa do eSocial;
 * - enviar o .zip (ou .xml) baixado no portal ou vindo de outro sistema
 *   (funcionalidade-666).
 */
export function ImportarDoEsocial({ companyId, cnpj, empresa }: { companyId: string; cnpj: string | null; empresa: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [estado, setEstado] = useState<EstadoDaImportacao>(null);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [incluirDesligados, setIncluirDesligados] = useState(false);
  const [atualizar, setAtualizar] = useState(false);
  const [pendente, comecar] = useTransition();

  const fechar = () => {
    setAberto(false);
    setArquivos([]);
    setEstado(null);
    setDesmarcados(new Set());
    if (estado?.ok && estado.etapa === "feita") router.refresh();
  };

  const formulario = (lista: File[]) => {
    const fd = new FormData();
    fd.set("companyId", companyId);
    for (const f of lista) fd.append("arquivo", f);
    return fd;
  };

  const verPrevia = (lista: File[]) => {
    setArquivos(lista);
    comecar(async () => setEstado(await previaDoEsocialAction(null, formulario(lista))));
  };

  const previa = estado?.ok && estado.etapa === "previa" ? estado.previa : null;
  const marcavel = (l: LinhaDaPrevia) => l.situacao === "NOVA" || l.situacao === "EXISTE" || (l.situacao === "DESLIGADO" && incluirDesligados);
  const vaiImportar = useMemo(() => (previa ?? []).filter((l) => marcavel(l) && !desmarcados.has(l.cpf)), [previa, desmarcados, incluirDesligados]); // eslint-disable-line react-hooks/exhaustive-deps

  const importar = () => {
    const fd = formulario(arquivos);
    if (incluirDesligados) fd.set("incluirDesligados", "on");
    if (atualizar) fd.set("atualizarExistentes", "on");
    for (const cpf of desmarcados) fd.append("ignorar", cpf);
    comecar(async () => setEstado(await importarDoEsocialAction(null, fd)));
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>
        <Plus size={14} aria-hidden="true" />
        Importar do eSocial
      </Button>
      <Modal open={aberto} onClose={fechar} title={`Importar do eSocial · ${empresa}`} maxWidth="max-w-5xl">
        {!previa && !(estado?.ok && estado.etapa === "feita") && (
          <div className="flex flex-col gap-4">
            <p className="text-fs-3 text-fg-muted">
              Traz os colaboradores da empresa com os contratos, os dependentes e os dados do eSocial. Só lê: nada é enviado ao eSocial, e nada é gravado antes de você conferir.
            </p>
            <div className="grid gap-4 lg:grid-cols-[3fr_2fr] items-start">
            <BuscaNoEsocial companyId={companyId} cnpj={cnpj} onArquivos={verPrevia} ocupado={pendente} />
            <section className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <h3 className="text-fs-4 font-semibold text-fg flex items-center gap-2">
                <FileUp size={18} aria-hidden="true" />
                Ou envie os arquivos
              </h3>
              <p className="text-fs-2 text-fg-muted">
                Os XML dos eventos do eSocial, soltos ou em .zip: do “eSocial Download” do portal (menu Downloads › Solicitação) ou de outro sistema.
              </p>
              <label className="text-fs-2 font-medium text-fg" htmlFor="arquivosDoEsocial">
                Arquivos (.zip ou .xml)
              </label>
              <input
                id="arquivosDoEsocial"
                type="file"
                accept=".zip,.xml,application/zip,text/xml,application/xml"
                multiple
                disabled={pendente}
                className="text-fs-2"
                onChange={(e) => {
                  const lista = Array.from(e.target.files ?? []);
                  if (lista.length) verPrevia(lista);
                }}
              />
            </section>
            </div>
            {pendente && <p className="text-fs-2 text-fg-muted" role="status">Lendo os eventos…</p>}
            {estado && !estado.ok && <Aviso tom="perigo">{estado.texto}</Aviso>}
          </div>
        )}

        {previa && (
          <div className="flex flex-col gap-4">
            <p className="text-fs-3">
              {previa.length} trabalhador(es) encontrados. Confira e desmarque quem não deve entrar.
            </p>
            {estado?.ok && estado.etapa === "previa" && estado.problemas.length > 0 && (
              <Aviso tom="atencao">
                <ul className="list-disc pl-4">
                  {estado.problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Aviso>
            )}
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto border border-border rounded-md">
              <table className="w-full min-w-[760px] text-fs-3">
                <thead className="sticky top-0 bg-surface-elevated">
                  <tr>
                    <th className={`${TH} pl-3`}>
                      <span className="sr-only">Importar</span>
                    </th>
                    <th className={TH}>Nome</th>
                    <th className={TH}>Situação</th>
                    <th className={TH}>Admissão</th>
                    <th className={`${TH_NUM} pr-8`}>Salário</th>
                    <th className={TH}>Cargo</th>
                    <th className={TH_NUM}>Dep.</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.map((l) => (
                    <tr key={l.cpf} className={TR}>
                      <td className={`${TD} pl-3 align-middle`}>
                        <Checkbox
                          id={`importar-${l.cpf}`}
                          aria-label={`Importar ${l.nome}`}
                          disabled={!marcavel(l)}
                          checked={marcavel(l) && !desmarcados.has(l.cpf)}
                          onChange={(e) => {
                            const s = new Set(desmarcados);
                            if (e.target.checked) s.delete(l.cpf);
                            else s.add(l.cpf);
                            setDesmarcados(s);
                          }}
                        />
                      </td>
                      <td className={TD}>
                        <span className="font-medium">{l.nome}</span>
                        {l.motivo && <span className="block text-fs-2 text-fg-muted">{l.motivo}</span>}
                      </td>
                      <td className={TD}>
                        <Selo tom={TOM[l.situacao]}>{NOME[l.situacao]}</Selo>
                        {l.situacao === "EXISTE" && l.temContrato && <span className="block text-fs-2 text-fg-muted">já tem contrato</span>}
                      </td>
                      <td className={`${TD} tabular-nums`}>{dataBr(l.admissao)}</td>
                      <td className={`${TD_NUM} pr-8`}>{l.salario !== null ? `${brl(l.salario)}${l.tipoSalario === "HORISTA" ? "/h" : ""}` : "—"}</td>
                      <td className={TD}>{l.cargo ?? "—"}</td>
                      <td className={TD_NUM}>{l.dependentes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2">
              <Checkbox id="incluirDesligados" label="Trazer também os desligados (entram inativos)" checked={incluirDesligados} onChange={(e) => setIncluirDesligados(e.target.checked)} />
              <Checkbox
                id="atualizarExistentes"
                label="Para quem já está cadastrado, trocar o que já tem valor pelo do eSocial (sem marcar, só preenche o que está vazio)"
                checked={atualizar}
                onChange={(e) => setAtualizar(e.target.checked)}
              />
            </div>
            <Aviso tom="info">Conta bancária, insalubridade, periculosidade e vale-transporte não vêm do eSocial: confira no contrato de cada um depois.</Aviso>
            {estado && !estado.ok && <Aviso tom="perigo">{estado.texto}</Aviso>}
            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => setEstado(null)} disabled={pendente}>
                Voltar
              </Button>
              <Button onClick={importar} loading={pendente} loadingLabel="Importando…" disabled={vaiImportar.length === 0}>
                Importar {vaiImportar.length} colaborador(es)
              </Button>
            </div>
          </div>
        )}

        {estado?.ok && estado.etapa === "feita" && (
          <div className="flex flex-col gap-4">
            <Aviso tom="sucesso">{estado.texto}</Aviso>
            {estado.resultado.fora.length > 0 && (
              <div>
                <h3 className="text-fs-3 font-semibold text-fg mb-1">Ficaram de fora</h3>
                <ul className="text-fs-2 text-fg-muted list-disc pl-4">
                  {estado.resultado.fora.map((f) => (
                    <li key={f.nome}>
                      {f.nome}: {f.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={fechar}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
