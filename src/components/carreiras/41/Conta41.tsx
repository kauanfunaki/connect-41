import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardList, LogOut, Video } from "lucide-react";
import type { RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { MARCA_41_CARREIRAS } from "@/lib/carreiras/enderecoDeCarreiras";
import { situacaoParaCandidato } from "@/lib/carreiras/situacaoDoCandidato";
import { formatCalendarDate, formatInstantDate, formatInstantDateTime } from "@/lib/format";
import type { dadosDaConta } from "@/lib/carreiras/conta";
import { AtualizarDados, Desistir, PedirExclusao } from "@/components/carreiras/ContaDoCandidato";
import { sair } from "@/app/carreiras/[slug]/minha-conta/actions";
import { Moldura41 } from "./Moldura41";
import { Entrar41, PedirAcesso41 } from "./AcessoDoCandidato41";
import { TrianguloDaFaixa, TrianguloVazio } from "./Triangulos";

/**
 * A entrada da conta do candidato (15/10/2026): um campo só, "E-mail usado na
 * inscrição", e o link de acesso por e-mail de sempre — sem senha. Com o
 * `token` do link, o botão de entrar; sem nenhum dos dois, o pedido do link.
 */
export function AcessoAConta41({ slug, rotas, token }: { slug: string; rotas: RotasDoPortal; token?: string }) {
  return (
    <Moldura41 rotas={rotas} atual="conta">
      <section className="t41-faixa" aria-labelledby="acesso-titulo">
        <TrianguloDaFaixa />
        <div className="t41-caixa t41-faixa__conteudo">
          <p className="t41-selo t41-selo--lilas">Minhas candidaturas</p>
          <h1 id="acesso-titulo" className="t41-faixa__titulo">
            Acompanhe suas <strong>candidaturas</strong>
          </h1>
          <p className="t41-faixa__texto">Sem senha: enviamos um link de acesso para o e-mail que você usou na inscrição.</p>
        </div>
      </section>
      <div className="t41-caixa t41-acesso">
        <ol className="t41-lista-passos" aria-label="Como entrar">
          <li>
            <strong>Informe o e-mail da inscrição</strong>O mesmo que você usou ao se candidatar.
          </li>
          <li>
            <strong>Abra o link que enviamos</strong>Ele vale por 30 minutos e funciona uma vez. Confira também o spam.
          </li>
          <li>
            <strong>Veja cada candidatura</strong>A etapa de cada uma, a entrevista marcada e o teste para responder. Você fica conectado por 7 dias neste
            aparelho.
          </li>
        </ol>
        <div className="t41-acesso__cartao">
          {token ? (
            <>
              <h2>Entrar na sua conta</h2>
              <p>Um clique e você vê suas candidaturas.</p>
              <div style={{ marginTop: 20 }}>
                <Entrar41 slug={slug} token={token} />
              </div>
              <p style={{ marginTop: 16, fontSize: 14, color: "var(--t41-suave)" }}>
                Link expirado?{" "}
                <Link href={rotas.conta} className="t41-link">
                  Peça um novo
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2>Receber link de acesso</h2>
              <p>Se houver inscrição com o e-mail, o link chega em instantes.</p>
              <div style={{ marginTop: 20 }}>
                <PedirAcesso41 slug={slug} />
              </div>
            </>
          )}
        </div>
      </div>
    </Moldura41>
  );
}

type Conta = NonNullable<Awaited<ReturnType<typeof dadosDaConta>>>;

const TOM: Record<string, string> = {
  andamento: "t41-situacao--andamento",
  aprovada: "t41-situacao--aprovada",
  encerrada: "t41-situacao--encerrada",
  desistiu: "t41-situacao--desistiu",
};

/** A conta do candidato com a sessão aberta: testes, candidaturas com a linha do tempo, dados e exclusão. */
export function Conta41({ slug, rotas, conta }: { slug: string; rotas: RotasDoPortal; conta: Conta }) {
  return (
    <Moldura41 rotas={rotas} atual="conta">
      <section className="t41-faixa" aria-labelledby="conta-titulo">
        <TrianguloDaFaixa />
        <div className="t41-caixa t41-faixa__conteudo" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p className="t41-selo t41-selo--lilas">Minhas candidaturas</p>
            <h1 id="conta-titulo" className="t41-faixa__titulo">
              Olá, <strong>{conta.nome.split(" ")[0]}</strong>
            </h1>
            <p className="t41-faixa__texto">Suas candidaturas nos processos conduzidos pela {MARCA_41_CARREIRAS.recrutamento}.</p>
          </div>
          <form action={sair.bind(null, slug)}>
            <button type="submit" className="t41-botao t41-botao--contorno-claro t41-botao--pequeno">
              <LogOut size={16} aria-hidden="true" /> Sair
            </button>
          </form>
        </div>
      </section>

      <div className="t41-caixa t41-conta-grade" style={{ maxWidth: 920 }}>
        {conta.testes.length > 0 && (
          <section className="t41-inscricao" aria-labelledby="testes-titulo" style={{ borderColor: "var(--t41-lilas)", background: "var(--t41-nevoa)" }}>
            <h2 id="testes-titulo" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardList size={20} aria-hidden="true" style={{ color: "var(--t41-roxo)" }} /> Testes para responder
            </h2>
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 10 }}>
              {conta.testes.map((t) => (
                <li key={t.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span>
                    <strong>{t.template?.name ?? (t.type === "DISC" ? "Perfil comportamental (DISC)" : "Teste")}</strong>
                    <span className="t41-num" style={{ color: "var(--t41-suave)" }}>
                      {" "}
                      · até {formatInstantDate(t.expiresAt)}
                    </span>
                  </span>
                  <a href={rotas.teste(t.token)} className="t41-botao t41-botao--primario t41-botao--pequeno">
                    Responder <ArrowRight size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {conta.candidaturas.length === 0 && (
          <div className="t41-vazio">
            <TrianguloVazio />
            <h2>Nenhuma candidatura por aqui</h2>
            <p>Quando você se candidatar a uma vaga com este e-mail, ela aparece aqui.</p>
            <Link href={rotas.vagas} className="t41-botao t41-botao--primario t41-botao--pequeno">
              Ver vagas abertas
            </Link>
          </div>
        )}

        {conta.candidaturas.map((c) => {
          const s = situacaoParaCandidato(c);
          const empresa = c.vaga.company.tradeName || c.vaga.company.name;
          return (
            <article key={c.id} className="t41-inscricao" aria-labelledby={`insc-${c.id}`}>
              <div className="t41-inscricao__topo">
                <div style={{ minWidth: 0 }}>
                  <h2 id={`insc-${c.id}`}>{c.vaga.title}</h2>
                  <p className="t41-inscricao__sub t41-num">
                    {empresa} · inscrição em {formatCalendarDate(c.createdAt)}
                  </p>
                </div>
                <span className={`t41-situacao ${TOM[s.tom] ?? ""}`}>{s.titulo}</span>
              </div>

              {s.linhaDoTempo && (
                <ol className="t41-linha-tempo" aria-label="Etapas do processo">
                  {s.linhaDoTempo.map((e) => (
                    <li key={e.rotulo} data-estado={e.estado} aria-current={e.estado === "atual" ? "step" : undefined}>
                      <span className="t41-linha-tempo__marco" aria-hidden="true" />
                      {e.rotulo}
                    </li>
                  ))}
                </ol>
              )}

              {c.meetings.length > 0 && s.tom === "andamento" &&
                c.meetings.map((m) => (
                  <div key={m.id} className="t41-compromisso">
                    <span className="t41-num">
                      <CalendarClock size={17} aria-hidden="true" />
                      Entrevista em {formatInstantDateTime(m.startAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {m.meetingUrl && (
                      <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer" className="t41-botao t41-botao--contorno t41-botao--pequeno">
                        <Video size={16} aria-hidden="true" /> Entrar na reunião
                      </a>
                    )}
                  </div>
                ))}

              {s.podeDesistir && (
                <div style={{ marginTop: 16 }}>
                  <Desistir slug={slug} candidaturaId={c.id} vaga={c.vaga.title} />
                </div>
              )}
            </article>
          );
        })}

        <section className="t41-inscricao" aria-labelledby="dados-titulo" style={{ marginTop: 16 }}>
          <h2 id="dados-titulo">Meus dados</h2>
          <p className="t41-inscricao__sub" style={{ marginBottom: 16 }}>
            Telefone e currículo novos valem para as candidaturas em andamento.
          </p>
          <AtualizarDados slug={slug} telefone={conta.telefone} />
        </section>

        <div style={{ marginTop: 8 }}>
          <PedirExclusao slug={slug} pedidoEm={conta.exclusaoPedidaEm ? formatInstantDate(conta.exclusaoPedidaEm) : null} />
          <p style={{ marginTop: 10, fontSize: 14, color: "var(--t41-suave)" }}>
            Como tratamos seus dados:{" "}
            <a href={MARCA_41_CARREIRAS.politicaDePrivacidade} target="_blank" rel="noopener" className="t41-link">
              política de privacidade
            </a>{" "}
            e o{" "}
            <Link href={rotas.privacidade} className="t41-link">
              resumo deste portal
            </Link>
            .
          </p>
        </div>
      </div>
    </Moldura41>
  );
}
