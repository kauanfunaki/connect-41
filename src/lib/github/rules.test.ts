import { describe, expect, it } from "vitest";
import { dayAt, filtersSchema, identity, normalize, period, safeGithubUrl } from "./rules";
import { calendarDays, calendarLevel } from "./calendar";

const author = { node_id: "U_fictional", login: "pessoa-ficticia", type: "User" };
const issue = { node_id: "I_fictional", user: author, created_at: "2026-10-20T23:00:00Z", html_url: "https://github.com/example/test/issues/1", number: 1 };
describe("regras do heatmap GitHub", () => {
  it("usa o dia do escritório em vez do UTC na virada de meia-noite", () => {
    expect(dayAt(new Date("2026-10-21T02:59:59Z"))).toBe("2026-10-20");
    expect(dayAt(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-21");
    expect(dayAt(new Date("2026-10-21T02:59:59Z"), "UTC")).toBe("2026-10-21");
  });
  it("recusa datas inexistentes, intervalo invertido e consulta excessiva", () => {
    expect(filtersSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(() => period(filtersSchema.parse({ from: "2026-10-21", to: "2026-10-01" }), new Date(), "UTC")).toThrow();
    expect(() => period(filtersSchema.parse({ from: "2024-01-01", to: "2026-10-21" }), new Date(), "UTC")).toThrow();
    expect(filtersSchema.safeParse({ type: "PUSH" }).success).toBe(false);
  });
  it("o período padrão permanece consultável em ano bissexto", () => {
    const dates = period(filtersSchema.parse({}), new Date("2024-03-01T12:00:00Z"), "UTC");
    expect(dates).toEqual({ from: "2023-03-02", to: "2024-03-01" });
    expect(() => period(filtersSchema.parse(dates), new Date(), "UTC")).not.toThrow();
  });
  it("não conta pull request também como issue", () => {
    expect(normalize({ ...issue, pull_request: { url: "https://api.github.com/fiction" } }, "ISSUE")).toBeNull();
    expect(normalize(issue, "ISSUE")?.type).toBe("ISSUE");
    expect(normalize(issue, "PULL_REQUEST")?.type).toBe("PULL_REQUEST");
  });
  it("conta só revisões submetidas e mantém a identidade do revisor", () => {
    const review = { ...issue, state: "PENDING", submitted_at: null };
    expect(normalize(review, "REVIEW")).toBeNull();
    expect(normalize({ ...review, state: "APPROVED", submitted_at: "2026-10-20T11:00:00Z" }, "REVIEW")?.user.externalId).toBe(author.node_id);
  });
  it("separa autoria desconhecida, bots e IDs opacos de nomes e e-mails", () => {
    expect(identity(null)).toMatchObject({ unidentified: true });
    expect(identity({ ...author, login: "robot[bot]" })).toMatchObject({ isBot: true });
    expect(identity({ ...author, node_id: "U_900719925474099399999", login: "nome-novo" }).externalId).toBe("U_900719925474099399999");
    const commit = normalize({ sha: "a".repeat(40), author: null, html_url: "https://github.com/example/test/commit/aaa", commit: { committer: { date: "2026-10-20T11:00:00Z" }, author: { name: "Pessoa conhecida", email: "privado@example.test" } } }, "COMMIT");
    expect(commit?.user.unidentified).toBe(true);
    expect(commit).not.toHaveProperty("email");
  });
  it("recusa links externos ou com credencial na resposta", () => {
    for (const value of ["javascript:alert(1)", "https://github.com.evil.test/a", "https://token@github.com/a", "http://github.com/a"]) expect(() => safeGithubUrl(value)).toThrow();
  });
  it("organiza semanas com padding sem inventar datas, inclusive 29 de fevereiro", () => {
    const days = calendarDays("2024-02-28", "2024-03-02");
    expect(days.filter(Boolean)).toEqual(["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02"]);
    expect(days.length % 7).toBe(0);
    expect(calendarDays("2026-10-21", "2026-10-01")).toEqual([]);
    expect([0, 1, 3, 6, 10, 100].map(calendarLevel)).toEqual([0, 1, 2, 3, 4, 4]);
  });
});
