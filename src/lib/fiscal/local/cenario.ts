import { criarCenario } from "@/lib/fiscal/previa/cenario";

/** O banco começa com documentos fictícios, sem gerações ou protocolos prontos. */
export function criarCenarioFiscalLocal() {
  const cenario = criarCenario();
  cenario.arquivos = [];
  cenario.execucoes = [];
  cenario.atividades = [];
  return cenario;
}
