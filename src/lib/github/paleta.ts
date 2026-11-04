import { getPrisma } from "@/lib/prisma";
import { corAutomatica, type Paleta } from "./cores";

type Pessoa = { id: string; login: string; externalId: string };

// A paleta de uma resposta do painel (04/11/2026): a cor e o time de cada pessoa
// que aparece nela, mais todos os times. Cor e time são gravados pelo ID estável do
// GitHub (`github_people`); quem não tem cor gravada fica com a automática.
export async function paletaDoPainel(tenantId: string, pessoas: Pessoa[], names: Map<string, string>): Promise<Paleta> {
  const unicas = [...new Map(pessoas.map(pessoa => [pessoa.id, pessoa])).values()];
  const db = getPrisma();
  let gravadas: { externalId: string; color: string | null; teamId: string | null }[] = [], times: { id: string; name: string; color: string }[] = [];
  try {
    [gravadas, times] = await Promise.all([
      unicas.length ? db.githubPerson.findMany({ where: { tenantId, externalId: { in: unicas.map(pessoa => pessoa.externalId) } }, select: { externalId: true, color: true, teamId: true } }) : [],
      db.githubTeam.findMany({ where: { tenantId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true } }),
    ]);
  } catch (error) {
    // Sem a migration dos times aplicada, o painel segue com as cores automáticas.
    console.error("[github] Times e cores indisponíveis", error instanceof Error ? error.name : "erro");
  }
  const porExterno = new Map(gravadas.map(pessoa => [pessoa.externalId, pessoa]));
  return {
    pessoas: Object.fromEntries(unicas.map(pessoa => {
      const gravada = porExterno.get(pessoa.externalId);
      return [pessoa.id, { login: pessoa.login, name: names.get(pessoa.externalId) ?? null, cor: gravada?.color ?? corAutomatica(pessoa.externalId), time: gravada?.teamId ?? null }];
    })),
    times: times.map(time => ({ id: time.id, nome: time.name, cor: time.color })),
  };
}
