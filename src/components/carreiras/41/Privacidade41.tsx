import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { MARCA_41_CARREIRAS } from "@/lib/carreiras/enderecoDeCarreiras";
import { MAX_MB_DO_CURRICULO } from "@/lib/curriculo";
import { Moldura41 } from "./Moldura41";
import { TrianguloDaFaixa } from "./Triangulos";

// "Seus dados neste portal" (15/10/2026) — um RESUMO em linguagem simples do
// que o 41 Carreiras faz com os dados de quem se candidata. O texto oficial é
// a Política de Privacidade da 41 Tallent (MARCA_41_CARREIRAS.politicaDePrivacidade):
// este resumo aponta para ela e não pode contradizê-la. Para o Kauan e o
// jurídico revisarem (ver o PR).
//
// Só o que o código faz (e o que a política oficial diz, citado como dela):
// - o formulário (`CandidaturaEmPassos` → `/api/carreiras/apply`) e o que ele grava;
// - o currículo em `storage/resumes`, servido só por rota com sessão;
// - a leitura do currículo por IA (`lib/recrutamento/triagem.ts`: perfil sem
//   nome, idade, cidade, foto ou gênero; a nota ordena, quem decide é gente)
//   — a política oficial ainda não fala disso;
// - o assistente do WhatsApp do Recrutamento, que se apresenta como assistente;
// - o limite por IP em memória (`lib/rateLimit.ts`) e a defesa contra robô;
// - a conta: link de 30 min e uso único, sessão de 7 dias em cookie httpOnly;
// - o pedido de exclusão (`dataDeletionRequestedAt` + aviso ao Recrutamento).
// Mudou o comportamento, muda aqui.

export const RESUMO_ATUALIZADO_EM = "15 de outubro de 2026";

export function Privacidade41({ rotas }: { rotas: RotasDoPortal }) {
  const quem = MARCA_41_CARREIRAS.recrutamento;
  const politica = (
    <a href={MARCA_41_CARREIRAS.politicaDePrivacidade} target="_blank" rel="noopener" className="t41-link">
      Política de Privacidade da {quem}
    </a>
  );
  return (
    <Moldura41 rotas={rotas} atual="privacidade">
      <section className="t41-faixa" aria-labelledby="privacidade-titulo">
        <TrianguloDaFaixa />
        <div className="t41-caixa t41-faixa__conteudo">
          <p className="t41-selo t41-selo--lilas">{MARCA_41_CARREIRAS.nome}</p>
          <h1 id="privacidade-titulo" className="t41-faixa__titulo">
            Seus dados <strong>neste portal</strong>
          </h1>
          <p className="t41-faixa__texto">Um resumo, em poucas linhas, do que acontece com os dados de quem se candidata. Atualizado em {RESUMO_ATUALIZADO_EM}.</p>
        </div>
      </section>

      <div className="t41-caixa">
        <article className="t41-documento">
          <section>
            <p style={{ marginTop: 0 }}>
              Os processos seletivos deste portal são conduzidos pela {quem}, {MARCA_41_CARREIRAS.grupo}. O texto que vale é a {politica}. Este
              resumo só explica, em linguagem simples, como este site usa os seus dados.
            </p>
            <p>
              <a href={MARCA_41_CARREIRAS.politicaDePrivacidade} target="_blank" rel="noopener" className="t41-botao t41-botao--contorno t41-botao--pequeno">
                Ler a política completa <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </p>
          </section>

          <section>
            <h2>O que você informa na candidatura</h2>
            <ul>
              <li>Nome completo e e-mail.</li>
              <li>Telefone ou WhatsApp, cidade e estado — se você informar.</li>
              <li>Pretensão salarial mensal e quando você pode começar.</li>
              <li>O tempo que você levaria até o local de trabalho, em minutos — se você informar. Não pedimos o seu endereço.</li>
              <li>O currículo em PDF (de até {MAX_MB_DO_CURRICULO} MB) — se você enviar.</li>
              <li>A sua autorização para o uso dos dados neste processo seletivo.</li>
            </ul>
          </section>

          <section>
            <h2>Para que são usados</h2>
            <p>
              Para avaliar a sua candidatura à vaga escolhida e falar com você sobre o processo, pelo e-mail ou telefone informado. Na sua conta,
              você vê a etapa de cada candidatura, as entrevistas marcadas e os testes para responder.
            </p>
          </section>

          <section>
            <h2>Quem vê</h2>
            <p>
              A equipe da {quem} que conduz o processo. Como diz a política, os dados podem ser compartilhados com a empresa cliente da vaga,
              para fins do processo seletivo, sempre com a sua ciência. O currículo fica guardado fora da área pública do site.
            </p>
          </section>

          <section>
            <h2>Leitura do currículo com inteligência artificial</h2>
            <p>
              Se você enviar o currículo, um serviço de inteligência artificial pode lê-lo para montar o seu perfil profissional — sem nome,
              idade, cidade, foto ou gênero — e compará-lo com os requisitos da vaga. Essa comparação só organiza a lista: quem decide é sempre
              uma pessoa da equipe.
            </p>
          </section>

          <section>
            <h2>Contato pelo WhatsApp</h2>
            <p>A equipe pode falar com você pelo WhatsApp do Recrutamento. Parte das mensagens pode ser respondida por um assistente virtual, que se apresenta como tal.</p>
          </section>

          <section>
            <h2>Sua conta e os cookies deste portal</h2>
            <p>
              Para acompanhar as candidaturas, você recebe por e-mail um link de acesso que vale por 30 minutos e funciona uma vez. Depois de
              entrar, um cookie essencial mantém você conectado neste aparelho por até 7 dias; o botão “Sair” encerra o acesso. Este portal não
              usa cookies de publicidade nem ferramentas de rastreamento.
            </p>
            <p>Para barrar envios automáticos, o formulário tem uma proteção contra robôs, e o endereço IP é usado para limitar envios repetidos em sequência.</p>
          </section>

          <section>
            <h2>Seus direitos</h2>
            <p>
              Na <Link href={rotas.conta} className="t41-link">sua conta</Link>, você pode atualizar o telefone e o currículo, desistir de uma
              candidatura e pedir a exclusão dos seus dados — o pedido fica registrado e a equipe é avisada. Para os demais pedidos previstos na
              LGPD, escreva para{" "}
              <a href={`mailto:${MARCA_41_CARREIRAS.emailDePrivacidade}`} className="t41-link">
                {MARCA_41_CARREIRAS.emailDePrivacidade}
              </a>
              , o canal indicado na {politica}.
            </p>
          </section>
        </article>
      </div>
    </Moldura41>
  );
}
