import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";

// Política de privacidade do Portal do Cliente — pública, sem sessão.
//
// Existe porque a Google Play exige uma URL pública de política para publicar o
// app Android (TWA) que embrulha o portal, e ela precisa abrir sem login: o
// revisor da loja e quem ainda não é cliente leem antes de entrar.
//
// O texto descreve o que o código faz de verdade — cookie de sessão de 12 h (30
// dias com "lembrar de mim", desde 05/10/2026), entrar com o Google sem guardar
// nada do Google, sem rastreador de terceiros, push sem conteúdo, arquivos só
// por rota autenticada. Mudou o comportamento, muda aqui e a data de atualização.

export const metadata: Metadata = {
  title: "Política de Privacidade · Portal 41",
  description: "Como o Portal do Cliente da 41 trata os seus dados.",
};

const ATUALIZADA_EM = "5 de outubro de 2026";
const CONTATO = "marcos@41contabil.com.br";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-fs-6 font-semibold text-fg">{titulo}</h2>
      <div className="flex flex-col gap-2 text-fs-4 leading-relaxed text-fg">{children}</div>
    </section>
  );
}

export default function PoliticaDePrivacidadePage() {
  return (
    <main className="min-h-dvh px-4 py-10">
      <article className="mx-auto w-full max-w-[720px] flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-title font-semibold text-fg">Política de Privacidade</h1>
          <p className="text-ui text-fg-muted">Portal do Cliente · Portal 41 · atualizada em {ATUALIZADA_EM}</p>
        </header>

        <Secao titulo="Quem somos">
          <p>
            O Portal 41 é o portal do cliente da plataforma Connect, desenvolvida e operada pela{" "}
            <strong>41 TEC LTDA</strong> (CNPJ 64.620.403/0001-16, Rua Anne Frank, 2210, Boqueirão, Curitiba/PR). Ele
            é usado pelo escritório de contabilidade que atende a sua empresa para compartilhar informações e documentos
            com você.
          </p>
          <p>
            Nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018), o escritório que atende a sua empresa é o{" "}
            <strong>controlador</strong> dos dados tratados no portal, e a 41 TEC LTDA atua como <strong>operadora</strong>,
            tratando os dados em nome dele e conforme as instruções dele.
          </p>
        </Secao>

        <Secao titulo="Quais dados tratamos">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong>Dados de acesso:</strong> nome, e-mail e senha do usuário do portal. A senha é guardada apenas de
              forma cifrada (hash) e nunca pode ser lida por ninguém. Se você entrar com o Google, o Google nos confirma o
              seu e-mail (e informa o seu nome), e usamos o e-mail só para encontrar o acesso que o escritório criou para
              você. Não recebemos a sua senha do Google, não guardamos nada da sua conta Google e não temos acesso a mais
              nada dela.
            </li>
            <li>
              <strong>Dados da sua empresa:</strong> informações contábeis, fiscais, financeiras e societárias que o
              escritório registra para prestar o serviço, como documentos fiscais, contas a pagar e a receber,
              demonstrativos, processos societários, taxas e pendências.
            </li>
            <li>
              <strong>O que você envia:</strong> mensagens, respostas a pendências, documentos e arquivos anexados, e
              as decisões que você toma no portal (por exemplo, aprovar ou reprovar um pagamento), com data, hora e
              autor.
            </li>
            <li>
              <strong>Notificações:</strong> se você ativar os avisos no celular ou no navegador, guardamos o endereço
              técnico de entrega fornecido pelo seu aparelho, para enviar os avisos.
            </li>
            <li>
              <strong>Registros técnicos:</strong> dados de acesso e de uso gerados automaticamente pelo servidor, como
              endereço IP e horário, usados para segurança e prevenção de abuso.
            </li>
            <li>
              <strong>Ficha “Quero ser cliente”:</strong> se você ainda não é cliente e preenche a ficha, recebemos o seu
              nome, e-mail, telefone ou WhatsApp, o nome da empresa, o CNPJ (se você informar), o que você escreveu e a
              data em que aceitou esta política.
            </li>
          </ul>
        </Secao>

        <Secao titulo="Para que usamos">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Permitir o seu acesso e manter a sua sessão segura.</li>
            <li>Prestar os serviços contratados com o escritório e cumprir obrigações legais, contábeis e fiscais.</li>
            <li>Avisar você, por e-mail e por notificação, de mensagens, pendências e aprovações.</li>
            <li>Proteger a plataforma contra acessos indevidos e fraudes.</li>
            <li>
              Responder a quem pediu contato pela ficha “Quero ser cliente”: a equipe comercial do escritório usa esses
              dados só para falar com você sobre os serviços que você procurou.
            </li>
          </ul>
          <p>
            Não vendemos dados, não usamos os seus dados para publicidade e o portal não usa ferramentas de rastreamento
            ou analytics de terceiros.
          </p>
        </Secao>

        <Secao titulo="Notificações e e-mails">
          <p>
            Os avisos por e-mail e por notificação no aparelho dizem apenas que há algo novo — por exemplo, o nome da
            empresa, o título de uma pendência ou o nome de um processo. Valores, documentos e o conteúdo das mensagens
            ficam só dentro do portal, atrás do seu login. Você pode desativar as notificações a qualquer momento nas
            configurações do aparelho ou do navegador.
          </p>
        </Secao>

        <Secao titulo="Cookies">
          <p>
            O portal usa apenas cookies <strong>essenciais</strong> para manter você conectado. A sessão expira em até
            12 horas — ou em até 30 dias, se você marcar “Lembrar de mim” ao entrar; nesse caso, use a opção só em
            aparelho seu e saia do portal ao terminar num aparelho compartilhado. Ao entrar com o Google, cookies técnicos
            que duram poucos minutos guardam a etapa do login. Não usamos cookies de publicidade nem de rastreamento.
          </p>
        </Secao>

        <Secao titulo="Com quem compartilhamos">
          <p>Os dados são compartilhados somente quando necessário para o funcionamento do serviço:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>com o escritório de contabilidade que atende a sua empresa;</li>
            <li>com provedores de infraestrutura que hospedam a plataforma e enviam e-mails e notificações;</li>
            <li>
              com provedores de inteligência artificial (como OpenAI e Anthropic), apenas em funções usadas pela equipe
              do escritório, sob os termos de uso empresarial desses serviços;
            </li>
            <li>com autoridades públicas, quando exigido por lei ou ordem judicial.</li>
          </ul>
        </Secao>

        <Secao titulo="Segurança">
          <p>
            A comunicação com o portal é cifrada (HTTPS). Cada usuário só vê as empresas às quais tem acesso, e os
            arquivos só podem ser baixados por quem está conectado e tem permissão sobre aquela empresa. Senhas são
            guardadas cifradas.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            Os dados ficam guardados enquanto durar a prestação de serviço entre a sua empresa e o escritório, e depois
            pelo prazo exigido pela legislação contábil, fiscal e societária. Passados esses prazos, são excluídos ou
            anonimizados.
          </p>
        </Secao>

        <Secao titulo="Seus direitos e exclusão da conta">
          <p>
            Você pode pedir, a qualquer momento, a confirmação de que tratamos seus dados, o acesso a eles, a correção de
            dados incompletos ou desatualizados, a portabilidade, informações sobre compartilhamento e a exclusão dos
            dados que não precisem ser mantidos por obrigação legal.
          </p>
          <p>
            As contas do portal são criadas pelo escritório. Para excluir a sua conta, peça ao escritório que atende a
            sua empresa ou escreva para <a href={`mailto:${CONTATO}`} className="text-brand hover:underline">{CONTATO}</a>.
            O acesso é desativado e os dados pessoais de acesso são excluídos; documentos e registros da empresa que a lei
            obriga a guardar permanecem com o escritório pelo prazo legal.
          </p>
          <p>
            Se você preencheu a ficha “Quero ser cliente” e não quer mais ser contatado, peça a exclusão pelo mesmo
            contato: os dados da ficha são apagados.
          </p>
        </Secao>

        <Secao titulo="Crianças">
          <p>O portal é destinado a empresas e a seus representantes, e não é direcionado a menores de 18 anos.</p>
        </Secao>

        <Secao titulo="Contato">
          <p>
            Dúvidas sobre esta política ou sobre os seus dados:{" "}
            <a href={`mailto:${CONTATO}`} className="text-brand hover:underline">{CONTATO}</a>.
          </p>
          <p>Se esta política mudar, a data de atualização no topo desta página muda junto.</p>
        </Secao>

        {/* Revisão de 05/10: botão não é link — a saída da página era texto azul. */}
        <footer className="pt-2 border-t border-border">
          <Button href="/portal/login" variant="secondary" size="sm">
            Ir para o Portal do Cliente
          </Button>
        </footer>
      </article>
    </main>
  );
}
