"use client";

import { useId, useState, useTransition } from "react";
import { Download, Eye, FileSearch, KeyRound, Plus, PlugZap, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { ItemDoMenu } from "@/components/ui/Popover";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { MenuDeMaisAcoes } from "@/components/admin/AcoesDoItem";
import { contasDoOmieAction, importarNotasOmieAction, previaDasNotasOmieAction, salvarContaOmieAction, testarContaOmieAction } from "@/app/(app)/admin/integracoes/omie-actions";
import type { ContaOmieNaTela } from "@/lib/integracoes/omie/contas";
import type { Saude } from "@/lib/integracoes/execucao";
import type { PreviaDeChamada } from "@/lib/integracoes/omie/contas";

type Previa = { nfe: PreviaDeChamada; nfse: PreviaDeChamada } | { erro: string };

function BlocoDaPrevia({ titulo, p }: { titulo: string; p: PreviaDeChamada }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold mb-1">{titulo}</p>
      {!p.ok ? (
        <p className="text-[12px] text-danger">{p.erro}</p>
      ) : (
        <div className="max-h-72 overflow-auto rounded border border-border-soft">
          <table className="w-full text-[11px]">
            <tbody>
              {p.estrutura.map((l) => (
                <tr key={l.caminho} className="border-b border-border-soft align-top">
                  <td className="py-0.5 px-1.5 font-mono text-fg-secondary break-all">{l.caminho}</td>
                  <td className="py-0.5 px-1.5 text-fg-muted whitespace-nowrap">{l.tipo}</td>
                  <td className="py-0.5 px-1.5 break-all">{l.exemplo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SAUDE: Record<Saude, { rotulo: string; variante: "success" | "warning" | "danger" | "info" }> = {
  nunca_rodou: { rotulo: "Não testada", variante: "info" },
  ok: { rotulo: "Conectada", variante: "success" },
  com_erro: { rotulo: "Com erro", variante: "danger" },
  desligada: { rotulo: "Desligada", variante: "info" },
  parada: { rotulo: "Parada", variante: "warning" },
};

function FormConta({ empresas, inicial, onFim }: { empresas: { id: string; nome: string }[]; inicial?: { companyId: string; appKey: string }; onFim: () => void }) {
  const [companyId, setCompanyId] = useState(inicial?.companyId ?? "");
  const [appKey, setAppKey] = useState(inicial?.appKey ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  // A tela pode ter dois destes abertos (conta nova e troca de chave numa linha).
  const id = useId();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await salvarContaOmieAction({ companyId, appKey, appSecret });
          if ("error" in r) setErro(r.error);
          else onFim();
        });
      }}
    >
      {/* Rótulo padrão (CampoForm) no lugar do <label> de 12px cinza, e
          rodapé com Cancelar antes de Salvar, à direita. Na troca de chave só
          há dois campos, e eles dividem a linha em duas colunas, sem um terço
          vazio no fim. */}
      {inicial && <input type="hidden" name="companyId" value={companyId} />}
      <FieldGrid columns={inicial ? "sm:grid-cols-2" : "md:grid-cols-3"}>
        {!inicial && (
          <CampoForm label="Empresa" htmlFor={`${id}-empresa`}>
            <SearchableSelect
              id={`${id}-empresa`}
              name="companyId"
              options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
              placeholder="Buscar empresa…"
              onChange={setCompanyId}
            />
          </CampoForm>
        )}
        <CampoForm label="App Key" htmlFor={`${id}-app-key`}>
          <Input id={`${id}-app-key`} value={appKey} onChange={(e) => setAppKey(e.target.value)} autoComplete="off" />
        </CampoForm>
        <CampoForm label="App Secret" htmlFor={`${id}-app-secret`}>
          <Input
            id={`${id}-app-secret`}
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            autoComplete="new-password"
            placeholder={inicial ? "Em branco mantém o atual" : ""}
          />
        </CampoForm>
      </FieldGrid>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {erro && <span className="mr-auto text-[length:var(--fs-helper)] font-medium text-danger">{erro}</span>}
        <Button variant="secondary" onClick={onFim}>
          Cancelar
        </Button>
        <Button type="submit" loading={pendente} disabled={pendente}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

/**
 * Uma conta do Omie por empresa cliente. A 41 opera o Omie dos clientes do BPO;
 * cada empresa tem App Key e App Secret próprios (no Omie, em Configurações ›
 * Aplicativos). Login e senha do Omie não servem para a API.
 */
export function ContasOmie({ contas, empresas }: { contas: ContaOmieNaTela[]; empresas: { id: string; nome: string }[] }) {
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [teste, setTeste] = useState<Record<string, { ok: boolean; texto: string }>>({});
  const [testando, setTestando] = useState<string | null>(null);
  const [previas, setPrevias] = useState<Record<string, Previa>>({});
  const [lendo, setLendo] = useState<string | null>(null);
  // Empresas com prévia das contas feita nesta tela: só elas oferecem gravar.
  const [contasVistas, setContasVistas] = useState<Record<string, boolean>>({});

  // A chamada ao servidor pode cair (deploy no meio, proxy devolvendo 503):
  // sem isto a linha ficava "lendo" para sempre, sem mensagem — visto na
  // bateria de testes de 25/09.
  const FALHA_DE_REDE = "O servidor não respondeu. Tente de novo em alguns segundos.";

  async function lerContas(companyId: string, gravar: boolean) {
    setTestando(companyId);
    try {
      const r = await contasDoOmieAction(companyId, gravar);
      const prefixo = gravar ? "Contas importadas: " : "Prévia das contas (nada gravado): ";
      setTeste((t) => ({ ...t, [companyId]: "error" in r ? { ok: false, texto: r.error } : { ok: true, texto: prefixo + (r.mensagem ?? "") } }));
      if (!("error" in r) && !gravar) setContasVistas((v) => ({ ...v, [companyId]: true }));
    } catch {
      setTeste((t) => ({ ...t, [companyId]: { ok: false, texto: FALHA_DE_REDE } }));
    } finally {
      setTestando(null);
    }
  }

  async function previa(companyId: string) {
    setLendo(companyId);
    try {
      const r = await previaDasNotasOmieAction(companyId);
      setPrevias((p) => ({ ...p, [companyId]: r }));
    } catch {
      setTeste((t) => ({ ...t, [companyId]: { ok: false, texto: FALHA_DE_REDE } }));
    } finally {
      setLendo(null);
    }
  }
  const semConta = empresas.filter((e) => !contas.some((c) => c.companyId === e.id));

  async function importar(companyId: string) {
    setTestando(companyId);
    try {
      const r = await importarNotasOmieAction(companyId);
      setTeste((t) => ({ ...t, [companyId]: "error" in r ? { ok: false, texto: r.error } : { ok: true, texto: r.mensagem ?? "Notas lidas." } }));
    } catch {
      setTeste((t) => ({ ...t, [companyId]: { ok: false, texto: FALHA_DE_REDE } }));
    } finally {
      setTestando(null);
    }
  }

  async function testar(companyId: string) {
    setTestando(companyId);
    try {
      const r = await testarContaOmieAction(companyId);
      setTeste((t) => ({ ...t, [companyId]: "error" in r ? { ok: false, texto: r.error } : { ok: true, texto: r.mensagem ?? "Conectado." } }));
    } catch {
      setTeste((t) => ({ ...t, [companyId]: { ok: false, texto: FALHA_DE_REDE } }));
    } finally {
      setTestando(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-fg">Omie por empresa</h3>
          <p className="text-[12px] text-fg-muted mt-0.5 max-w-[680px]">
            Uma conta do Omie para cada empresa cliente do BPO. A App Key e o App Secret ficam no Omie da empresa, em
            Configurações › Aplicativos — login e senha não servem para a API. &ldquo;Testar&rdquo; lê os dados da empresa
            no Omie e confere o CNPJ, para pegar chave colada na empresa errada. As notas de saída emitidas no Omie entram no
            acervo fiscal a cada 30 minutos (ou em &ldquo;Importar notas&rdquo;), inclusive as das filiais cadastradas no Connect
            com esta empresa como matriz — cadastre a conta na matriz. As contas a pagar e a receber do Omie entram no
            financeiro da empresa em &ldquo;Importar contas&rdquo;, depois da prévia, e a partir daí se atualizam sozinhas a cada 6
            horas. Só leitura: nada é alterado no Omie.
          </p>
        </div>
        {!novo && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus size={14} /> Adicionar empresa
          </Button>
        )}
      </div>

      {novo && (
        <div className="mb-4 rounded-md border border-border p-4">
          <FormConta empresas={semConta} onFim={() => setNovo(false)} />
        </div>
      )}

      {contas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nenhuma empresa com conta do Omie cadastrada ainda.</p>
      ) : (
        // Casco padrão dentro do cartão e funil na situação (polimento de
        // 30/09). As ações eram cinco textos cinza e dois botões na mesma
        // célula: ficam à vista "Testar" e, depois da prévia, "Importar
        // contas"; o resto vai no "⋯".
        <TabelaFiltravel
          linhas={contas.map((c) => ({ id: c.companyId, valores: { situacao: SAUDE[c.saude].rotulo } }))}
        >
          <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3">Empresa</th>
                  <th className="py-2 pr-3">App Key</th>
                  <th className="py-2 pr-3">
                    <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                  </th>
                  <th className="py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) =>
                  editando === c.companyId ? (
                    <tr key={c.companyId} className="border-b border-border-soft">
                      <td colSpan={4} className="py-3 text-left!">
                        <p className="text-[12px] font-medium mb-2">{c.empresa}</p>
                        <FormConta empresas={[]} inicial={{ companyId: c.companyId, appKey: c.appKey }} onFim={() => setEditando(null)} />
                      </td>
                    </tr>
                  ) : (
                    <LinhaFiltravel key={c.companyId} id={c.companyId} className="border-b border-border-soft align-top">
                      <td className="py-2.5 pr-3 font-medium">{c.empresa}</td>
                      <td className="py-2.5 pr-3 text-fg-secondary tnum">{c.appKey || "—"}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant={SAUDE[c.saude].variante}>{SAUDE[c.saude].rotulo}</Badge>
                        {testando === c.companyId || lendo === c.companyId ? (
                          // A consulta que saiu do "⋯" não tem mais botão para
                          // dizer "Lendo…": o aviso fica aqui, onde o resultado vai aparecer.
                          <span className="block text-[11px] mt-1 text-fg-muted">Consultando o Omie…</span>
                        ) : teste[c.companyId] ? (
                          <span className={`block text-[11px] mt-1 ${teste[c.companyId].ok ? "text-success" : "text-danger"}`}>{teste[c.companyId].texto}</span>
                        ) : (
                          c.lastError && <span className="block text-[11px] mt-1 text-danger">{c.lastError}</span>
                        )}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {/* Só `disabled`, e não `loading`: o `loading` do
                              Button escreve "Salvando…", e aqui nada está sendo
                              salvo — o andamento aparece na coluna Situação. */}
                          <Button variant="secondary" size="xs" disabled={testando !== null} onClick={() => testar(c.companyId)}>
                            <PlugZap size={11} /> Testar
                          </Button>
                          {c.saude === "ok" && contasVistas[c.companyId] && (
                            <Button variant="secondary" size="xs" disabled={testando !== null} onClick={() => lerContas(c.companyId, true)}>
                              <Download size={11} /> Importar contas
                            </Button>
                          )}
                          <MenuDeMaisAcoes rotulo={`Mais ações de ${c.empresa}`} largura={200}>
                            {(fechar) => (
                              <>
                                <ItemDoMenu
                                  icone={<KeyRound />}
                                  onClick={() => {
                                    fechar();
                                    setEditando(c.companyId);
                                  }}
                                >
                                  Trocar chave
                                </ItemDoMenu>
                                {c.saude === "ok" && (
                                  <>
                                    <ItemDoMenu
                                      icone={<RefreshCw />}
                                      disabled={testando !== null}
                                      onClick={() => {
                                        fechar();
                                        importar(c.companyId);
                                      }}
                                    >
                                      Importar notas
                                    </ItemDoMenu>
                                    <ItemDoMenu
                                      icone={<FileSearch />}
                                      disabled={lendo !== null}
                                      onClick={() => {
                                        fechar();
                                        previa(c.companyId);
                                      }}
                                    >
                                      Prévia das notas
                                    </ItemDoMenu>
                                    <ItemDoMenu
                                      icone={<Eye />}
                                      disabled={testando !== null}
                                      onClick={() => {
                                        fechar();
                                        lerContas(c.companyId, false);
                                      }}
                                    >
                                      Prévia das contas
                                    </ItemDoMenu>
                                  </>
                                )}
                              </>
                            )}
                          </MenuDeMaisAcoes>
                        </span>
                      </td>
                    </LinhaFiltravel>
                  )
                )}
                {contas
                  .filter((c) => previas[c.companyId])
                  .map((c) => {
                    const p = previas[c.companyId];
                    return (
                      <tr key={`${c.companyId}-previa`} className="border-b border-border-soft">
                        {/* A prévia é um despejo da estrutura do Omie, lido
                            linha a linha: alinhado à esquerda, fora da regra de
                            centralizar do casco. */}
                        <td colSpan={4} className="py-3 text-left!">
                          <p className="text-[12px] mb-2">
                            <span className="font-medium">Prévia das notas — {c.empresa}.</span>{" "}
                            <span className="text-fg-muted">Só leitura: nada foi gravado no Connect nem alterado no Omie.</span>
                          </p>
                          {"erro" in p ? (
                            <p className="text-[12px] text-danger">{p.erro}</p>
                          ) : (
                            <div className="grid gap-3 lg:grid-cols-2">
                              <BlocoDaPrevia titulo="NF-e (produtos/nfconsultar · ListarNF)" p={p.nfe} />
                              <BlocoDaPrevia titulo="NFS-e (servicos/nfse · ListarNFSEs)" p={p.nfse} />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </TabelaFiltravel>
      )}
    </Card>
  );
}
