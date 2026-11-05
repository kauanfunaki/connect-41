"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, GitCommitHorizontal, GitPullRequest, MessageSquare, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CartoesNoCelular, TabelaNoDesktop, Cartao } from "@/components/shared/ListaResponsiva";
import { avatarDoGithub, iniciaisDoLogin } from "@/lib/github/avatar";
import { dateLabel } from "@/lib/github/calendar";
import { corDaPessoa, COR_SEM_TIME, type ModoDeCor, type Paleta } from "@/lib/github/cores";
import { ContributionCalendar } from "./ContributionCalendar";
import { TYPE_LABELS, type DashboardView, type GithubSummary } from "@/lib/github/types";
import { formatCalendarDate, formatInstantDateTime } from "@/lib/format";
import { ROTAS_DO_GITHUB } from "@/lib/tech-interno/rotasDaProdutividade";
import styles from "./GithubContributions.module.css";

const number = (value: number) => Number(value).toLocaleString("pt-BR");
// O selo de um time (05/11/2026): a cor dele com as iniciais, no lugar das fotos.
export function SeloDoTime({ nome, cor }: { nome: string; cor: string }) {
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toLocaleUpperCase("pt-BR") || "?";
  return <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-micro font-bold text-white" style={{ background: cor }}>{iniciais}</span>;
}
// "Atividade do time" por time (05/11/2026): soma as pessoas de cada time; quem
// está sem time entra em "Sem time", sempre por último.
type Lider = GithubSummary["leaders"][number];
function timesDoPainel(leaders: Lider[], paleta: Paleta) {
  const grupos = new Map<string, { id: string; nome: string; cor: string; total: number; pessoas: Lider[] }>();
  for (const pessoa of leaders) {
    const time = paleta.times.find(item => item.id === paleta.pessoas[pessoa.id]?.time), id = time?.id ?? "";
    const grupo = grupos.get(id) ?? { id, nome: time?.nome ?? "Sem time", cor: time?.cor ?? COR_SEM_TIME, total: 0, pessoas: [] };
    grupo.total += pessoa.total; grupo.pessoas.push(pessoa); grupos.set(id, grupo);
  }
  return [...grupos.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.total - a.total);
}
// A foto do GitHub; sem login de conta ou com a imagem fora do ar, as iniciais.
export function DeveloperAvatar({ login }: { login: string }) {
  const src = avatarDoGithub(login), [falhou, setFalhou] = useState<string | null>(null);
  if (!src || falhou === src) return <span aria-hidden className={styles.avatar}>{iniciaisDoLogin(login)}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- foto de 32px já no tamanho pedido ao GitHub: o otimizador do next/image não teria o que fazer
  return <img src={src} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" className={styles.avatar} onError={() => setFalhou(src)} />;
}

// "login — nome no Connect" de quem vinculou a conta em Sua conta (27/10/2026).
export function DeveloperName({ login, name }: { login: string; name: string | null }) {
  return <><span>{login}</span>{name && <span className={styles.developerName}> — {name}</span>}</>;
}

export function GithubOverview({ data, query, modo, onDay }: { data: DashboardView; query: string; modo: ModoDeCor; onDay: (id: string, day: string) => void }) {
  const summary = data.summary;
  const developers = new URLSearchParams(query); developers.delete("page"); developers.delete("view");
  const developersHref = `${ROTAS_DO_GITHUB.developers}?${developers}`;
  return <>
    <FaixaDeTotais itens={[
      { rotulo: "Total de commits", valor: number(summary?.counts.COMMIT ?? 0), icone: <GitCommitHorizontal /> },
      { rotulo: "Pull requests", valor: number(summary?.counts.PULL_REQUEST ?? 0), icone: <GitPullRequest /> },
      { rotulo: "Revisões", valor: number(summary?.counts.REVIEW ?? 0), icone: <MessageSquare /> },
      { rotulo: "Desenvolvedores ativos", valor: number(summary?.activeDevelopers ?? 0), icone: <Users /> },
    ]} />
    {/* Calendário do time (04/11/2026): cada dia com a cor de quem contribuiu nele;
        com mais de uma pessoa (ou time), as cores se misturam. */}
    <section className={`${styles.panel} mb-5`} aria-labelledby="github-team-calendar">
      <div className={styles.panelHeading}><div><h2 id="github-team-calendar">Calendário do time</h2>
        <p>{modo === "time" ? "A cor de cada dia é a do time que contribuiu; dias com mais de um time misturam as cores." : "A cor de cada dia é a de quem contribuiu; dias com mais de uma pessoa misturam as cores."}</p></div></div>
      <div className="px-[22px] py-4"><ContributionCalendar label="todo o time" id="team" from={data.from} to={data.to} days={summary?.calendar ?? []} onDay={onDay} paleta={data.paleta} modo={modo} /></div>
    </section>
    <div className={styles.overviewGrid}>
      <section className={styles.panel} aria-labelledby="github-cadence">
        <div className={styles.panelHeading}><div><h2 id="github-cadence">Cadência de entregas</h2><p>Commits e pull requests no período</p></div>
          <div className={styles.legend}><span><i /> Commits</span><span><i data-pr /> Pull requests</span></div>
        </div>
        <CadenceChart data={data} />
      </section>
      <section className={styles.panel} aria-labelledby="github-team">
        <div className={styles.panelHeading}><div><h2 id="github-team">Atividade do time</h2><p>Contribuições no período</p></div><Link href={developersHref}>Ver todos</Link></div>
        <div className={styles.leaders}>{modo === "time" && summary?.leaders.length ? timesDoPainel(summary.leaders, data.paleta).map((time, index) => <div key={time.id} className={styles.person}>
          <span className={styles.position}>{String(index + 1).padStart(2, "0")}</span>
          <SeloDoTime nome={time.nome} cor={time.cor} />
          <Link href={`${ROTAS_DO_GITHUB.developers}?${new URLSearchParams({ ...Object.fromEntries(developers), cor: "time", ...(time.id ? { time: time.id } : {}) })}`} className={styles.personName}>
            <span title={time.pessoas.map(p => p.name ?? p.login).join(", ")}>{time.nome}</span></Link>
          <span className={styles.personCount}><strong>{number(time.total)}</strong><small>contribuições</small></span>
        </div>) : summary?.leaders.length ? summary.leaders.slice(0, 4).map((person, index) => <div key={person.id} className={styles.person}>
          <span className={styles.position}>{String(index + 1).padStart(2, "0")}</span><span className="relative"><DeveloperAvatar login={person.login} />
            <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface" style={{ background: corDaPessoa(person.id, data.paleta, modo) }} /></span>
          <Link href={`${ROTAS_DO_GITHUB.developers}?${new URLSearchParams({ ...Object.fromEntries(developers), user: person.login })}`} className={styles.personName}><DeveloperName login={person.login} name={person.name} /></Link>
          <span className={styles.personCount}><strong>{number(person.total)}</strong><small>contribuições</small></span>
        </div>) : <EmptyState icon={<Users />} title="Nenhuma atividade no período" />}</div>
      </section>
    </div>
    <section className={styles.panel} aria-labelledby="github-recent">
      <div className={styles.panelHeading}><div><h2 id="github-recent">Atividade recente</h2><p>{number(data.total)} contribuições no período</p></div></div>
      <RecentActivity summary={summary} timezone={data.timezone} />
    </section>
  </>;
}

function CadenceChart({ data }: { data: DashboardView }) {
  const days = new Map(data.summary?.days.map(row => [row.day, row.counts]) ?? []);
  const values: { day: string; commits: number; prs: number }[] = [];
  const start = Date.parse(`${data.from}T12:00:00Z`), end = Date.parse(`${data.to}T12:00:00Z`);
  // Agrupar janelas longas mantém o gráfico legível, sem descartar contribuições.
  const bucket = Math.max(1, Math.ceil(((end - start) / 86400000 + 1) / 30));
  for (let cursor = start; cursor <= end; cursor += bucket * 86400000) {
    let commits = 0, prs = 0;
    for (let offset = 0; offset < bucket && cursor + offset * 86400000 <= end; offset++) {
      const day = new Date(cursor + offset * 86400000).toISOString().slice(0, 10), counts = days.get(day);
      commits += counts?.COMMIT ?? 0; prs += counts?.PULL_REQUEST ?? 0;
    }
    values.push({ day: new Date(cursor).toISOString().slice(0, 10), commits, prs });
  }
  const max = Math.max(4, ...values.flatMap(row => [row.commits, row.prs])), ceiling = Math.ceil(max / 4) * 4;
  const x = (index: number) => 42 + index / Math.max(1, values.length - 1) * 678;
  const y = (value: number) => 172 - value / ceiling * 148;
  const points = (key: "commits" | "prs") => values.map((row, index) => `${x(index)},${y(row[key])}`).join(" ");
  const hasActivity = values.some(row => row.commits || row.prs);
  return <div className={styles.chart}>
    {hasActivity ? <svg viewBox="0 0 744 218" role="img" aria-label={`Cadência de commits e pull requests de ${dateLabel(data.from)} a ${dateLabel(data.to)}`}>
      {[0, 1, 2, 3, 4].map(step => <g key={step}><line x1="42" x2="720" y1={y(step * ceiling / 4)} y2={y(step * ceiling / 4)} className={styles.gridLine} /><text x="28" y={y(step * ceiling / 4) + 4} textAnchor="end">{number(step * ceiling / 4)}</text></g>)}
      <polygon points={`42,172 ${points("commits")} ${x(values.length - 1)},172`} className={styles.serieArea} />
      <polyline points={points("commits")} fill="none" className={styles.serieCommits} strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={points("prs")} className={styles.seriePrs} strokeWidth="2" strokeDasharray="5 4" />
      {values.map((row, index) => <g key={row.day}><circle cx={x(index)} cy={y(row.commits)} r="3" className={styles.serieCommits}><title>{dateLabel(row.day)}: {row.commits} commits e {row.prs} pull requests{bucket > 1 ? ` em até ${bucket} dias` : ""}</title></circle>
        {(index === 0 || index === values.length - 1 || values.length > 5 && index === Math.floor(values.length / 2)) && <text x={x(index)} y="203" textAnchor={index === 0 ? "start" : index === values.length - 1 ? "end" : "middle"}>{formatCalendarDate(new Date(`${row.day}T12:00:00Z`), { day: "2-digit", month: "short" })}</text>}</g>)}
    </svg> : <EmptyState icon={<GitCommitHorizontal />} title="Nenhum commit ou pull request no período" />}
  </div>;
}

function RecentActivity({ summary, timezone }: { summary: GithubSummary | null; timezone: string }) {
  if (!summary?.recent.length) return <EmptyState icon={<Activity />} title="Nenhuma atividade neste período" />;
  const atividade = (event: GithubSummary["recent"][number]) => <a href={event.url} target="_blank" rel="noreferrer" className={styles.activityLink}>
    <span className={styles.activityIcon} data-pr={event.type !== "COMMIT" || undefined}>{event.type === "COMMIT" ? <GitCommitHorizontal size={18} /> : <GitPullRequest size={18} />}</span>
    <span className="min-w-0"><strong>{TYPE_LABELS[event.type]} <span className={styles.reference}>{event.reference}</span></strong><small>{event.title ? `${event.title} · ` : ""}{event.repository}</small></span>
  </a>;
  const quando = (event: GithubSummary["recent"][number]) => <time dateTime={event.occurredAt}>{formatInstantDateTime(new Date(event.occurredAt), { timeZone: timezone })}</time>;
  // No celular, cartões no lugar da tabela que só rolava de lado (26/10/2026).
  return <>
    <CartoesNoCelular className={styles.activityCards}>{summary.recent.map(event => <Cartao key={event.id} className={styles.activityCard}>
      {atividade(event)}
      <div className={styles.activityCardFoot}><span className={styles.developerCell}><DeveloperAvatar login={event.login} /><span><DeveloperName login={event.login} name={event.name} /></span></span>{quando(event)}</div>
    </Cartao>)}</CartoesNoCelular>
    <TabelaNoDesktop><table className={styles.activityTable}><thead><tr><th>Atividade</th><th>Desenvolvedor</th><th>Quando</th></tr></thead>
      <tbody>{summary.recent.map(event => <tr key={event.id}>
        <td>{atividade(event)}</td>
        <td><span className={styles.developerCell}><DeveloperAvatar login={event.login} /><span><DeveloperName login={event.login} name={event.name} /></span></span></td>
        <td>{quando(event)}</td>
      </tr>)}</tbody>
    </table></TabelaNoDesktop>
  </>;
}
