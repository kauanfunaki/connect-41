// O emissor de NFS-e por trás da tela Emitir NFS-e (lote 2 da NFS-e, 28/10/2026).
//
// Hoje só o Omie emite: a nota é uma OS faturada no Omie da empresa cliente.
// A Focus NFe (ou outro emissor direto na prefeitura) entra como mais uma
// implementação deste contrato, registrada em ./emissores.ts — as ações da
// tela, a porta de permissão, o foco do BPO, o AuditLog e o cron de
// acompanhamento passam todos por aqui e não sabem qual emissor atende a
// empresa.
//
// Os tipos nasceram com o Omie e continuam lá. O que é só dele — a categoria
// de receita obrigatória, a sugestão tirada da última OS, a competência presa
// ao mês corrente — vira opcional quando o segundo emissor existir de verdade:
// generalizar agora seria adivinhar o formato da Focus antes do contrato.
//
// O que a Focus vai precisar, além de implementar isto: onde guardar as
// emissões (a `OmieEmissao` tem as colunas da OS), o cadastro de tomadores e
// serviços (no Omie eles moram lá; na Focus, no Connect) e o certificado A1 da
// empresa.

import type { EstadoDaEmissao, PedidoDeNfse } from "@/lib/integracoes/omie/emissao";
import type {
  EmissaoNaTela,
  ListasParaATela,
  ResultadoDaBusca,
  ResultadoDaEmissao,
  ResumoDoAcompanhamento,
} from "@/lib/integracoes/omie/emissaoServidor";

export type { EmissaoNaTela, EstadoDaEmissao, ListasParaATela, PedidoDeNfse, ResultadoDaBusca, ResultadoDaEmissao, ResumoDoAcompanhamento };

export type ProvedorDeNfse = "omie";

export type ResultadoDasListas = { ok: true; listas: ListasParaATela } | { ok: false; erro: string };

export type ResultadoDoCancelamento = { ok: true; naPrefeitura: boolean; mensagem: string | null } | { ok: false; erro: string };

export interface EmissorDeNfse {
  readonly provedor: ProvedorDeNfse;
  /** Como a tela e as mensagens chamam o emissor: "Omie". */
  readonly nome: string;
  /** O `entityType` das emissões no AuditLog. */
  readonly entidade: string;

  /**
   * A empresa está cadastrada neste emissor — ligada ou não. Desligada ainda
   * conta: quem responde "a conta está desligada" é o próprio emissor, com a
   * mensagem dele.
   */
  atendeAEmpresa(tenantId: string, companyId: string): Promise<boolean>;
  /** A empresa dona da emissão, quando ela é deste emissor. */
  empresaDaEmissao(tenantId: string, emissaoId: string): Promise<string | null>;

  /** Tomadores e serviços para o formulário, e se a empresa pode emitir. Só leitura. */
  listas(tenantId: string, companyId: string, atualizar: boolean): Promise<ResultadoDasListas>;
  /** O tomador que ficou fora da lista. Só leitura. */
  buscarTomadores(tenantId: string, companyId: string, termo: string): Promise<ResultadoDaBusca>;
  emitir(p: { tenantId: string; companyId: string; userId: string; pedido: PedidoDeNfse }): Promise<ResultadoDaEmissao>;
  cancelar(p: { tenantId: string; emissaoId: string; userId: string }): Promise<ResultadoDoCancelamento>;
  listarEmissoes(tenantId: string, companyId: string): Promise<EmissaoNaTela[]>;
  /** Uma rodada do cron: pergunta pelas notas que a prefeitura ainda não respondeu. */
  acompanhar(agora: Date): Promise<ResumoDoAcompanhamento>;
}
