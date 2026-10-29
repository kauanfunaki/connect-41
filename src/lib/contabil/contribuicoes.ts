// A aba "Gerar SPED Contribuições" (29/10/2026): o que o motor do SPED
// Generator diz da raiz da empresa naquele mês — os pedidos de geração e os
// arquivos gerados. Nada é processado aqui; quem gera é o agente do motor.

import "server-only";
import { abrirMotor } from "@/lib/fiscal/motor/servidor";
import { ErroDoMotor, type ArquivoDoMotor, type ExecucaoDoMotor } from "@/lib/sped/motor";

export type PainelDeContribuicoes =
  | { situacao: "sem_motor" }
  | { situacao: "sem_cnpj" }
  | { situacao: "raiz_fora"; raiz: string }
  | { situacao: "erro"; raiz: string; mensagem: string }
  | { situacao: "pronto"; raiz: string; escrita: boolean; execucoes: ExecucaoDoMotor[]; arquivos: ArquivoDoMotor[] };

export async function painelDeContribuicoes(tenantId: string, cnpj: string, competencia: string): Promise<PainelDeContribuicoes> {
  const motor = await abrirMotor(tenantId);
  if (!motor) return { situacao: "sem_motor" };
  if (cnpj.length !== 14) return { situacao: "sem_cnpj" };
  const raiz = cnpj.slice(0, 8);
  // A raiz vem do alcance da equipe, nunca da URL: fora dele, o motor nem é chamado.
  if (!motor.raizes.includes(raiz)) return { situacao: "raiz_fora", raiz };
  try {
    const [execucoes, arquivos] = await Promise.all([
      motor.cliente.listarExecucoes(raiz, { acao: "sped_contribuicoes", competencia, limite: 5 }),
      motor.cliente.listarArquivos(raiz, { competencia, obrigacao: "contribuicoes", limite: 10 }),
    ]);
    return { situacao: "pronto", raiz, escrita: motor.escrita, execucoes: execucoes.itens, arquivos: arquivos.itens };
  } catch (err) {
    const mensagem = err instanceof ErroDoMotor ? err.message : "Não foi possível consultar o motor SPED.";
    if (!(err instanceof ErroDoMotor)) console.error("[contabil/contribuicoes]", err);
    return { situacao: "erro", raiz, mensagem };
  }
}
