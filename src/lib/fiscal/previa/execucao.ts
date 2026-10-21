import { z } from "zod";

export const MODOS_EXECUCAO = {
  paralela: "Extração paralela", simples: "Extração única", erros: "Retentar erros",
  sped: "Gerar ICMS/IPI", sped_contribuicoes: "Gerar Contribuições",
} as const;
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Informe uma data válida.");
export const parametrosExecucaoSchema = z.object({
  modo: z.enum(["paralela", "simples", "erros", "sped", "sped_contribuicoes"]),
  dataIni: data, dataFim: data, solicitante: z.string().max(200),
  etapas: z.array(z.enum(["first_mile", "last_mile"])).max(2), semEntradas: z.boolean(),
  instancias: z.number().int().min(1).max(16), workers: z.number().int().min(1).max(64),
  tipoSped: z.enum(["0", "1"]).optional(), saida: z.string().max(200).refine((v) => !/[\\/:*?"<>|\r\n]/.test(v), "Informe somente o nome do arquivo, sem caminho."),
  forcarErros: z.boolean(), forcarCobertura: z.boolean(),
}).superRefine((p, ctx) => {
  const erro = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (p.dataFim < p.dataIni) erro("dataFim", "A data final deve ser igual ou posterior à inicial.");
  if (geracao(p.modo)) {
    if (!p.tipoSped) erro("tipoSped", "Escolha Original ou Substituto.");
    const [ini, fim] = mesInteiro(p.dataIni.slice(0, 7));
    if (p.dataIni !== ini || p.dataFim !== fim) erro("dataFim", "A geração exige um único mês inteiro.");
    if (p.modo === "sped" && !p.saida.trim()) erro("saida", "Informe o nome do arquivo de saída.");
    if (p.modo === "sped_contribuicoes" && (p.forcarErros || p.forcarCobertura)) erro("modo", "As opções de forçar geração pertencem ao ICMS/IPI.");
  } else if (!p.etapas.length) erro("etapas", "Escolha ao menos uma etapa da extração.");
});
export type ParametrosExecucao = z.infer<typeof parametrosExecucaoSchema>;
export type ModoExecucao = ParametrosExecucao["modo"];
export const geracao = (modo: ModoExecucao) => modo === "sped" || modo === "sped_contribuicoes";
export function mesInteiro(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return [`${competencia}-01`, `${competencia}-${String(ultimo).padStart(2, "0")}`] as const;
}
export function parametrosIniciais(competencia: string, modo: ModoExecucao = "paralela"): ParametrosExecucao {
  const [dataIni, dataFim] = mesInteiro(competencia);
  return { modo, dataIni, dataFim, solicitante: "", etapas: ["first_mile", "last_mile"], semEntradas: false,
    instancias: 4, workers: modo === "simples" ? 8 : 32, saida: modo === "sped" ? "saida_sped.txt" : "",
    forcarErros: false, forcarCobertura: false };
}
