// Roteiros dos vídeos das telas da equipe (06/10/2026).
//
// Um vídeo por artigo da ajuda (`src/lib/ajuda/artigos/*.ts`), seguindo os
// passos do artigo com os nomes de botão da tela. Onde o passo do artigo não
// bate com a tela, o vídeo grava o caminho real, e a divergência vira correção
// do texto do artigo — nunca o contrário.
//
// Ordem do pedido do Kauan em 06/10: o BPO primeiro (começou a testar com
// clientes nesse dia), depois as telas gerais e os primeiros passos da
// central, depois Societário, DP, Recrutamento, Fiscal e Gestão.
//
// Quem grava é a administradora local, Camila Duarte (fictícia): ela enxerga
// todos os setores. Os dados são os do `scripts/local/recriar-banco.mjs` — e
// vários roteiros os mudam (pagam uma conta, aprovam, criam um cadastro).
// Para regravar um vídeo, recrie o banco e grave o grupo inteiro de novo, na
// ordem: um roteiro pode contar com o que o anterior deixou.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Locator } from "playwright";
import { zonaDeAnexo, type DefinicaoDeVideo, type Roteiro } from "./gravador";

const SELO = "Connect · Passo a passo";

async function encerramento(r: Roteiro, texto = "Dúvida numa tela? Clique no ? do topo: ele abre a ajuda daquela tela.") {
  await r.cartaz(SELO, "Pronto!", texto, 3200);
}

function main(r: Roteiro) {
  return r.page.getByRole("main");
}

function barraLateral(r: Roteiro) {
  return r.page.getByRole("complementary");
}

/** O seletor de empresa do topo das telas do financeiro, com o "Aplicar". */
async function escolherEmpresa(r: Roteiro, busca: string, legenda = "Escolha a empresa em Buscar empresa… e clique em Aplicar.") {
  await r.escolher(
    main(r).getByRole("button", { name: /^Empresa/ }).first(),
    busca,
    r.page.getByRole("option", { name: new RegExp(busca, "i") }).first(),
    legenda
  );
  const aplicar = main(r).getByRole("button", { name: "Aplicar" });
  if (await aplicar.count()) {
    await r.clicar(aplicar.first());
    await r.page.waitForLoadState("networkidle").catch(() => {});
    await r.pausa(600);
  }
}

/** Escolhe uma opção num `<select>` comum, com o anel e o clique visíveis. */
async function selecionar(r: Roteiro, campo: Locator, opcao: string | { label: string } | RegExp, legenda?: string) {
  await r.apontar(campo, legenda);
  if (opcao instanceof RegExp) {
    const valor = await campo.locator("option").filter({ hasText: opcao }).first().getAttribute("value");
    await campo.selectOption(valor ?? "");
  } else {
    await campo.selectOption(opcao);
  }
  await r.pausa(600);
}

/** Datas do Connect (`CampoData`): digitar vale, com máscara; Tab fecha o calendário. */
async function digitarData(r: Roteiro, campo: Locator, ddmmaaaa: string, legenda?: string) {
  await r.clicar(campo, legenda);
  await r.page.keyboard.type(ddmmaaaa.replace(/\D/g, ""), { delay: 70 });
  await r.page.keyboard.press("Tab");
  await r.pausa(500);
}

/** Uma data daqui a `dias`, em dd/mm/aaaa. */
function daquiA(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("pt-BR");
}

/** A linha da tabela que contém o texto. */
function linha(r: Roteiro, texto: string | RegExp) {
  return main(r).getByRole("row").filter({ hasText: texto }).first();
}

function dialogo(r: Roteiro, nome?: string | RegExp) {
  return nome ? r.page.getByRole("dialog", { name: nome }) : r.page.getByRole("dialog").last();
}

/** A confirmação do Connect (`ConfirmDialog`) é `alertdialog`. */
async function confirmar(r: Roteiro, botao: string | RegExp, legenda?: string) {
  const d = r.page.getByRole("alertdialog");
  await d.waitFor();
  await r.clicar(d.getByRole("button", { name: botao }), legenda);
  await r.page.waitForLoadState("networkidle").catch(() => {});
  await r.pausa(900);
}

function arquivoDeApoio(pasta: string, nome: string, conteudo: string) {
  mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, nome);
  writeFileSync(arquivo, conteudo);
  return arquivo;
}

/** Extrato OFX fictício da conta "Itaú movimento" da Transportes Modelo (demonstração do BPO). */
function extratoOfx(pasta: string) {
  const hoje = new Date();
  const dia = (n: number) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  };
  const linhas = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS>",
    `<DTSERVER>${dia(0)}120000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>`,
    "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STMTRS><CURDEF>BRL",
    "<BANKACCTFROM><BANKID>0341<BRANCHID>1234<ACCTID>7285122870<ACCTTYPE>CHECKING</BANKACCTFROM>",
    `<BANKTRANLIST><DTSTART>${dia(0)}000000[-3:BRT]<DTEND>${dia(0)}000000[-3:BRT]`,
    "<STMTTRN><TRNTYPE>CREDIT",
    `<DTPOSTED>${dia(0)}000000[-3:BRT]<TRNAMT>6100.00<FITID>VIDEO${dia(0)}001`,
    "<MEMO>PIX RECEBIDO COMERCIO BETA 31.938.024/0001-10</STMTTRN>",
    "<STMTTRN><TRNTYPE>DEBIT",
    `<DTPOSTED>${dia(0)}000000[-3:BRT]<TRNAMT>-1876.00<FITID>VIDEO${dia(0)}002`,
    "<MEMO>PAGAMENTOS A FORNECEDORES POSTO CENTRAL 21.212.936/0001-56</STMTTRN>",
    "</BANKTRANLIST>",
    `<LEDGERBAL><BALAMT>52474.00<DTASOF>${dia(0)}000000[-3:BRT]</LEDGERBAL>`,
    "</STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    "</OFX>",
  ];
  return arquivoDeApoio(pasta, "extrato-itau.ofx", linhas.join("\r\n"));
}

/** Planilha CSV fictícia para a importação de lançamentos. */
function planilhaDeLancamentos(pasta: string) {
  const linhas = [
    "Tipo;Contraparte;Documento;Categoria;Competência;Vencimento;Valor;Descrição;Pago em;Centro de custo",
    `Pagar;IMOBILIARIA CENTRO;44.555.666/0001-77;Aluguel e condomínio;;${daquiA(35)};450,00;Condomínio do mês que vem;;Operação`,
    `Pagar;POSTO CENTRAL;21.212.936/0001-56;Combustível;;${daquiA(20)};1.950,00;Abastecimento da frota;;Operação`,
  ];
  return arquivoDeApoio(pasta, "lancamentos.csv", linhas.join("\r\n"));
}

// ─── BPO e financeiro ───────────────────────────────────────────────────────

function videosDoBpo(apoio: string): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "01-contas-a-pagar",
      titulo: "Contas a pagar",
      resumo: "Conferir, pagar e acompanhar o que vence.",
      chave: "bpo_contas_pagar",
      logado: true,
      async executar(r) {
        await r.ir("/pagar");
        await r.cartaz(SELO, "Contas a pagar", "Conferir, pagar e acompanhar o que vence");
        await r.apontar(
          main(r).getByRole("link", { name: /^Em aberto/ }),
          "Os cartões do topo resumem as contas das empresas: em aberto, vencido, vence hoje e pago."
        );
        await r.clicar(main(r).getByRole("link", { name: /^Vencido/ }), "Clique em Em aberto ou em Vencido para ver só essas contas.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.clicar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, escolha a Situação, a Competência ou a Empresa.");
        await r.pausa(1500);
        await r.page.keyboard.press("Escape");
        const etiqueta = main(r).getByRole("button", { name: /^Tirar o filtro de situação/ });
        await r.clicar(etiqueta, "O filtro escolhido vira uma etiqueta. O X dela tira o filtro.");
        await etiqueta.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(500);
        await r.apontar(
          main(r).getByRole("button", { name: "Filtrar a coluna fornecedor" }),
          "O funil ao lado do nome da coluna refina a lista: por vencimento, fornecedor, categoria…"
        );
        const posto = linha(r, "Abastecimento quinzenal");
        await r.clicar(posto.getByRole("button", { name: "Mais ações" }), "O botão ⋯ da linha guarda as outras ações da conta.");
        const menu = dialogo(r, "Mais ações da conta");
        await r.apontar(menu.getByText("Ver nota fiscal"), "Ver nota fiscal abre o documento que originou a conta.");
        await r.apontar(menu.getByText("Abrir pendência"), "Abrir pendência pede algo ao cliente sobre esta conta: o pedido já nasce ligado a ela.");
        await r.apontar(
          menu.getByText("Enviar para aprovação"),
          "E Enviar para aprovação pede o OK do cliente ou da coordenação antes do pagamento."
        );
        await r.page.keyboard.press("Escape");
        await r.pausa(500);
        await r.clicar(
          posto.getByRole("button", { name: "Conferir" }),
          "Conta nova chega a conferir. Revise os dados e clique em Conferir: o botão só aparece enquanto há o que conferir."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await r.clicar(posto.getByRole("button", { name: "Pagar" }), "Para registrar o pagamento, clique em Pagar.");
        const pagamento = dialogo(r, "Registrar pagamento");
        await r.apontar(
          pagamento.getByRole("combobox").first(),
          "Em Data do pagamento, informe o dia em que o dinheiro saiu. Data futura não vale."
        );
        await r.clicar(pagamento.getByRole("button", { name: "Confirmar" }), "Clique em Confirmar. Registrar o pagamento é o que se chama de baixa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.soltar();
        await r.legenda("Errou? No botão ⋯ da conta paga, escolha Desfazer pagamento.");
        await r.clicar(
          main(r).getByRole("checkbox", { name: "Selecionar IMOBILIARIA CENTRO" }).first(),
          "Para dar o centro de custo a várias contas, marque as caixas à esquerda…"
        );
        await r.clicar(main(r).getByRole("checkbox", { name: "Selecionar OFICINA DO PAULO" }).first());
        await r.apontar(main(r).getByRole("combobox", { name: "Centro de custo" }), "…escolha o centro de custo na barra que aparece…");
        await r.apontar(main(r).getByRole("button", { name: "Definir centro de custo" }), "…e clique em Definir centro de custo.");
        await r.clicar(main(r).getByRole("button", { name: "Limpar" }));
        await r.soltar();
        await encerramento(r, "Conta aguardando aprovação não pode ser paga: o botão Pagar fica desativado e diz o motivo.");
      },
    },
    {
      arquivo: "02-contas-a-receber",
      titulo: "Contas a receber",
      resumo: "Conferir, receber e acompanhar o que está vencido.",
      chave: "bpo_contas_receber",
      logado: true,
      async executar(r) {
        await r.ir("/receber");
        await r.cartaz(SELO, "Contas a receber", "Conferir, receber e acompanhar o que está vencido");
        await r.apontar(
          main(r).getByRole("link", { name: /^Vencido R\$/ }),
          "Os cartões do topo resumem o que as empresas têm a receber. Em aberto e Vencido filtram a lista."
        );
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, escolha a Situação, a Competência ou a Empresa.");
        await r.apontar(
          main(r).getByRole("button", { name: "Filtrar a coluna cliente" }),
          "E o funil de cada coluna refina a lista: por vencimento, cliente, categoria…"
        );
        const curitiba = linha(r, "Frete Curitiba");
        await r.clicar(curitiba.getByRole("button", { name: "Conferir" }), "Conta nova chega a conferir: revise e clique em Conferir.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        const avulso = linha(r, "Frete avulso");
        await r.clicar(avulso.getByRole("button", { name: "Receber" }), "Quando o dinheiro entrar, clique em Receber…");
        const recebimento = dialogo(r, "Registrar recebimento");
        await r.apontar(recebimento.getByRole("combobox").first(), "…informe a Data do recebimento…");
        await r.clicar(recebimento.getByRole("button", { name: "Confirmar" }), "…e clique em Confirmar. Errou? O botão ⋯ da conta tem Desfazer recebimento.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        const gama = linha(r, "Frete de agosto");
        await r.apontar(
          gama.getByRole("link", { name: "Vencido sem contato" }),
          "Selos como este mostram a cobrança do título. Clique nele para abrir o título na tela Cobrança."
        );
        await r.clicar(gama.getByRole("button", { name: "Mais ações" }), "No botão ⋯, Abrir pendência pede algo ao cliente sobre esta conta.");
        await r.pausa(800);
        await r.page.keyboard.press("Escape");
        await r.clicar(main(r).getByRole("link", { name: "Análise — atraso e ranking" }), "Na aba Análise — atraso e ranking…");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByRole("heading", { name: "Faixas de atraso" }), "…veja as Faixas de atraso…");
        await r.apontar(main(r).getByRole("heading", { name: /Maiores clientes/ }), "…e os Maiores clientes em aberto.");
        await r.soltar();
        await encerramento(r, "As contas nascem do documento fiscal ou da tela Lançamentos: aqui não se cria conta.");
      },
    },
    {
      arquivo: "03-lancamentos",
      titulo: "Lançamentos",
      resumo: "Contas sem nota fiscal, lançadas à mão ou por planilha.",
      chave: "bpo_lancamentos",
      logado: true,
      async executar(r) {
        await r.ir("/lancamentos");
        await r.cartaz(SELO, "Lançamentos", "Contas sem nota fiscal, lançadas à mão ou por planilha");
        await r.legenda("Aluguel, folha, pró-labore, tarifas: o que não nasce de nota fiscal é lançado aqui.");
        await escolherEmpresa(r, "Transportes Modelo");
        await r.clicar(main(r).getByRole("link", { name: "Novo lançamento" }), "Clique em Novo lançamento, no topo da tela.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(600);
        await r.apontar(main(r).getByRole("combobox", { name: /^Tipo/ }), "Em Tipo, escolha Conta a pagar ou Conta a receber.");
        await selecionar(
          r,
          main(r).getByRole("combobox", { name: /^Fornecedor/ }),
          /IMOBILIARIA CENTRO/,
          "Escolha o Fornecedor. Se ele ainda não existe, a lista tem + Cadastrar nova contraparte."
        );
        await selecionar(r, main(r).getByRole("combobox", { name: /^Categoria/ }), "Aluguel e condomínio", "A Categoria é obrigatória em conta a pagar.");
        await selecionar(r, main(r).getByRole("combobox", { name: "Centro de custo" }), /Operação/);
        await r.apontar(main(r).getByRole("combobox", { name: /^Competência/ }), "Competência é o mês a que a conta pertence.");
        await digitarData(r, main(r).getByRole("combobox", { name: /^Vencimento/ }), daquiA(30), "Preencha o Vencimento…");
        await r.digitar(main(r).getByRole("textbox", { name: /^Valor/ }), "8.500,00", "…e o Valor.");
        await r.apontar(main(r).getByRole("combobox", { name: "Já pago em" }), "Se a conta já foi paga, informe a data em Já pago em. Se não, deixe em branco.");
        await r.digitar(main(r).getByRole("textbox", { name: "Descrição" }), "Aluguel do galpão do mês que vem");
        await r.clicar(main(r).getByRole("button", { name: "Lançar" }), "Clique em Lançar. A conta já aparece em Contas a pagar e na DRE.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.clicar(main(r).getByRole("link", { name: "Lançamentos" }), "Volte para a lista pela trilha, em Lançamentos.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.clicar(main(r).getByRole("link", { name: "Importar CSV" }), "Para lançar muitas de uma vez, use Importar CSV, ao lado.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByText(/^Tipo;Contraparte;Documento/), "Monte a planilha com estas colunas e salve em CSV.");
        await r.anexar(
          zonaDeAnexo(main(r)),
          main(r).locator('input[type="file"]').first(),
          planilhaDeLancamentos(apoio),
          "Clique em Escolher arquivo, ou arraste o arquivo para a faixa."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(main(r).getByRole("table").first(), "Confira a prévia: cada linha diz se é válida, duplicada ou tem erro.");
        await r.clicar(
          main(r).getByRole("button", { name: /^Importar \d/ }),
          "Clique em Importar: nada é gravado antes desse clique."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.clicar(main(r).getByRole("link", { name: "Lançamentos" }), "Na lista de Lançamentos ficam os lançados à mão da empresa no mês…");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(600);
        await r.apontar(main(r).getByRole("table").first(), "…com a situação de cada um: a conferir, em aberto, liquidado ou cancelado.");
        await r.apontar(
          main(r).getByRole("button", { name: "Cancelar" }).first(),
          "Cancelar não apaga: o lançamento sai dos totais e fica no histórico."
        );
        await r.soltar();
        await encerramento(r, "Conta já paga só é cancelada depois de desfazer a baixa em Contas a pagar ou a receber.");
      },
    },
    {
      arquivo: "04-fluxo-de-caixa",
      titulo: "Fluxo de caixa",
      resumo: "O realizado, a projeção e a comparação entre empresas.",
      chave: "bpo_fluxo_caixa",
      logado: true,
      async executar(r) {
        await r.ir("/fluxo-de-caixa");
        await r.cartaz(SELO, "Fluxo de caixa", "O realizado, a projeção e a comparação entre empresas");
        await r.apontar(
          main(r).getByRole("button", { name: /^Empresa/ }),
          "Em Buscar empresa…, escolha uma empresa, ou deixe Todas as empresas. Depois escolha o mês e clique em Aplicar."
        );
        await r.apontar(main(r).getByText("Saldo das contas", { exact: true }), "O quadro Saldo das contas mostra o saldo do banco, que vem da conciliação.");
        const realizado = main(r).getByRole("heading", { name: /^Realizado/ });
        await r.rolarAte(realizado);
        await r.apontar(
          main(r).getByRole("table").first(),
          "A tabela do realizado traz entradas, saídas e saldo dos seis meses, pela data em que as contas foram pagas ou recebidas."
        );
        const projecao = main(r).getByRole("heading", { name: /^Projeção/ });
        await r.rolarAte(projecao);
        await r.apontarGrupo(
          main(r).getByText("Até 7 dias", { exact: true }),
          main(r).getByText("Até 180 dias", { exact: true }),
          "Os cartões da projeção somam o que vence de hoje até 7, 15, 30, 60, 90 e 180 dias: a receber menos a pagar."
        );
        await r.apontar(main(r).getByText(/^Fora das janelas/), "O que já venceu e não foi baixado fica de fora das janelas, neste aviso.");
        await r.topo();
        await r.clicar(main(r).getByRole("link", { name: "Por empresa" }), "Para comparar as empresas, clique na aba Por empresa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(600);
        await r.apontar(main(r).getByRole("table").first(), "Cada empresa com o pago e o recebido no mês, o saldo e as contas vencidas.");
        await r.apontar(
          main(r).getByRole("table").first().getByRole("link").first(),
          "Clique no número de vencidas para abrir a lista dessas contas."
        );
        await r.soltar();
        await encerramento(r, "A projeção só considera o que já está lançado.");
      },
    },
    {
      arquivo: "05-conciliacao-bancaria",
      titulo: "Conciliação bancária",
      resumo: "O extrato do banco contra os lançamentos.",
      chave: "bpo_conciliacao",
      logado: true,
      async executar(r) {
        await r.ir("/conciliacao");
        await r.cartaz(SELO, "Conciliação bancária", "O extrato do banco contra os lançamentos");
        await r.legenda("Conciliar é ligar cada movimento do extrato ao lançamento que ele paga ou recebe.");
        await escolherEmpresa(r, "Transportes Modelo");
        await r.clicar(main(r).getByRole("button", { name: "Nova conta" }), "A conta bancária é cadastrada uma vez, em Nova conta.");
        const conta = dialogo(r, "Nova conta bancária");
        await r.apontarGrupo(
          conta.getByRole("textbox", { name: /^Nome da conta/ }),
          conta.getByRole("textbox", { name: /^Conta com dígito/ }),
          "Nome da conta, Tipo, Banco (o código, como 341), Agência e Conta com dígito. Depois, Salvar."
        );
        await r.clicar(conta.getByRole("button", { name: "Fechar" }));
        await r.apontar(main(r).getByRole("link", { name: "Itaú movimento" }), "Clique no nome da conta para selecioná-la.");
        await r.anexar(
          zonaDeAnexo(main(r)),
          main(r).locator('input[type="file"]').first(),
          extratoOfx(apoio),
          "Baixe o extrato em OFX no internet banking e traga em Importar extrato OFX."
        );
        await r.clicar(main(r).getByRole("button", { name: "Importar", exact: true }), "Clique em Importar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.apontar(
          main(r).getByText(/transações? novas? de/).filter({ visible: true }).first(),
          "A tela mostra quantas transações novas entraram. Reimportar o mesmo período não duplica nada."
        );
        const sugestao = main(r).getByText(/Sugestão ·/).filter({ visible: true }).first();
        await r.rolarAte(sugestao);
        await r.apontar(sugestao, "As transações pendentes vêm com uma Sugestão quando o Connect acha o lançamento certo.");
        await r.clicar(
          main(r).getByRole("button", { name: "Confirmar" }).filter({ visible: true }).first(),
          "Confira o lançamento indicado e clique em Confirmar."
        );
        await confirmar(r, /Confirmar|Conciliar/);
        await r.apontar(
          main(r).getByRole("button", { name: "Escolher lançamentos" }).first(),
          "Sem sugestão, use Escolher lançamentos e marque até o valor fechar no centavo."
        );
        await r.apontar(
          main(r).getByRole("button", { name: "Criar lançamento" }).first(),
          "Se a conta ainda não foi lançada, Criar lançamento cria e já concilia."
        );
        await r.apontar(
          main(r).getByRole("button", { name: "Ignorar" }).first(),
          "E Ignorar tira da fila o movimento que não é conta, como um resgate automático."
        );
        await r.apontar(
          main(r).getByRole("button", { name: /^Filtros/ }),
          "Em Filtros, a Situação mostra as conciliadas e as ignoradas, para Desfazer ou Reabrir."
        );
        await r.soltar();
        await encerramento(r, "Conciliar marca os lançamentos como pagos na data do extrato. Desfazer devolve cada um ao que era.");
      },
    },
    {
      arquivo: "06-fornecedores-e-sacados",
      titulo: "Fornecedores e sacados",
      resumo: "Os cadastros, os centros de custo e o plano de contas da empresa.",
      chave: "bpo_cadastros",
      logado: true,
      async executar(r) {
        await r.ir("/cadastros-financeiros");
        await r.cartaz(SELO, "Fornecedores e sacados", "Os cadastros, os centros de custo e o plano de contas da empresa");
        await r.legenda("Fornecedor é de quem a empresa compra. Sacado é o cliente que paga a ela.");
        await escolherEmpresa(r, "Transportes Modelo");
        await r.clicar(main(r).getByRole("button", { name: "Novo cadastro" }), "Clique em Novo cadastro.");
        const novo = dialogo(r, "Novo cadastro");
        await r.digitar(novo.getByRole("textbox", { name: /^Nome/ }), "BORRACHARIA SERRA ALTA", "Preencha o Nome…");
        await r.digitar(novo.getByRole("textbox", { name: "CPF ou CNPJ" }), "12.345.678/0001-95", "…e, se tiver, o CPF ou CNPJ e o E-mail.");
        await selecionar(
          r,
          novo.getByRole("combobox", { name: "Categoria padrão" }),
          "Combustível",
          "Categoria padrão e Centro de custo padrão: a próxima conta dessa contraparte já vem com eles."
        );
        await selecionar(r, novo.getByRole("combobox", { name: "Centro de custo padrão" }), "Operação");
        await r.clicar(novo.getByRole("button", { name: "Cadastrar" }), "Clique em Cadastrar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await r.apontarGrupo(
          main(r).getByRole("link", { name: "Fornecedores" }),
          main(r).getByRole("link", { name: "Todos" }),
          "As abas Fornecedores, Sacados e Todos separam os cadastros. O que ainda não tem conta aparece nas duas primeiras."
        );
        await r.apontar(main(r).getByRole("textbox", { name: /Buscar por nome/ }), "Busque pelo nome ou documento e tecle Enter.");
        await r.apontar(
          main(r).getByRole("button", { name: "Editar" }).first(),
          "Em Editar, mude os dados — ou a Situação para Inativo. Cadastro não é apagado."
        );
        await r.clicar(main(r).getByRole("link", { name: "Centros de custo" }), "Na aba Centros de custo ficam as unidades, obras ou projetos da empresa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByRole("button", { name: "Novo centro de custo" }), "Para criar um, clique em Novo centro de custo, dê o Nome e o Código.");
        await r.clicar(main(r).getByRole("link", { name: "Plano de contas" }), "Na aba Plano de contas ficam as categorias de receita e despesa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(
          main(r).getByRole("combobox", { name: "Linha da DRE" }).first(),
          "Em Linha da DRE nesta empresa, mude onde a categoria entra no resultado. A troca vale na hora."
        );
        await r.apontar(
          main(r).getByRole("button", { name: "Não usar nesta empresa" }).first(),
          "Não usar nesta empresa esconde uma categoria do padrão que ela não usa."
        );
        await r.apontar(
          main(r).getByRole("button", { name: "Nova categoria" }),
          "E Nova categoria cria uma categoria só desta empresa."
        );
        await r.soltar();
        await encerramento(r, "O e-mail do sacado é para onde vão os lembretes da régua de cobrança.");
      },
    },
    {
      arquivo: "07-pendencias-ao-cliente",
      titulo: "Pendências ao cliente",
      resumo: "Pedir um documento ou uma informação ao cliente, com prazo.",
      chave: "bpo_pendencias",
      logado: true,
      async executar(r) {
        await r.ir("/pendencias");
        await r.cartaz(SELO, "Pendências ao cliente", "Pedir um documento ou uma informação ao cliente, com prazo");
        await r.clicar(main(r).getByRole("button", { name: "Nova pendência" }), "Clique em Nova pendência.");
        const nova = dialogo(r, "Nova pendência ao cliente");
        await selecionar(r, nova.getByRole("combobox", { name: /^Empresa/ }), "Transportes Modelo", "Escolha a Empresa…");
        await selecionar(r, nova.getByRole("combobox", { name: /^Tipo/ }), "Documento", "…e o Tipo: Documento, Informação ou Confirmação.");
        await digitarData(r, nova.getByRole("combobox", { name: "Prazo" }), daquiA(5), "Se quiser, informe o Prazo.");
        await r.digitar(
          nova.getByRole("textbox", { name: /^Título/ }),
          "Comprovante do seguro da frota",
          "O Título vai no e-mail ao cliente: nada de valor nem dado sensível."
        );
        await r.digitar(
          nova.getByRole("textbox", { name: "Descrição" }),
          "Precisamos da apólice renovada do seguro dos caminhões, para lançar a parcela de outubro.",
          "Detalhe o pedido em Descrição. Se precisar, inclua Anexos."
        );
        await r.clicar(nova.getByRole("button", { name: "Abrir pendência" }), "Clique em Abrir pendência.");
        await r.esperarTela(/\/pendencias\/[^/]+$/);
        await r.apontar(
          main(r).getByRole("heading", { level: 1 }),
          "Pronto: a pendência abriu, e o cliente recebe o aviso por e-mail. Ele responde pelo portal."
        );
        await r.clicar(main(r).getByRole("button", { name: "Voltar" }));
        await r.esperarTela("/pendencias");
        await r.apontar(
          main(r).getByRole("link", { name: /^Aguardando cliente/ }),
          "Os cartões do topo separam a fila: aguardando o cliente, respondidas, vencidas e encerradas."
        );
        await r.clicar(main(r).getByRole("link", { name: /^Respondidas/ }), "Respondidas são as que o cliente já respondeu e esperam a equipe.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, escolha a Situação, a Empresa ou só as vencidas.");
        await r.clicar(main(r).getByRole("link", { name: "Nota fiscal do frete de São Paulo" }), "Clique no título para abrir a conversa.");
        await r.esperarTela(/\/pendencias\/[^/]+$/);
        await r.digitar(
          main(r).getByRole("textbox", { name: "Mensagem" }),
          "Recebemos a nota, obrigado! Ela já foi lançada.",
          "Escreva em Mensagem. Responder devolve a pendência ao cliente."
        );
        await r.apontar(main(r).getByRole("button", { name: "Responder" }), "Clique em Responder para mandar a mensagem.");
        await r.clicar(main(r).getByRole("button", { name: "Resolver" }), "Quando o pedido estiver atendido, clique em Resolver…");
        await confirmar(r, "Resolver", "…e confirme. A pendência resolvida sai da fila.");
        await r.soltar();
        await r.legenda("Pedido que não vale mais? Use Cancelar. E Reabrir traz de volta uma pendência encerrada.");
        await encerramento(r, "Prazo vencido sem resposta: o cliente recebe lembretes com 1, 3, 7 e 15 dias de atraso.");
      },
    },
    {
      arquivo: "08-aprovacoes",
      titulo: "Aprovações",
      resumo: "O OK antes do pagamento e as alçadas do cliente.",
      chave: "bpo_aprovacoes",
      logado: true,
      async executar(r) {
        await r.ir("/aprovacoes");
        await r.cartaz(SELO, "Aprovações", "O OK antes do pagamento e as alçadas do cliente");
        await r.legenda("Contas aguardando aprovação não podem ser pagas nem conciliadas até alguém dar o OK.");
        await r.clicar(main(r).getByRole("link", { name: "Alçadas" }), "Na aba Alçadas fica quem aprova, no portal, e até quanto.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await escolherEmpresa(r, "Transportes Modelo", "Escolha a empresa e clique em Aplicar.");
        await r.clicar(main(r).getByRole("button", { name: "Nova alçada" }), "Clique em Nova alçada, no topo da tela…");
        const alcada = dialogo(r, "Nova alçada");
        await r.apontarGrupo(
          alcada.getByRole("combobox", { name: /^Usuário do portal/ }),
          alcada.getByRole("textbox", { name: /^Teto/ }),
          "…escolha o Usuário do portal, informe o Teto e clique em Salvar alçada."
        );
        await r.clicar(alcada.getByRole("button", { name: "Cancelar" }));
        await r.apontar(main(r).getByRole("button", { name: "Desativar" }).first(), "Para suspender uma alçada, Desativar. Para voltar, Reativar.");
        await r.clicar(main(r).getByRole("link", { name: "Fila" }), "Na aba Fila ficam as contas esperando decisão.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByRole("link", { name: /^Aguardando/ }), "Os cartões Aguardando e Reprovadas, e o botão Filtros, recortam a fila.");
        await r.apontar(main(r).getByText(/Histórico \(\d+\)/).filter({ visible: true }).first(), "Histórico mostra quem já decidiu e quando.");
        const manutencao = linha(r, "Manutenção preventiva");
        await r.clicar(manutencao.getByRole("button", { name: "Aprovar" }), "Para liberar o pagamento, clique em Aprovar…");
        await confirmar(r, "Aprovar", "…e confirme.");
        const reforma = linha(r, "Reforma do pátio");
        await r.clicar(reforma.getByRole("button", { name: "Reprovar" }), "Para recusar, clique em Reprovar…");
        const reprovar = dialogo(r);
        await r.digitar(
          reprovar.getByRole("textbox").first(),
          "Falta o orçamento assinado pelo responsável da obra.",
          "…escreva o Motivo: quem lançou a conta recebe esse motivo."
        );
        await r.clicar(reprovar.getByRole("button", { name: "Reprovar" }));
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.clicar(main(r).getByRole("link", { name: /^Reprovadas/ }));
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(
          main(r).getByRole("button", { name: "Reenviar para aprovação" }).first(),
          "Depois de corrigida, a conta reprovada volta com Reenviar para aprovação."
        );
        await r.soltar();
        await r.legenda("Conta antiga, que não entrou sozinha, vai pelo botão ⋯ de Contas a pagar: Enviar para aprovação.");
        await encerramento(r, "Quem lançou a conta não pode aprová-la nem reprová-la.");
      },
    },
    {
      arquivo: "09-cobranca",
      titulo: "Cobrança",
      resumo: "Vencidos, contatos, acordos e a régua de lembretes.",
      chave: "bpo_cobranca",
      logado: true,
      async executar(r) {
        await r.ir("/cobranca");
        await r.cartaz(SELO, "Cobrança", "Vencidos, contatos, acordos e a régua de lembretes");
        await r.apontar(
          main(r).getByRole("link", { name: /^Sem contato/ }),
          "Na aba Fila, os cartões contam os títulos vencidos, o valor, os sem contato e os sacados sem e-mail."
        );
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros: Empresa, Atraso, Situação ou Responsável — Meus mostra só os seus.");
        await r.clicar(main(r).getByRole("link", { name: "Abrir" }).first(), "Clique em Abrir na linha do título.");
        await r.esperarTela(/\/cobranca\/[^/]+$/);
        await selecionar(
          r,
          main(r).getByRole("combobox", { name: "Responsável pela cobrança" }),
          "Camila Duarte",
          "Escolha quem cuida dele em Responsável."
        );
        await r.apontar(main(r).getByRole("heading", { name: "Registrar contato" }), "Em Registrar contato, conte como foi a conversa com o sacado:");
        await selecionar(r, main(r).getByRole("combobox", { name: /^Canal/ }), "WhatsApp", "o Canal…");
        await selecionar(r, main(r).getByRole("combobox", { name: /^Resultado/ }), "Prometeu pagar", "…e o Resultado.");
        const prometida = main(r).getByRole("combobox", { name: /prometida/i });
        if (await prometida.count()) {
          await digitarData(r, prometida.first(), daquiA(7), "Prometeu pagar? Informe a Data prometida.");
        }
        await r.digitar(
          main(r).getByRole("textbox", { name: "Anotação interna" }),
          "Falou com o financeiro: paga na sexta, por PIX.",
          "A Anotação interna só a equipe vê."
        );
        await r.clicar(main(r).getByRole("button", { name: "Registrar contato" }), "Clique em Registrar contato: ele entra no Histórico do título.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.topo();
        await r.apontar(
          main(r).getByRole("button", { name: "Criar acordo" }),
          "Para parcelar, Criar acordo: marque os títulos, o valor, as parcelas e a 1ª parcela, revise e confirme."
        );
        await r.ir("/cobranca?aba=acordos");
        await r.apontar(
          main(r).getByRole("button", { name: "Marcar como quebrado" }).first(),
          "Os acordos ficam na aba Acordos. Se o sacado parar de pagar, Marcar como quebrado."
        );
        await r.clicar(main(r).getByRole("link", { name: "Régua" }), "Na aba Régua, os lembretes automáticos por e-mail.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await selecionar(r, main(r).getByRole("combobox", { name: "Situação" }), "Ligada", "Em Situação, escolha Ligada…");
        await r.apontar(
          main(r).getByRole("textbox", { name: "Passos (dias de atraso)" }),
          "…e os Passos: os dias de atraso em que o sacado recebe o e-mail, separados por vírgula."
        );
        await r.apontar(main(r).getByRole("button", { name: "Salvar" }), "Clique em Salvar e confirme em Ligar.");
        await r.apontar(
          main(r).getByRole("heading", { name: "Empresas fora da régua" }),
          "Empresa que cobra os próprios sacados? Tire-a da régua aqui."
        );
        await r.soltar();
        await encerramento(r, "A régua e a baixa por perda são só da coordenação do setor.");
      },
    },
    {
      arquivo: "10-conversa-com-o-cliente",
      titulo: "Conversa com o cliente",
      resumo: "O histórico das conversas, e o caminho das Solicitações.",
      chave: "bpo_comunicacao",
      logado: true,
      async executar(r) {
        await r.ir("/comunicacao");
        await r.cartaz(SELO, "Conversa com o cliente", "O histórico das conversas, e o caminho das Solicitações");
        await r.apontar(
          main(r).getByRole("link", { name: /Esperando o escritório/ }).first(),
          "A lista mostra as empresas com conversa e a última mensagem. Esperando o escritório: o cliente escreveu por último."
        );
        await r.apontar(
          main(r).getByText(/A conversa saiu do portal/),
          "Com as Solicitações do portal ligadas, esta tela fica como histórico: o cliente fala com a equipe por lá."
        );
        await r.clicar(main(r).getByRole("link", { name: /Transportes Modelo/ }).first(), "Clique na empresa para ler a conversa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.soltar();
        await r.legenda("Para responder ao cliente, use Solicitações. Pedido com prazo é pendência.");
        await encerramento(r, "Recado ao cliente, hoje, vai por Solicitações ou por Pendências ao cliente.");
      },
    },
    {
      arquivo: "11-repositorio-de-senhas",
      titulo: "Repositório de Senhas",
      resumo: "As credenciais dos clientes num lugar só, com registro de acesso.",
      chave: "bpo_senhas",
      logado: true,
      async executar(r) {
        await r.ir("/bpo-senhas");
        await r.cartaz(SELO, "Repositório de Senhas", "As credenciais dos clientes num lugar só, com registro de acesso");
        await r.clicar(main(r).getByRole("button", { name: "Nova credencial" }), "Para guardar uma credencial, clique em Nova credencial.");
        const nova = dialogo(r, "Nova credencial");
        await r.digitar(nova.getByRole("textbox", { name: /^Título/ }), "Portal da prefeitura", "Preencha o Título…");
        await r.escolher(
          nova.getByRole("button", { name: "Empresa" }),
          "Transportes",
          r.page.getByRole("option", { name: /Transportes Modelo/i }).first(),
          "…escolha a Empresa, ou deixe Geral (sem empresa)…"
        );
        await r.digitar(nova.getByRole("textbox", { name: "Usuário" }), "transportes.modelo", "…e preencha Usuário e Senha.");
        await r.digitar(nova.getByRole("textbox", { name: /^Senha/ }), "Exemplo-2026");
        await r.digitar(nova.getByRole("textbox", { name: "URL" }), "https://prefeitura.exemplo.invalido");
        await r.clicar(nova.getByRole("button", { name: "Criar" }), "Clique em Criar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.apontar(
          main(r).getByRole("textbox").first(),
          "Para achar uma senha, busque pelo título, pela empresa ou pelo usuário."
        );
        const revelar = main(r).getByRole("button", { name: "Revelar senha" }).first();
        await r.clicar(revelar, "O olho revela a senha. Cada vez que alguém revela, o acesso fica registrado.");
        await r.pausa(1200);
        await r.apontar(main(r).getByRole("button", { name: "Copiar senha" }).first(), "O ícone ao lado copia a senha.");
        await r.clicar(main(r).getByRole("button", { name: /senha/i }).first(), "Clique no olho de novo para esconder.");
        await r.apontar(
          main(r).getByRole("button", { name: "Editar" }).first(),
          "Editar muda os dados — Senha em branco mantém a atual. Excluir fica no botão ⋯."
        );
        await r.soltar();
        await encerramento(r, "Cadastrar, editar e excluir é só da coordenação do setor. A exclusão não tem volta.");
      },
    },
    {
      arquivo: "12-repositorio-de-manuais",
      titulo: "Repositório de Manuais",
      resumo: "As instruções da equipe, para ninguém ficar sem saber o que fazer.",
      chave: "bpo_manual",
      logado: true,
      async executar(r) {
        await r.ir("/bpo-manual");
        await r.cartaz(SELO, "Repositório de Manuais", "As instruções da equipe, para ninguém ficar sem saber o que fazer");
        await r.clicar(main(r).getByRole("button", { name: "Novo documento" }), "No pé da lista, clique em Novo documento…");
        await r.digitar(
          main(r).getByRole("textbox", { name: /Título do documento/ }),
          "Fechamento do mês",
          "…digite o título e tecle Enter."
        );
        await r.page.keyboard.press("Enter");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.clicar(main(r).getByRole("button", { name: /^Página/ }).first(), "Abaixo do documento, clique em Página…");
        await r.page.keyboard.type("Conciliação bancária", { delay: 45 });
        await r.legenda("…digite o título da página e tecle Enter.");
        await r.page.keyboard.press("Enter");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1500);
        const folha = main(r).locator('[contenteditable="true"]').last();
        await r.clicar(folha, "Clique no texto e escreva direto na folha.");
        // Sem "1." no começo: o editor transforma em lista numerada sozinho.
        await r.page.keyboard.type(
          "Importe o extrato OFX de cada conta. Confirme as sugestões. O que sobrar, lance ou ignore com o motivo.",
          { delay: 25 }
        );
        await r.pausa(1500);
        await r.apontar(
          main(r).getByText(/^(Salvo|Salvando…)$/).first(),
          "O texto grava sozinho: o canto de cima mostra Salvando… e depois Salvo."
        );
        await r.apontar(
          main(r).getByRole("button", { name: /Adicionar capa/ }).first(),
          "Para ilustrar, Adicionar capa. O ícone ao lado do nome do documento também muda."
        );
        await r.soltar();
        await encerramento(r, "Excluir documento ou página é só da coordenação do setor e não pode ser desfeito.");
      },
    },
    {
      arquivo: "13-dre",
      titulo: "DRE",
      resumo: "O resultado de caixa de cada empresa, mês a mês.",
      chave: "bpo_dre",
      logado: true,
      async executar(r) {
        await r.ir("/dre");
        await r.cartaz(SELO, "DRE", "O resultado de caixa de cada empresa, mês a mês");
        await r.legenda("A DRE de caixa conta o que foi efetivamente pago e recebido em cada mês.");
        await r.escolher(
          main(r).getByRole("button", { name: /^Empresa/ }).first(),
          "Transportes",
          r.page.getByRole("option", { name: /Transportes Modelo/i }).first(),
          "Escolha a empresa em Buscar empresa…: a tela troca sozinha."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(main(r).getByRole("table").first(), "A aba Por mês abre no mês mais recente com movimento.");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Para ver outro mês, clique em Filtros e escolha o Mês.");
        await r.clicar(main(r).getByRole("link", { name: "Ano inteiro" }), "Na aba Ano inteiro, os doze meses lado a lado.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(main(r).getByRole("table").first(), "A coluna Média divide pelos meses com movimento, não por doze.");
        await r.clicar(main(r).getByRole("link", { name: "Por mês" }));
        await r.page.waitForLoadState("networkidle").catch(() => {});
        const omie = main(r).getByRole("heading", { name: "Importar do Omie" });
        await r.rolarAte(omie);
        await r.apontar(
          omie,
          "Cliente no Omie? Exporte a planilha de Contas a Pagar ou a Receber e traga aqui, em Importar do Omie."
        );
        await r.soltar();
        await r.legenda("Quando aparecer o aviso de categorias sem grupo, classifique cada uma em Classificar em… e Salvar.");
        await encerramento(r, "Para o resultado pelo mês a que cada conta pertence, pago ou não, use a DRE econômica.");
      },
    },
    {
      arquivo: "14-dre-economica",
      titulo: "DRE econômica",
      resumo: "O resultado por competência, com o orçado ao lado.",
      chave: "dre_economica",
      logado: true,
      async executar(r) {
        await r.ir("/dre/economica");
        await r.cartaz(SELO, "DRE econômica", "O resultado por competência, com o orçado ao lado");
        await r.legenda("A DRE econômica soma o que pertence a cada mês, tenha sido pago ou não.");
        await escolherEmpresa(r, "Transportes Modelo", "Escolha a empresa e o mês e clique em Aplicar.");
        await r.apontarGrupo(
          main(r).getByRole("link", { name: "Mês", exact: true }),
          main(r).getByRole("link", { name: "Últimos 12 meses" }),
          "Escolha a visão nas abas: Mês, Acumulado no ano ou Últimos 12 meses."
        );
        await r.apontar(
          main(r).getByText(/^Receita bruta/).first(),
          "Os cartões do topo: receita bruta, margem de contribuição, resultado operacional e do período."
        );
        // O aviso de "a conferir" some depois que os vídeos de contas conferem
        // as duas contas provisórias da demonstração; o de descontos fica.
        const aviso = main(r).getByText(/ainda a conferir|Da cobrança neste período/).first();
        if (await aviso.count()) await r.apontar(aviso, "Confira os avisos logo abaixo, como lançamentos ainda a conferir que entram no resultado.");
        await r.apontar(
          main(r).getByRole("combobox", { name: "Centro de custo" }),
          "Para ver um centro de custo, escolha-o aqui e clique em Aplicar."
        );
        await r.apontar(main(r).getByRole("table").first(), "Com o orçamento aprovado, o orçado aparece ao lado do realizado.");
        await r.legenda("Verde é resultado melhor que o orçado; vermelho, pior.");
        await r.soltar();
        await encerramento(r, "Valor sem grupo fica fora do resultado: classifique na tela DRE, que usa o mesmo de-para.");
      },
    },
    {
      arquivo: "15-analises-gerenciais",
      titulo: "Análises gerenciais",
      resumo: "Comparativos, projeção, cenários e indicadores.",
      chave: "dre_analises",
      logado: true,
      async executar(r) {
        await r.ir("/dre/analises");
        await r.cartaz(SELO, "Análises gerenciais", "Comparativos, projeção, cenários e indicadores");
        await escolherEmpresa(r, "Transportes Modelo", "Escolha a empresa e o mês e clique em Aplicar.");
        await r.apontar(
          main(r).getByRole("link", { name: "Econômico × financeiro" }),
          "Econômico × financeiro põe o resultado por competência ao lado do caixa."
        );
        await r.clicar(main(r).getByRole("link", { name: /^Reconciliação/ }), "Reconciliação lucro → caixa explica por que o lucro do mês é diferente do caixa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.clicar(main(r).getByRole("link", { name: "Comparativos" }), "Em Comparativos, compare meses ou empresas…");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "…escolhendo em Filtros a Comparação e o Regime.");
        await r.clicar(main(r).getByRole("link", { name: "Cenários" }), "Em Cenários, simule: pessimista, base, otimista ou personalizado.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.clicar(main(r).getByRole("link", { name: "Indicadores" }), "Em Indicadores: rentabilidade, capital de giro, caixa e risco, com a fórmula de cada um.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.clicar(main(r).getByRole("link", { name: "CFO" }), "E a aba CFO responde perguntas prontas, com diagnóstico e plano de ação.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.soltar();
        await r.legenda("Trocar de aba mantém a empresa e o mês. Tudo é calculado pelo Connect, sem IA externa.");
        await encerramento(r, "A projeção (Forecast) pede ao menos três meses com lançamento.");
      },
    },
    {
      arquivo: "16-orcamento",
      titulo: "Orçamento",
      resumo: "As versões do orçado do ano, por grupo da DRE.",
      chave: "dre_orcamento",
      logado: true,
      async executar(r) {
        await r.ir("/dre/orcamento");
        await r.cartaz(SELO, "Orçamento", "As versões do orçado do ano, por grupo da DRE");
        await escolherEmpresa(r, "Transportes Modelo", "Escolha a empresa, o ano e clique em Aplicar.");
        await r.clicar(main(r).getByRole("button", { name: "Nova versão" }), "Clique em Nova versão.");
        const versao = dialogo(r, /^Nova versão/);
        await r.digitar(versao.getByRole("textbox", { name: /^Nome da versão/ }), "Revisão de outubro", "Dê o nome da versão…");
        await selecionar(
          r,
          versao.getByRole("combobox", { name: "Partir de" }),
          "Outra versão, com reajuste",
          "…e escolha de onde partir: grade vazia, outra versão ou o realizado de um ano, com reajuste."
        );
        await selecionar(r, versao.getByRole("combobox", { name: /^Versão de origem/ }), /Orçamento/, "Escolha a versão de origem…");
        const reajuste = versao.getByRole("textbox", { name: /Reajuste/ }).or(versao.getByRole("spinbutton", { name: /Reajuste/ }));
        if (await reajuste.count()) await r.digitar(reajuste.first(), "5", "…e o Reajuste, em percentual: vale para cada célula.");
        await r.clicar(versao.getByRole("button", { name: "Criar versão" }), "Clique em Criar versão.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        const celula = main(r).getByRole("table").first().getByRole("textbox").first();
        await r.clicar(celula, "Digite o valor de cada grupo em cada mês, sempre positivo: o sinal vem do grupo.");
        await celula.fill("");
        await r.page.keyboard.type("330000", { delay: 60 });
        await r.pausa(800);
        await r.clicar(main(r).getByRole("button", { name: "Salvar grade" }), "Os totais são refeitos enquanto você digita. Clique em Salvar grade.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.clicar(main(r).getByRole("button", { name: "Aprovar versão" }), "Pronta? Clique em Aprovar versão…");
        await confirmar(r, "Aprovar", "…e confirme. A versão aprovada antes volta a rascunho.");
        await r.apontar(main(r).getByRole("link", { name: "Ver orçado × realizado" }), "Ver orçado × realizado abre a comparação na DRE econômica.");
        await r.apontar(main(r).getByRole("button", { name: "Reabrir" }), "Para mudar uma versão aprovada, Reabrir.");
        await r.soltar();
        await encerramento(r, "Só uma versão aprovada por ano, e ela fica somente leitura.");
      },
    },
  ];
}

// ─── Telas gerais e primeiros passos ────────────────────────────────────────

/** CNPJ com os dígitos verificadores — o mesmo cálculo do gerador de dados de exemplo. */
function cnpj(base12: string) {
  const d = base12.split("").map(Number);
  const dv = (pesos: number[]) => {
    const r = pesos.reduce((s, p, i) => s + p * d[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  d.push(dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join("");
}

/**
 * O relatório da conferência dos certificados (o CSV do script), inventado: as
 * empresas fictícias do banco local e uma que não está no Connect. A coluna
 * "Arquivo" vai sem senha nenhuma no nome.
 */
function relatorioDeCertificados(pasta: string) {
  const linhas = [
    ["Arquivo", "Titular", "Tipo", "Documento", "Vencimento", "Dias para vencer", "Situação", "Entrada do cofre", "Conferir", "Vencimento no cofre"],
    ["clinica.pfx", "CLÍNICA VIDA PLENA LTDA", "CNPJ", cnpj("573108420001"), daquiA(-6), "", "OK", "Certificados/Vida Plena", "", ""],
    ["padaria.pfx", "PANIFICADORA PÃO DOURADO LTDA", "CNPJ", cnpj("482917300001"), daquiA(18), "", "OK", "Certificados/Pão Dourado", "", ""],
    ["construtora.pfx", "CONSTRUTORA HORIZONTE SUL LTDA", "CNPJ", cnpj("619274580001"), daquiA(47), "", "OK", "Certificados/Horizonte Sul", "", ""],
    ["otica.pfx", "ÓTICA ALVORADA LTDA", "CNPJ", cnpj("704381960001"), daquiA(140), "", "OK", "Certificados/Ótica Alvorada", "", ""],
    ["nuvem.pfx", "NUVEM BOA SISTEMAS LTDA", "CNPJ", cnpj("835620170001"), daquiA(260), "", "OK", "Certificados/Nuvem Boa", "", ""],
    ["mercado.pfx", "MERCADO BOM PREÇO LTDA", "CNPJ", cnpj("916473250001"), daquiA(320), "", "OK", "Certificados/Bom Preço", "", ""],
    ["serra.pfx", "AUTO PEÇAS SERRA VERDE LTDA", "CNPJ", cnpj("274615830001"), daquiA(25), "", "OK", "Certificados/Serra Verde", "", ""],
  ];
  return arquivoDeApoio(pasta, "certificados.csv", linhas.map((l) => l.join(";")).join("\r\n"));
}

function videosGerais(apoio: string): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "17-inicio",
      titulo: "Início",
      resumo: "O resumo do seu trabalho e do escritório.",
      chave: "geral:inicio",
      logado: true,
      async executar(r) {
        await r.ir("/home");
        await r.cartaz(SELO, "Início", "O resumo do seu trabalho e do escritório");
        await r.apontar(
          barraLateral(r).getByRole("link", { name: "Início", exact: true }),
          "O Início fica no topo da barra lateral. O logo do Connect, acima do menu, também leva até ele."
        );
        await r.apontarGrupo(
          main(r).getByRole("link", { name: /^Empresas ativas/ }),
          main(r).getByRole("link", { name: /^Pessoas cadastradas/ }),
          "No alto, os indicadores. Clique em um deles para abrir a lista correspondente."
        );
        await r.apontar(
          main(r).getByRole("region", { name: "Destaques" }),
          "Logo abaixo, os destaques: os números que mais pedem você agora. Cada um abre a tela certa."
        );
        const paineis = main(r).getByRole("heading", { name: "Tarefas por prazo" });
        await r.rolarAte(paineis);
        await r.apontar(paineis, "Depois vêm os painéis com gráficos, como Tarefas por prazo, e os dos setores que você enxerga.");
        const meuDia = main(r).getByRole("heading", { name: "Meu dia", exact: true });
        await r.rolarAte(meuDia);
        await r.apontar(meuDia, "No bloco Meu dia, clique em um item para abrir a tarefa.");
        await r.apontar(
          main(r).getByRole("link", { name: "Revisar" }).first(),
          "Em Transferências a revisar, Revisar abre a transferência que espera o seu setor."
        );
        await r.topo();
        await r.clicar(main(r).getByRole("button", { name: "Criar" }), "O botão Criar, no canto de cima, abre um cadastro novo…");
        await r.apontarGrupo(
          main(r).getByRole("link", { name: "Nova empresa" }),
          main(r).getByRole("link", { name: "Nova transferência" }),
          "…de empresa, de pessoa ou de transferência. As opções seguem o que o seu perfil pode fazer."
        );
        await r.page.keyboard.press("Escape");
        await r.pausa(400);
        await r.clicar(main(r).getByRole("button", { name: /Personalizar/ }), "Para montar o Início do seu jeito, clique em Personalizar.");
        const personalizar = dialogo(r, "Personalizar Home");
        await r.apontar(personalizar.getByRole("checkbox").first(), "Marque os blocos que você quer ver e desmarque os que não usa.");
        await r.apontar(
          personalizar.getByRole("button", { name: /para baixo$/ }).first(),
          "As setas mudam a ordem dentro de cada faixa: Topo, Painéis, Coluna principal e Coluna lateral."
        );
        await r.apontar(
          personalizar.getByRole("button", { name: "Salvar" }),
          "Clique em Salvar. Restaurar padrão volta ao modelo original. Vale só para você."
        );
        await r.clicar(personalizar.getByRole("button", { name: "Fechar" }));
        await r.soltar();
        await encerramento(r);
      },
    },
    {
      arquivo: "18-meu-dia",
      titulo: "Meu dia",
      resumo: "Tudo o que é seu, de todos os setores, numa tela só.",
      chave: "geral:meu-dia",
      logado: true,
      async executar(r) {
        await r.ir("/home");
        await r.cartaz(SELO, "Meu dia", "Tudo o que é seu, de todos os setores, numa tela só");
        await r.clicar(barraLateral(r).getByRole("link", { name: "Meu dia" }), "Clique em Meu dia, logo abaixo de Início.");
        await r.esperarTela("/tarefas");
        await r.apontar(
          main(r).getByText(/^Atrasados/).first(),
          "Os números do topo: atrasados, vencem em breve, parados, em andamento e feitos na semana."
        );
        const agora = main(r).getByRole("heading", { name: "Pede você agora" });
        await r.apontar(agora, "Comece pela lista Pede você agora: o atrasado, o que vence e o que parou, do mais urgente para o menos.");
        await r.apontar(
          main(r).getByRole("listitem").filter({ has: r.page.getByRole("link") }).first(),
          "Clique no título para abrir. O rótulo diz de onde o item vem, e a bolinha colorida, o setor."
        );
        await r.apontarGrupo(
          main(r).getByRole("heading", { name: "Em andamento" }),
          main(r).getByRole("heading", { name: "Para começar" }),
          "Depois, siga pelas listas Em andamento e Para começar."
        );
        await r.apontar(
          main(r).getByRole("heading", { name: "Próximas reuniões" }),
          "Na coluna da direita, as próximas reuniões, com o botão Entrar…"
        );
        await r.apontar(main(r).getByRole("heading", { name: "Prazos da semana" }), "…e os prazos dos seus setores nos próximos 7 dias.");
        await r.apontar(main(r).getByRole("link", { name: "Abrir agenda" }), "Abrir agenda mostra a semana inteira na Agenda.");
        await r.topo();
        await r.apontar(main(r).getByRole("link", { name: "Quadros" }), "E Quadros, no topo, mostra as tarefas em quadro.");
        await r.clicar(
          main(r).getByRole("group", { name: "Visão" }).getByRole("link", { name: "Meu time" }),
          "Quem coordena um setor troca para Meu time…"
        );
        await r.page.waitForURL(/visao=time/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(
          main(r).getByRole("heading", { name: /Carga do time/ }),
          "…e vê o trabalho do time, com a carga de cada pessoa e o que está sem responsável."
        );
        await r.soltar();
        await encerramento(r, "Com um setor escolhido no menu, o Meu dia mostra só aquele setor.");
      },
    },
    {
      arquivo: "19-buscar-com-ctrl-k",
      titulo: "Achar qualquer coisa com Ctrl+K",
      resumo: "Telas, empresas e pessoas pelo nome, de qualquer lugar.",
      chave: "primeiros-passos:busca",
      logado: true,
      async executar(r) {
        // As "telas que você abriu por último" moram no localStorage do
        // navegador (`connect41:telas-recentes`), e o da gravação nasce vazio:
        // o vídeo semeia três, como se a pessoa tivesse passado por elas.
        await r.ir("/home");
        await r.page.evaluate(() =>
          localStorage.setItem("connect41:telas-recentes", JSON.stringify(["bpo_contas_pagar", "bpo_conciliacao", "portal_solicitacoes"]))
        );
        await r.ir("/home");
        await r.cartaz(SELO, "Achar qualquer coisa com Ctrl+K", "Telas, empresas e pessoas pelo nome, de qualquer lugar");
        const busca = barraLateral(r).getByRole("textbox", { name: /Buscar/ });
        await r.apontar(busca, "A busca fica no alto da barra lateral. De qualquer tela, aperte Ctrl+K para chegar nela.");
        await r.page.keyboard.press("Control+k");
        await r.pausa(900);
        const recentes = r.page.getByText("Recentes", { exact: true }).first();
        if (await recentes.count()) await r.apontar(recentes, "Antes de digitar, aparecem as telas que você abriu por último.");
        await r.soltar();
        await r.page.keyboard.type("pao dour", { delay: 90 });
        await r.pausa(1200);
        const resultado = r.page.getByText("PANIFICADORA PÃO DOURADO LTDA", { exact: true }).first();
        await r.apontar(resultado, "Digite parte do nome — sem acento também funciona. Saem empresas, pessoas, tarefas e telas.");
        // O Enter não abriu o primeiro resultado no teste de 06/10 (divergência
        // com a central de ajuda): o vídeo clica.
        await r.clicar(resultado, "Clique no resultado para abrir.");
        await r.page.waitForURL(/\/empresas\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(main(r).getByRole("heading", { level: 1 }), "Pronto: a ficha da empresa, sem passar pelo menu.");
        await r.soltar();
        await encerramento(r, "Ctrl+K funciona em qualquer tela do Connect.");
      },
    },
    {
      arquivo: "20-trabalhar-dentro-de-um-setor",
      titulo: "Trabalhar dentro de um setor",
      resumo: "O menu passa a mostrar só as telas do setor escolhido.",
      chave: "primeiros-passos:setor",
      logado: true,
      async executar(r) {
        await r.ir("/home");
        await r.cartaz(SELO, "Trabalhar dentro de um setor", "O menu passa a mostrar só as telas do setor escolhido");
        await r.apontar(
          barraLateral(r).getByText(/^Meus setores$/i),
          "Em Todos os setores, a barra lateral lista os seus setores em Meus setores."
        );
        await r.clicar(barraLateral(r).getByRole("button", { name: "BPO", exact: true }), "Clique no nome do setor para entrar nele.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        const contas = barraLateral(r).getByRole("link", { name: /^Contas/ });
        await r.apontar(contas, "O menu passa a mostrar só as telas do setor, agrupadas: Contas, Banco e caixa, Cliente…");
        await contas.hover();
        await r.pausa(1200);
        await r.legenda("Passe o mouse num grupo para ver as telas dele ao lado, sem abrir.");
        const seletor = r.page.getByRole("banner").getByRole("button", { name: /41 Tech/ });
        await r.clicar(seletor, "Para trocar de setor, use o seletor no alto da tela, ao lado do nome do escritório.");
        const trocar = dialogo(r, "Trocar de setor ou escritório");
        await r.apontar(trocar.getByRole("button", { name: "DP", exact: true }), "Escolha outro setor…");
        await r.clicar(trocar.getByRole("button", { name: /^Todos os setores/ }), "…ou volte para Todos os setores, a visão geral.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await r.soltar();
        await encerramento(r, "O Início e o Meu dia acompanham o setor escolhido.");
      },
    },
    {
      arquivo: "21-filtrar-uma-lista",
      titulo: "Filtrar uma lista",
      resumo: "O botão Filtros e o funil de cada coluna, como no Excel.",
      chave: "primeiros-passos:filtros",
      logado: true,
      async executar(r) {
        await r.ir("/pagar");
        await r.cartaz(SELO, "Filtrar uma lista", "O botão Filtros e o funil de cada coluna, como no Excel");
        await r.clicar(main(r).getByRole("button", { name: /^Filtros/ }), "O botão Filtros, acima da tabela, abre os filtros da tela.");
        await r.pausa(700);
        await r.clicar(main(r).getByRole("button", { name: /^Empresa / }), "Escolha o filtro à esquerda…");
        const buscaNoFiltro = main(r).getByRole("textbox", { name: "Buscar empresa", exact: true });
        if (await buscaNoFiltro.count()) await r.digitar(buscaNoFiltro, "transp", "…busque dentro dele…");
        await r.clicar(
          main(r).getByRole("listbox", { name: "Empresa" }).getByRole("option", { name: /Transportes Modelo/i }).first(),
          "…e escolha o valor."
        );
        await r.page.keyboard.press("Escape");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(
          main(r).getByRole("button", { name: /^Tirar o filtro de/ }).first(),
          "Os filtros ativos aparecem como etiquetas. O X de cada uma tira o filtro."
        );
        await r.clicar(
          main(r).getByRole("button", { name: "Filtrar a coluna fornecedor" }),
          "Já o funil ao lado do título de uma coluna filtra só por ela, como no Excel."
        );
        await r.pausa(700);
        const tudo = r.page.getByText("(Selecionar tudo)").filter({ visible: true }).first();
        if (await tudo.count()) await r.clicar(tudo, "Desmarque tudo…");
        await r.clicar(r.page.getByText("POSTO CENTRAL", { exact: true }).filter({ visible: true }).last(), "…marque os valores que você quer ver…");
        await r.clicar(
          r.page.getByRole("button", { name: /^(Pronto|Aplicar)$/ }).filter({ visible: true }).last(),
          "…e feche. A lista já filtra enquanto você marca."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await r.apontar(main(r).getByRole("table").first(), "Pronto: só as contas do fornecedor escolhido.");
        await r.clicar(
          main(r).getByRole("button", { name: /^Tirar o filtro de fornecedor/ }).or(main(r).getByRole("button", { name: /Limpar filtros das colunas/ })).first(),
          "Para voltar à lista inteira, tire o filtro pelo X."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(600);
        await r.soltar();
        await encerramento(r, "Filtros e funis funcionam do mesmo jeito em todas as listas do Connect.");
      },
    },
    {
      arquivo: "22-empresas",
      titulo: "Empresas",
      resumo: "A lista e a ficha das empresas atendidas.",
      chave: "geral:empresas",
      logado: true,
      async executar(r) {
        await r.ir("/home");
        await r.cartaz(SELO, "Empresas", "A lista e a ficha das empresas atendidas");
        await r.clicar(barraLateral(r).getByRole("link", { name: "Cadastros" }), "Abra Cadastros na barra lateral e fique na aba Empresas.");
        await r.esperarTela(/\/(empresas|cadastros)/);
        await r.digitar(main(r).getByRole("textbox", { name: /Buscar por nome/ }), "bom", "Digite parte do nome ou do ID para achar uma empresa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await main(r).getByRole("textbox", { name: /Buscar por nome/ }).fill("");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(
          main(r).getByRole("button", { name: /^Filtros/ }),
          "Em Filtros, troque o status mostrado: Ativo, Prospecto, Inativo, Cancelado ou todos."
        );
        await r.apontar(
          main(r).getByRole("button", { name: "Filtrar a coluna regime" }),
          "Para filtrar por regime ou cidade, use o funil das colunas Regime e Localização."
        );
        await r.clicar(main(r).getByRole("link", { name: /MERCADO BOM PREÇO LTDA/ }).first(), "Clique no nome da empresa para abrir a ficha.");
        await r.esperarTela(/\/empresas\/[^/]+$/);
        await r.apontar(main(r).getByRole("heading", { name: "Identificação" }), "Em Visão Geral ficam os dados cadastrais e os serviços contratados.");
        await r.apontar(
          main(r).getByRole("tablist"),
          "As abas trazem o resto: filiais, pessoas, RH & Operação, documentos, conversas e histórico."
        );
        await r.clicar(main(r).getByRole("tab", { name: "RH & Operação" }), "Em RH & Operação: sócios, cargos, departamentos, benefícios, turnos, folha e documentos para o cliente.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await r.apontar(
          main(r).getByRole("link", { name: "Solicitar Transferência" }),
          "Para passar um assunto da empresa a outro setor, Solicitar Transferência."
        );
        await r.clicar(main(r).getByRole("link", { name: "Empresas", exact: true }).first());
        await r.esperarTela(/\/(empresas|cadastros)/);
        await r.clicar(main(r).getByRole("button", { name: "Mais ações" }).first(), "Na linha, os três pontinhos ao lado de Editar guardam Inativar — e Reativar, para as inativas.");
        await r.pausa(1200);
        await r.page.keyboard.press("Escape");
        await r.clicar(main(r).getByRole("link", { name: "+ Nova Empresa" }), "Para cadastrar, clique em + Nova Empresa.");
        await r.esperarTela("/empresas/nova");
        await r.apontar(
          main(r).getByRole("textbox", { name: "CNPJ" }),
          "Escolha o Tipo de cadastro. Com CNPJ, os dados se preenchem sozinhos ao completar os dígitos."
        );
        await r.apontar(
          main(r).getByRole("tablist"),
          "Complete cada etapa e clique em Avançar →. Na última, revise e clique em Confirmar e salvar."
        );
        await r.soltar();
        await encerramento(r, "Inativar não apaga nada: a empresa só sai da lista padrão e pode voltar.");
      },
    },
    {
      arquivo: "23-pessoas",
      titulo: "Pessoas",
      resumo: "Os funcionários do escritório e a ficha de cada um.",
      chave: "geral:pessoas",
      logado: true,
      async executar(r) {
        await r.ir("/empresas");
        await r.cartaz(SELO, "Pessoas", "Os funcionários do escritório e a ficha de cada um");
        await r.clicar(main(r).getByRole("tab", { name: "Pessoas" }), "Em Cadastros, clique na aba Pessoas.");
        await r.esperarTela(/\/pessoas/);
        await r.apontar(main(r).getByRole("textbox", { name: /Buscar por nome/ }), "Busque pelo nome.");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Para ver quem está inativo, Filtros → Situação: Inativos ou Todos.");
        await r.clicar(main(r).getByRole("link", { name: /Ana Beatriz Correia/ }).first(), "Clique no nome para abrir a ficha.");
        await r.esperarTela(/\/pessoas\/[^/]+$/);
        await r.apontar(
          main(r).getByRole("tablist"),
          "Visão Geral, Vínculo, Dados Trabalhistas, Documentos, Conversas e Histórico: tudo da pessoa."
        );
        const vinculo = main(r).getByRole("tab", { name: "Vínculo" });
        if (await vinculo.count()) {
          await r.clicar(vinculo, "Em Vínculo, a empresa, o cargo e o departamento.");
          await r.page.waitForLoadState("networkidle").catch(() => {});
          await r.pausa(800);
        }
        await r.apontar(
          main(r).getByRole("link", { name: "Solicitar Transferência" }),
          "Solicitar Transferência passa um assunto da pessoa a outro setor."
        );
        await r.ir("/pessoas");
        await r.apontar(main(r).getByRole("link", { name: "+ Nova Pessoa" }), "Para cadastrar, + Nova Pessoa: preencha cada etapa, Avançar → e Confirmar e salvar.");
        await r.clicar(main(r).getByRole("button", { name: "Mais ações" }).first(), "Os três pontinhos da linha guardam Inativar e Reativar.");
        await r.pausa(1200);
        await r.page.keyboard.press("Escape");
        await r.soltar();
        await encerramento(r, "Os funcionários das empresas clientes ficam em Colaboradores de clientes.");
      },
    },
    {
      arquivo: "24-transferencias",
      titulo: "Transferências",
      resumo: "Passar o assunto de uma empresa ou pessoa para outro setor.",
      chave: "geral:transferencias",
      logado: true,
      async executar(r) {
        await r.ir("/transferencias");
        await r.cartaz(SELO, "Transferências", "Passar o assunto de uma empresa ou pessoa para outro setor");
        await r.clicar(main(r).getByRole("link", { name: "+ Nova Transferência" }), "Clique em + Nova Transferência.");
        await r.esperarTela(/\/transferencias\/novo/);
        await r.apontar(
          main(r).getByRole("combobox", { name: "Modelo de solicitação" }),
          "Se quiser, escolha um Modelo de solicitação: ele preenche a descrição e, às vezes, os setores."
        );
        await selecionar(r, main(r).getByRole("combobox", { name: /^Tipo/ }), "Empresa", "Escolha o Tipo — empresa ou pessoa…");
        await selecionar(r, main(r).getByRole("combobox", { name: /^Empresa/ }), "MERCADO BOM PREÇO LTDA", "…qual é…");
        await selecionar(r, main(r).getByRole("combobox", { name: /^Setor de origem/ }), "Societário", "…o Setor de origem…");
        await selecionar(r, main(r).getByRole("combobox", { name: /^Prioridade/ }), "Alta", "…e a Prioridade.");
        await r.clicar(main(r).getByRole("checkbox", { name: "Fiscal" }), "Marque os Setores de destino.");
        await r.clicar(main(r).getByRole("checkbox", { name: "DP" }));
        await r.digitar(
          main(r).getByRole("textbox", { name: "Descrição" }),
          "A loja muda de endereço em novembro: atualizar a inscrição municipal e o endereço dos funcionários.",
          "Escreva a Descrição. Digitando @, você menciona um colega, que é avisado."
        );
        const instrucao = main(r).getByRole("textbox", { name: /Instrução para DP/ }).or(main(r).getByPlaceholder(/setor DP precisa/)).first();
        await r.digitar(
          instrucao,
          "Atualizar o endereço da empresa no eSocial.",
          "Em Instrução por setor, diga o que cada setor precisa fazer."
        );
        await r.apontar(
          main(r).getByRole("button", { name: /Definir responsáveis/ }).first(),
          "Se quiser, Definir responsáveis escolhe quem cuida em cada setor."
        );
        await r.clicar(main(r).getByRole("button", { name: "Solicitar Transferência" }), "Clique em Solicitar Transferência.");
        await r.page.waitForURL((u) => !u.pathname.endsWith("/novo"), { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        if (!/\/transferencias\/[^/]+$/.test(new URL(r.page.url()).pathname)) {
          await r.clicar(main(r).getByRole("link", { name: /MERCADO BOM PREÇO LTDA/ }).first());
          await r.esperarTela(/\/transferencias\/[^/]+$/);
        }
        await r.apontar(
          main(r).getByRole("combobox", { name: "Situação do setor" }).first(),
          "Cada setor de destino tem o seu cartão, com a instrução, a situação e o responsável."
        );
        await selecionar(
          r,
          main(r).getByRole("combobox", { name: "Situação do setor" }).first(),
          "Resolvendo",
          "O setor muda para Resolvendo ao começar, e para Finalizada ao terminar."
        );
        await r.apontar(main(r).getByRole("combobox", { name: "Responsável" }).first(), "Quem coordena o setor escolhe o Responsável.");
        await r.ir("/transferencias");
        await r.apontarGrupo(
          main(r).getByRole("link", { name: /^Novas/ }),
          main(r).getByRole("link", { name: /^Finalizadas/ }),
          "Na lista, os cartões Novas, Resolvendo e Finalizadas mostram quantas há em cada situação."
        );
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, escolha a Prioridade.");
        await r.soltar();
        await encerramento(r, "A transferência fica Finalizada quando todos os setores terminam.");
      },
    },
    {
      arquivo: "25-solicitacoes-dos-clientes",
      titulo: "Solicitações dos clientes",
      resumo: "A fila do que os clientes pedem pelo portal.",
      chave: "portal_solicitacoes",
      logado: true,
      async executar(r) {
        await r.ir("/solicitacoes");
        await r.cartaz(SELO, "Solicitações dos clientes", "A fila do que os clientes pedem pelo portal");
        await r.apontar(
          main(r).getByRole("link", { name: /^Novas/ }),
          "Os cartões abrem cada recorte: novas, minhas, resposta atrasada e aguardando cliente."
        );
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros: situação, setor, empresa ou só as atrasadas.");
        const primeira = linha(r, "Segunda via de guia");
        await r.apontar(
          primeira.getByRole("cell").nth(3),
          "Cada linha diz até quando responder e o selo do prazo: no prazo, responder hoje ou resposta atrasada."
        );
        await r.clicar(primeira.getByRole("link").first(), "Clique no número e no assunto para abrir.");
        await r.esperarTela(/\/solicitacoes\/[^/]+$/);
        await r.clicar(main(r).getByRole("button", { name: "Assumir" }), "Leia o pedido e clique em Assumir para ficar como responsável.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await r.apontar(
          main(r).getByRole("button", { name: "Encaminhar" }),
          "Se o assunto é de outro setor, Encaminhar: escolha o setor e explique o motivo."
        );
        await r.digitar(
          main(r).getByRole("textbox", { name: "Mensagem" }),
          "Segue a segunda via do DAS de setembro, com vencimento atualizado.",
          "Para responder, escreva a Mensagem e, se precisar, inclua Anexos."
        );
        await selecionar(
          r,
          main(r).getByRole("combobox", { name: "Depois de enviar" }),
          "Concluída",
          "Em Depois de enviar: continua com a equipe, aguardando o cliente ou concluída."
        );
        await r.apontar(
          main(r).getByRole("checkbox", { name: /Nota interna/ }),
          "Para falar só com a equipe, marque Nota interna: o cliente não vê."
        );
        await r.clicar(main(r).getByRole("button", { name: "Enviar" }), "Clique em Enviar. O cliente recebe um e-mail avisando que há resposta.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.soltar();
        await r.legenda("Concluir encerra o pedido e avisa o cliente. Reabrir traz de volta para a fila.");
        await encerramento(r, "Os assuntos, com o setor e o prazo de cada um, ficam em Configurações → Assuntos das solicitações.");
      },
    },
    {
      arquivo: "26-agenda",
      titulo: "Agenda",
      resumo: "Os prazos dos seus setores e as suas reuniões.",
      chave: "geral:agenda",
      logado: true,
      async executar(r) {
        await r.ir("/home");
        await r.cartaz(SELO, "Agenda", "Os prazos dos seus setores e as suas reuniões");
        await r.clicar(barraLateral(r).getByRole("link", { name: "Agenda" }), "Abra Agenda na barra lateral.");
        await r.esperarTela("/agenda");
        await r.apontar(
          main(r).getByRole("group", { name: "Visão da agenda" }),
          "Escolha a visão: Dia, Semana ou Mês."
        );
        await r.apontarGrupo(
          main(r).getByRole("link", { name: /anterior$/ }),
          main(r).getByRole("button", { name: /Escolher data/ }),
          "As setas vão ao período anterior e ao próximo, Hoje volta à data atual, e o calendário leva direto a uma data."
        );
        await r.apontar(
          main(r).getByRole("list", { name: "Setores dos prazos" }),
          "As cores dos prazos seguem a legenda dos setores. Clique num prazo para abrir o item."
        );
        await r.clicar(main(r).getByRole("group", { name: "Visão da agenda" }).getByRole("link", { name: "Mês" }));
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.clicar(main(r).getByRole("button", { name: "Nova reunião" }), "Para agendar uma reunião, clique em Nova reunião, ou num horário vazio.");
        const reuniao = dialogo(r, "Nova reunião");
        await r.apontar(
          reuniao.getByText(/Conecte sua conta/),
          "A primeira vez, conecte a sua conta Google ou Microsoft, em Integrações. Depois, é título, horário, provedor e participantes."
        );
        await r.clicar(reuniao.getByRole("button", { name: "Fechar" }));
        await r.clicar(r.page.getByRole("banner").getByRole("button", { name: "Menu do usuário" }), "O horário da grade é ajustável: clique na sua foto, no alto…");
        await r.clicar(r.page.getByRole("button", { name: "Configurações do perfil" }), "…e em Configurações do perfil.");
        await r.page.waitForURL(/\/configuracoes/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        // O menu do usuário continua aberto depois de trocar de tela, e o Esc
        // não o fecha (06/10): um clique no vazio da barra lateral fecha.
        await r.page.mouse.click(60, 860);
        await r.pausa(400);
        const grade = r.page.getByRole("radiogroup", { name: "Horário da Agenda" });
        await r.rolarAte(grade);
        await r.apontar(grade, "Em Agenda, escolha Usar o do escritório ou Definir o meu.");
        await r.clicar(grade.getByRole("radio", { name: /^Definir o meu/ }));
        await r.pausa(800);
        await r.legenda("Para definir o seu, escolha o Início e o Fim e clique em Salvar. Um fim antes do início termina no dia seguinte.");
        await r.clicar(grade.getByRole("radio", { name: /^Usar o do escritório/ }));
        await r.soltar();
        await encerramento(r, "Só gestores de setor e administradores criam reuniões.");
      },
    },
    {
      arquivo: "27-espacos",
      titulo: "Espaços",
      resumo: "As listas e os quadros de tarefas de cada setor.",
      chave: "geral:espacos",
      logado: true,
      async executar(r) {
        await r.ir("/home");
        await r.cartaz(SELO, "Espaços", "As listas e os quadros de tarefas de cada setor");
        await r.clicar(barraLateral(r).getByRole("button", { name: "DP", exact: true }), "Entre no setor…");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(700);
        await r.clicar(barraLateral(r).getByRole("link", { name: "Espaços" }), "…e clique em Espaços.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        const lista = main(r).getByRole("link", { name: /Folha de pagamento/ }).first();
        await r.apontarGrupo(
          main(r).getByText("DP", { exact: true }).first(),
          lista,
          "Cada cartão é um espaço, com as listas logo abaixo do nome."
        );
        await r.clicar(lista, "Clique numa lista para abrir.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.apontar(
          main(r).getByRole("button", { name: /Adicionar Tarefa/ }).first(),
          "Na visão Lista, Adicionar Tarefa cria uma tarefa no grupo do status: digite o nome e aperte Enter."
        );
        await r.apontar(main(r).getByRole("button", { name: "+ Item" }).or(main(r).getByRole("link", { name: "+ Item" })).first(), "+ Item inclui uma empresa ou pessoa na lista.");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }).first(), "A busca e o botão Filtros filtram por responsável, criador, etiqueta, prioridade e prazo.");
        await r.clicar(
          main(r).getByRole("group", { name: "Visão do pipeline" }).getByRole("button", { name: /Quadro/ }),
          "Troque entre Lista e Quadro: em linhas, ou em colunas por status."
        );
        await r.pausa(1200);
        const card = main(r).getByText(/Folha de setembro/).filter({ visible: true }).first();
        await r.clicar(card, "Clique no nome da tarefa para abrir o card. No Quadro, dá para arrastar o card de coluna.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.legenda("No card: Status, Responsáveis, Participantes, Datas, Prioridade, Etiquetas, Subtarefas, Checklist e Anexos.");
        const comentario = r.page.getByRole("textbox", { name: /coment/i }).last();
        if (await comentario.count()) {
          await r.digitar(comentario, "Conferi os proventos. Falta só o adiantamento.", "Em Comentários e atividade, escreva e use @ para mencionar alguém.");
          // Sem clicar: em 06/10 o "Comentar" estourava a pilha no servidor
          // (`revalidarItem` chamava a si mesma, kanban/actions.ts) — o vídeo
          // não grava erro. Depois da correção, pode clicar.
          const comentar = r.page.getByRole("button", { name: "Comentar" }).last();
          if (await comentar.count()) await r.apontar(comentar, "Clique em Comentar.");
        }
        const concluir = r.page.getByRole("button", { name: "Concluir tarefa" }).last();
        if (await concluir.count()) await r.apontar(concluir, "Quando terminar, Concluir tarefa.");
        await r.soltar();
        await encerramento(r, "Criar espaços, pastas, listas e tarefas é do gestor do setor e dos administradores.");
      },
    },
    {
      arquivo: "28-certificados-digitais",
      titulo: "Certificados digitais",
      resumo: "Quando vence cada certificado A1 e onde está a senha.",
      chave: "tech_certificados",
      logado: true,
      async executar(r) {
        await r.ir("/certificados");
        await r.cartaz(SELO, "Certificados digitais", "Quando vence cada certificado A1 e onde está a senha");
        await r.legenda("O arquivo e a senha do certificado não entram no Connect: aqui fica o vencimento e a entrada do cofre.");
        const importar = main(r).getByRole("button", { name: "Importar relatório" });
        await r.anexar(
          importar,
          main(r).locator('input[type="file"]').first(),
          relatorioDeCertificados(apoio),
          "Para atualizar a lista, clique em Importar relatório e escolha o .csv da conferência dos certificados."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1500);
        await r.legenda("A mensagem diz quantos certificados entraram ou foram atualizados.");
        await r.apontarGrupo(
          main(r).getByRole("link", { name: /^Vencidos/ }),
          main(r).getByRole("link", { name: /^Sem empresa no Connect/ }),
          "Os cartões: vencidos, que vencem em 30 e em 60 dias, e os sem empresa no Connect. Clique para abrir a lista."
        );
        await r.apontar(main(r).getByRole("table").first(), "A lista abre em A renovar: os vencidos e os que vencem nos próximos 60 dias.");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, a Situação mostra os outros: todos em uso, sem empresa ou substituídos.");
        await r.apontar(
          main(r).getByRole("searchbox", { name: "Buscar certificado" }),
          "Busque pelo titular, pela entrada do cofre ou por três números do documento."
        );
        await r.apontar(
          main(r).getByRole("columnheader", { name: /Entrada do cofre/ }).or(main(r).getByText("Entrada do cofre", { exact: true })).first(),
          "A coluna Entrada do cofre diz onde achar a senha no cofre do escritório."
        );
        await r.soltar();
        await encerramento(r, "O setor recebe avisos 60, 30, 15 e 7 dias antes do vencimento, e no próprio dia.");
      },
    },
    {
      arquivo: "29-leads",
      titulo: "Leads",
      resumo: "Quem quer ser cliente do escritório.",
      chave: "comercial_leads",
      logado: true,
      async executar(r) {
        await r.ir("/leads");
        await r.cartaz(SELO, "Leads", "Quem quer ser cliente do escritório");
        await r.legenda("Os leads chegam pela ficha Quero ser cliente, na entrada do portal. O setor é avisado no sino.");
        await r.apontar(main(r).getByRole("table").first(), "A lista abre nos leads em aberto: os novos e os que estão em contato.");
        await r.apontar(
          main(r).getByRole("button", { name: /^Filtros/ }),
          "Em Filtros, a Situação mostra os que viraram cliente ou foram descartados. Em Responsável, Comigo."
        );
        await r.clicar(linha(r, "Juliana Ramos").getByRole("cell").first(), "Clique na linha para abrir o lead.");
        await r.page.waitForURL(/\/leads\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(
          main(r).getByText(/WhatsApp/).first(),
          "O contato: o e-mail abre o seu programa de e-mail, e abrir no WhatsApp abre a conversa."
        );
        const responsavel = main(r).getByRole("combobox", { name: /Responsável/ }).first();
        await selecionar(r, responsavel, "Camila Duarte", "Em Acompanhamento, escolha o responsável…");
        await selecionar(r, main(r).getByRole("combobox", { name: /Situação/ }).first(), "Em contato", "…e mude a situação para Em contato ao falar com a pessoa.");
        await r.digitar(
          main(r).getByRole("textbox", { name: /Observações/ }).first(),
          "Liguei: quer proposta para contabilidade e folha. Mandar até sexta.",
          "Escreva em Observações o que foi conversado. Só a equipe vê."
        );
        await r.clicar(main(r).getByRole("button", { name: "Salvar" }).first(), "Clique em Salvar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await r.apontar(
          main(r).getByRole("button", { name: "Excluir" }).first(),
          "Excluir é só quando a pessoa pede para apagar os dados. Para tirar da fila, basta Descartado."
        );
        await r.soltar();
        await encerramento(r, "Quando fechar negócio, mude a situação para Virou cliente.");
      },
    },
  ];
}

// ─── Societário ─────────────────────────────────────────────────────────────

function videosDoSocietario(): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "30-processos",
      titulo: "Processos do Societário",
      resumo: "Constituição, alteração, baixa e alvarás, etapa por etapa.",
      chave: "societario_processos",
      logado: true,
      async executar(r) {
        await r.ir("/processos");
        await r.cartaz(SELO, "Processos", "Constituição, alteração, baixa e alvarás, etapa por etapa");
        await r.apontar(
          main(r).getByRole("link", { name: /^Em exigência/ }),
          "Os cartões do topo separam a fila pela situação: em exigência, aguardando órgão, em andamento…"
        );
        await r.clicar(main(r).getByRole("button", { name: "Abrir processo" }), "Para abrir um processo, clique em Abrir processo.");
        const abrir = dialogo(r, "Abrir processo");
        await r.escolher(
          abrir.getByRole("button", { name: /^Empresa/ }),
          "Ótica",
          r.page.getByRole("option", { name: /ÓTICA ALVORADA/i }).first(),
          "Busque a Empresa…"
        );
        await selecionar(
          r,
          abrir.getByRole("combobox", { name: /^Tipo de processo/ }),
          /Alteração Contratual/,
          "…e escolha o Tipo de processo. O prazo previsto aparece ao lado de cada tipo."
        );
        await r.digitar(abrir.getByRole("textbox", { name: "Título" }), "Aumento do capital social", "Se quiser, preencha Título, Responsável, Prioridade e Prazo combinado.");
        await r.clicar(abrir.getByRole("button", { name: "Abrir", exact: true }), "Clique em Abrir.");
        await r.page.waitForURL(/\/processos\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        const roteiro = main(r).getByRole("heading", { name: /Roteiro/ }).first();
        await r.rolarAte(roteiro);
        await r.apontar(roteiro, "No Roteiro ficam as etapas do processo, cada uma com o seu checklist.");
        const item = main(r).getByRole("checkbox").filter({ visible: true }).first();
        if (await item.count()) {
          await r.clicar(item, "Marque os itens do checklist à medida que forem feitos.");
          await r.page.waitForLoadState("networkidle").catch(() => {});
          await r.pausa(800);
        }
        const concluir = main(r).getByRole("button", { name: "Concluir", exact: true }).filter({ visible: true }).first();
        await r.clicar(concluir, "Etapa que não vai a um órgão: clique em Concluir. Opcional que não se aplica: Não se aplica.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        // A etapa seguinte (Viabilidade) vai à Junta: espera o "Protocolar" dela.
        await main(r).getByRole("button", { name: "Protocolar" }).first().waitFor({ timeout: 15000 }).catch(() => {});
        await r.pausa(800);
        const protocolo = main(r).getByRole("button", { name: /^(Protocolar|Deferido|Exigência)$/ }).filter({ visible: true }).first();
        if (await protocolo.count()) {
          await r.rolarAte(protocolo);
          await r.apontar(
            protocolo,
            "Informe o número do protocolo e clique em Protocolar. Na resposta do órgão: Deferido, ou Exigência — com o que ele pediu e o prazo."
          );
        }
        await r.topo();
        await r.apontar(
          main(r).getByRole("button", { name: "Esperar o cliente" }).first(),
          "No topo, Esperar o cliente e Suspender pausam o processo; Indeferir e Cancelar ficam no menu ⋯. Retomar volta a tocar."
        );
        await r.soltar();
        await r.legenda("Exigência cumprida? Marcar como cumprida, e depois Reapresentar. Cada reapresentação conta uma volta.");
        await encerramento(r, "O cliente vê no portal a situação do processo e o que for escrito na conversa com ele.");
      },
    },
    {
      arquivo: "31-licencas",
      titulo: "Licenças",
      resumo: "Alvará, sanitária, ambiental, bombeiros: o que vence e o que renovar.",
      chave: "societario_licencas",
      logado: true,
      async executar(r) {
        await r.ir("/licencas");
        await r.cartaz(SELO, "Licenças", "Alvará, sanitária, ambiental, bombeiros: o que vence e o que renovar");
        await r.apontar(
          main(r).getByRole("link", { name: /^Precisa de ação/ }),
          "A tela abre em Precisa de ação: as vencidas e as que vencem nos próximos 60 dias."
        );
        await r.apontarGrupo(
          main(r).getByRole("link", { name: /^Vencidas/ }),
          main(r).getByRole("link", { name: /^Vigentes/ }),
          "Os cartões Vencidas, A renovar e Vigentes recortam a lista. Em Filtros, Todas."
        );
        await r.clicar(main(r).getByRole("button", { name: "Nova licença" }), "Para cadastrar, clique em Nova licença.");
        const nova = dialogo(r);
        await r.escolher(
          nova.getByRole("button", { name: /^Empresa/ }),
          "Ótica",
          r.page.getByRole("option", { name: /ÓTICA ALVORADA/i }).first(),
          "Busque a Empresa…"
        );
        const licenca = nova.getByRole("combobox", { name: /^Licença/ }).or(nova.getByRole("textbox", { name: /^Licença/ })).first();
        await r.digitar(licenca, "Licença sanitária", "…em Licença, escolha uma sugestão ou escreva o nome que o órgão usa…");
        await r.page.keyboard.press("Tab");
        const numero = nova.getByRole("textbox", { name: /^Número/ });
        if (await numero.count()) await r.digitar(numero, "VISA-77310", "…e preencha Órgão, Número, Emissão e Validade. Sem validade: a licença não vence.");
        const validade = nova.getByRole("combobox", { name: /^Validade/ });
        if (await validade.count()) await digitarData(r, validade, daquiA(365));
        await r.clicar(nova.getByRole("button", { name: "Cadastrar" }), "Clique em Cadastrar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        const renovar = linha(r, "Pão Dourado");
        await r.apontar(
          renovar.getByRole("button", { name: "Editar" }),
          "Renovou? Clique em Editar, ajuste a nova validade e Salvar."
        );
        await r.clicar(renovar.getByRole("button", { name: "Mais ações" }), "No botão ⋯, Revogar tira a licença da fila — e Reativar traz de volta.");
        await r.pausa(1200);
        await r.page.keyboard.press("Escape");
        await r.soltar();
        await encerramento(r, "Revogar não apaga: o histórico continua na empresa.");
      },
    },
    {
      arquivo: "32-minha-area",
      titulo: "Minha área do Societário",
      resumo: "O que está na sua mão, por prazo.",
      chave: "societario_minha_area",
      logado: true,
      async executar(r) {
        await r.ir("/societario/minha-area");
        await r.cartaz(SELO, "Minha área", "O que está na sua mão, por prazo");
        await r.apontar(
          main(r).getByText("Vencidos", { exact: true }).first(),
          "No topo, quantos itens venceram, vencem hoje e nos próximos 7 dias."
        );
        await r.legenda("A lista vem agrupada por prazo: vencido, hoje, próximos 7 dias, depois e sem data.");
        const item = main(r).getByRole("link").filter({ hasText: /Exigência|Taxa|Licença|Prazo/ }).first();
        if (await item.count()) {
          await r.apontar(item, "Cada item diz se é exigência, taxa, licença ou prazo combinado com o cliente. Clique para abrir.");
        }
        await r.apontar(
          main(r).getByRole("link", { name: /^Processos abertos/ }),
          "O cartão Processos abertos leva à fila, só com os seus."
        );
        await r.clicar(main(r).getByRole("link", { name: "Meus processos no kanban" }), "E Meus processos no kanban mostra os seus em colunas, por situação.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1500);
        await r.soltar();
        await encerramento(r, "Só entra aqui o processo em que você é o responsável. Para mudar, Editar dados no processo.");
      },
    },
    {
      arquivo: "33-exigencias-e-prazos",
      titulo: "Exigências e prazos",
      resumo: "As exigências de todos os processos e a agenda única de prazos.",
      chave: "societario_prazos",
      logado: true,
      async executar(r) {
        await r.ir("/societario/exigencias");
        await r.cartaz(SELO, "Exigências e prazos", "As exigências de todos os processos e a agenda única de prazos");
        await r.apontar(main(r).getByRole("table").first(), "Na aba Exigências, as abertas, com o prazo que o órgão deu.");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, as cumpridas ou todas, ou as de um responsável.");
        await r.apontar(
          main(r).getByRole("table").first().getByRole("link").first(),
          "Clique no processo para abri-lo, ou na empresa para ver a visão societária dela."
        );
        await r.apontar(
          main(r).getByRole("button", { name: "Marcar como cumprida" }).first(),
          "Cumpriu a exigência? Marcar como cumprida."
        );
        await r.clicar(main(r).getByRole("link", { name: "Agenda de prazos" }), "Na aba Agenda de prazos…");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(
          main(r).getByRole("heading", { level: 2 }).first(),
          "…prazos de órgão, taxas, validades de licença e prazos com o cliente, por semana, com os vencidos no topo."
        );
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, Agrupar por mês, ou os prazos de um Responsável.");
        await r.soltar();
        await encerramento(r, "A exigência nasce no roteiro do processo, quando o protocolo volta do órgão.");
      },
    },
    {
      arquivo: "34-relatorios-do-societario",
      titulo: "Relatórios do Societário",
      resumo: "Prazo cumprido, voltas de exigência, produtividade e taxas.",
      chave: "societario_relatorios",
      logado: true,
      async executar(r) {
        await r.ir("/societario/relatorios");
        await r.cartaz(SELO, "Relatórios do Societário", "Prazo cumprido, voltas de exigência, produtividade e taxas");
        await r.clicar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros, escolha o Período: 30 dias, 90 dias ou 12 meses.");
        await r.pausa(1200);
        await r.page.keyboard.press("Escape");
        await r.apontar(
          main(r).getByText("Abertos agora", { exact: true }),
          "Os cartões: abertos agora, abertos com prazo estourado, concluídos no período e processos com volta."
        );
        await r.apontar(main(r).getByRole("heading", { name: "SLA por tipo" }), "Em SLA por tipo, os dias úteis consumidos contra o previsto de cada tipo.");
        const voltaram = main(r).getByRole("heading", { name: "Processos que mais voltaram" });
        await r.rolarAte(voltaram);
        await r.apontar(voltaram, "Em Processos que mais voltaram, os que mais tiveram reapresentação.");
        await r.apontar(main(r).getByRole("heading", { name: "Produtividade por responsável" }), "Produtividade por responsável: concluídos e carteira aberta de cada pessoa.");
        const taxas = main(r).getByRole("heading", { name: /Custo em taxas/ });
        await r.rolarAte(taxas);
        await r.apontar(taxas, "E Custo em taxas por processo: o total gasto, e quanto foi de reapresentação.");
        await r.soltar();
        await encerramento(r, "Os prazos contam dias úteis, sem os feriados do escritório.");
      },
    },
  ];
}

// ─── DP ─────────────────────────────────────────────────────────────────────

function videosDoDp(): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "35-colaboradores",
      titulo: "Colaboradores: admissões, férias e desligamentos",
      resumo: "O ciclo de vida do colaborador.",
      chave: "dp_colaboradores",
      logado: true,
      async executar(r) {
        await r.ir("/colaboradores");
        await r.cartaz(SELO, "Colaboradores", "Admissões, férias e desligamentos");
        await r.apontar(
          main(r).getByRole("link", { name: /^Admissões/ }),
          "Os cartões levam às listas: admissões em andamento, rescisões em processo e férias em aberto."
        );
        await r.clicar(main(r).getByRole("link", { name: /^Admissões/ }), "Clique em Admissões.");
        await r.esperarTela("/admissoes");
        await r.apontar(
          main(r).getByRole("button", { name: "Filtrar a coluna exames" }),
          "Confira Exames e Documentos de admissão. No funil de Exames, Exames pendentes mostra quem depende da clínica."
        );
        await r.clicar(main(r).getByRole("link", { name: "Abrir" }).first(), "Clique em Abrir para ir à ficha.");
        await r.page.waitForURL(/\/pessoas\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(
          main(r).getByRole("button", { name: "Gerar link de admissão" }),
          "Em Admissão digital, gere o link e use Copiar para mandar ao colaborador: ele preenche os próprios dados."
        );
        await r.legenda("Quando os dados chegarem, confira tudo e clique em Concluir admissão: o colaborador passa a Ativo.");
        await r.ir("/colaboradores");
        await r.clicar(main(r).getByRole("link", { name: /^Férias/ }), "No cartão Férias, primeiro as vencidas, depois as a vencer e programadas.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.clicar(main(r).getByRole("link", { name: "Abrir" }).first(), "Abrir leva à tela de férias da ficha.");
        await r.page.waitForURL(/\/ferias/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        const programar = main(r).getByRole("button", { name: "Programar férias" });
        await r.rolarAte(programar);
        await r.apontar(
          programar,
          "Para um período novo, preencha o aquisitivo e, se souber, o concessivo, os dias, o abono e o parcelamento. Depois, Programar férias."
        );
        const atualizar = main(r).getByRole("button", { name: "Atualizar" }).first();
        if (await atualizar.count()) await r.apontar(atualizar, "Para andar com um período já lançado, escolha a nova situação, as datas e clique em Atualizar.");
        await r.ir("/colaboradores");
        await r.clicar(main(r).getByRole("link", { name: /^Desligamentos/ }), "E em Desligamentos, os desligamentos em andamento.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.clicar(main(r).getByRole("link", { name: "Abrir" }).first());
        await r.page.waitForURL(/\/desligamento/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(
          main(r).getByRole("heading", { level: 1 }),
          "O desligamento se registra na ficha: Dados trabalhistas → Desligamento, com o tipo e o motivo."
        );
        const trct = main(r).getByRole("link", { name: /Conferência do TRCT/ }).or(main(r).getByRole("button", { name: /Conferência do TRCT/ })).first();
        if (await trct.count()) await r.apontar(trct, "A cada passo, a nova situação e Atualizar. Conferência do TRCT confere a rescisão item a item.");
        await r.soltar();
        await encerramento(r, "Candidato contratado no Recrutamento entra direto em Admissões.");
      },
    },
    {
      arquivo: "36-afastamentos",
      titulo: "Afastamentos",
      resumo: "Atestados, licenças e afastamentos em aberto.",
      chave: "dp_afastamentos",
      logado: true,
      async executar(r) {
        await r.ir("/afastamentos");
        await r.cartaz(SELO, "Afastamentos", "Atestados, licenças e afastamentos em aberto");
        await r.apontar(main(r).getByRole("table").first(), "A lista mostra os afastamentos e atestados ativos, com o tipo, a situação e o retorno previsto.");
        await r.clicar(linha(r, "Fernanda Alves").getByRole("link", { name: "Abrir" }), "Clique em Abrir para ir à tela de afastamentos da ficha.");
        await r.page.waitForURL(/\/afastamentos$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await selecionar(
          r,
          main(r).getByRole("combobox", { name: "Situação" }).first(),
          /Conclu/,
          "Para acompanhar, escolha a nova situação e ajuste o retorno. Concluído: o colaborador volta a ativo."
        );
        await r.clicar(main(r).getByRole("button", { name: "Atualizar" }).first(), "Clique em Atualizar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await selecionar(r, main(r).getByRole("combobox", { name: /^Tipo/ }), /Atestado parcial/, "Para registrar um novo, escolha o Tipo…");
        await digitarData(r, main(r).getByRole("combobox", { name: /^Data de início/ }), daquiA(0), "…a Data de início e, se souber, o retorno e os dias perdidos.");
        await r.clicar(main(r).getByRole("button", { name: "Registrar ausência" }), "Clique em Registrar ausência.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.soltar();
        await encerramento(r, "Registro novo entra como Lançado e aparece na lista quando a situação muda.");
      },
    },
    {
      arquivo: "37-horas-extras",
      titulo: "Horas extras",
      resumo: "Lançar e aprovar horas extras.",
      chave: "dp_horas_extras",
      logado: true,
      async executar(r) {
        await r.ir("/horas-extras");
        await r.cartaz(SELO, "Horas extras", "Lançar e aprovar horas extras");
        await r.apontar(main(r).getByRole("table").first(), "A lista reúne os lançamentos de todos os colaboradores que aguardam aprovação.");
        await r.apontar(main(r).getByRole("button", { name: "Filtrar a coluna colaborador" }), "Os filtros das colunas Colaborador, Data e Tipo do dia ajudam a achar um lançamento.");
        await r.clicar(linha(r, "Rodrigo Pereira").getByRole("link", { name: "Abrir" }), "Clique em Abrir na linha.");
        await r.page.waitForURL(/\/horas-extras$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await selecionar(r, main(r).getByRole("combobox", { name: "Situação" }).first(), /^Aprovad/, "Escolha Aprovado ou Reprovado…");
        await r.clicar(main(r).getByRole("button", { name: "Atualizar" }).first(), "…e clique em Atualizar. Depois da folha, a situação é Enviado para folha.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await digitarData(r, main(r).getByRole("combobox", { name: /^Data/ }).last(), daquiA(-1), "Para lançar, informe a Data e o Tipo de dia…");
        await r.digitar(main(r).getByRole("spinbutton", { name: "Horas trabalhadas" }), "10", "…as horas devidas, trabalhadas e extras, e o adicional…");
        await r.digitar(main(r).getByRole("spinbutton", { name: "Horas extras" }), "2");
        await r.digitar(main(r).getByRole("textbox", { name: "Justificativa" }), "Inventário de fim de mês.", "…e a Justificativa.");
        await r.clicar(main(r).getByRole("button", { name: "Lançar horas" }), "Clique em Lançar horas: o lançamento entra pendente de aprovação.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.soltar();
        await encerramento(r, "Só o gestor do setor e os administradores lançam e aprovam horas extras.");
      },
    },
    {
      arquivo: "38-escalas",
      titulo: "Escalas",
      resumo: "A escala de trabalho dos próximos 30 dias.",
      chave: "dp_escalas",
      logado: true,
      async executar(r) {
        await r.ir("/escalas");
        await r.cartaz(SELO, "Escalas", "A escala de trabalho dos próximos 30 dias");
        await r.legenda("A escala é montada na ficha de cada colaborador, e aparece aqui nos próximos 30 dias.");
        await r.ir("/colaboradores-clientes");
        await r.clicar(main(r).getByRole("link", { name: /Rodrigo Pereira/ }).first(), "Abra a ficha do colaborador…");
        await r.page.waitForURL(/\/pessoas\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.clicar(main(r).getByRole("tab", { name: "Vínculo" }), "…vá à aba Vínculo…");
        await r.pausa(800);
        await r.clicar(
          main(r).getByRole("link", { name: /Escala de trabalho/ }).or(main(r).getByRole("button", { name: /Escala de trabalho/ })).first(),
          "…e clique em Escala de trabalho."
        );
        await r.page.waitForURL(/\/escala/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await digitarData(r, main(r).getByRole("combobox", { name: /^Data/ }).last(), daquiA(2), "Informe a Data e escolha o Turno.");
        const folga = main(r).getByRole("checkbox", { name: /Folga/ });
        if (await folga.count()) await r.apontar(folga, "Marque Folga ou Feriado, se for o caso.");
        await r.clicar(main(r).getByRole("button", { name: "Adicionar à escala" }), "Clique em Adicionar à escala.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.ir("/escalas");
        await r.apontar(main(r).getByRole("table").first(), "Pronto: o dia entra em Escalas. Os filtros das colunas recortam por data, colaborador, turno e situação.");
        const abrir = main(r).getByRole("link", { name: "Abrir" }).first();
        if (await abrir.count()) await r.apontar(abrir, "Abrir leva à escala da ficha, para mudar a situação: confirmada, alterada, cancelada ou realizada.");
        await r.soltar();
        await encerramento(r, "O Turno lista os turnos da empresa do colaborador. Dia cancelado sai da lista.");
      },
    },
    {
      arquivo: "39-treinamentos",
      titulo: "Treinamentos",
      resumo: "O catálogo de treinamentos, as turmas e os participantes.",
      chave: "dp_treinamentos",
      logado: true,
      async executar(r) {
        await r.ir("/treinamentos");
        await r.cartaz(SELO, "Treinamentos", "O catálogo de treinamentos, as turmas e os participantes");
        await r.clicar(main(r).getByRole("link", { name: "Novo treinamento" }).first(), "Clique em Novo treinamento.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(600);
        await r.digitar(main(r).getByRole("textbox", { name: /^Nome do treinamento/ }), "NR-35 — Trabalho em altura", "Preencha o Nome do treinamento…");
        const carga = main(r).getByRole("spinbutton", { name: /Carga horária/ });
        if (await carga.count()) await r.digitar(carga, "8", "…e, se quiser, a descrição, a carga horária e a validade em meses.");
        const validade = main(r).getByRole("spinbutton", { name: /Validade/ });
        if (await validade.count()) await r.digitar(validade, "24");
        await r.clicar(main(r).getByRole("button", { name: "Salvar" }), "Clique em Salvar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        if (!/\/treinamentos\/[^/]+$/.test(new URL(r.page.url()).pathname) || r.page.url().endsWith("/novo")) {
          await r.ir("/treinamentos");
          await r.clicar(main(r).getByRole("link", { name: "Abrir" }).first(), "Na lista, Abrir no treinamento.");
          await r.page.waitForLoadState("networkidle").catch(() => {});
        }
        await digitarData(r, main(r).getByRole("combobox", { name: /^Data/ }).first(), daquiA(10), "No quadro Turmas, em Nova turma, informe a Data e, se quiser, o Turno e o Instrutor.");
        await r.clicar(main(r).getByRole("button", { name: "Criar turma" }), "Clique em Criar turma: a turma abre em seguida.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await main(r).getByRole("button", { name: "Adicionar participante" }).waitFor({ timeout: 20000 });
        await r.pausa(800);
        await selecionar(r, main(r).getByRole("combobox", { name: /^Colaborador/ }), /Rodrigo Pereira/, "Escolha o Colaborador…");
        await r.clicar(main(r).getByRole("button", { name: "Adicionar participante" }), "…e clique em Adicionar participante.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        const situacao = main(r).getByRole("combobox").filter({ hasText: /Convocado/ }).first();
        if (await situacao.count()) {
          await selecionar(r, situacao, /Realizado/, "Para registrar presença ou resultado, escolha a situação: convocado, realizado, ausente, concluído…");
          const atualizar = main(r).getByRole("button", { name: "Atualizar" }).first();
          if (await atualizar.count()) await r.clicar(atualizar, "…e clique em Atualizar.");
          await r.page.waitForLoadState("networkidle").catch(() => {});
          await r.pausa(800);
        }
        await r.soltar();
        await encerramento(r, "Excluir uma turma leva junto os participantes dela.");
      },
    },
    {
      arquivo: "40-avaliacoes-de-desempenho",
      titulo: "Avaliações de desempenho",
      resumo: "Ciclos de avaliação, notas por competência e plano de desenvolvimento.",
      chave: "dp_avaliacoes",
      logado: true,
      async executar(r) {
        await r.ir("/avaliacoes");
        await r.cartaz(SELO, "Avaliações de desempenho", "Ciclos, notas por competência e plano de desenvolvimento");
        await r.clicar(main(r).getByRole("button", { name: "Novo ciclo" }), "Para abrir um ciclo, clique em Novo ciclo.");
        const novoCiclo = dialogo(r, "Novo ciclo de avaliação");
        await r.digitar(novoCiclo.getByRole("textbox", { name: /^Nome do ciclo/ }), "Avaliação 2026.2", "Preencha o Nome do ciclo…");
        await digitarData(r, novoCiclo.getByRole("combobox", { name: /^Início/ }), daquiA(0), "…o Início e, se já souber, o Fim.");
        await r.clicar(novoCiclo.getByRole("button", { name: "Criar ciclo" }), "Clique em Criar ciclo.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await main(r).getByRole("button", { name: "Avaliar colaborador" }).waitFor({ timeout: 20000 });
        await r.apontar(main(r).getByRole("heading", { level: 1 }), "O ciclo abre em seguida. Na lista, ele aparece como Aberto.");
        await r.escolher(
          main(r).getByRole("button", { name: /^Colaborador/ }).or(main(r).getByRole("combobox", { name: /^Colaborador/ })).first(),
          "Rodrigo",
          r.page.getByRole("option", { name: /Rodrigo Pereira/ }).first(),
          "Busque o colaborador…"
        );
        await r.clicar(main(r).getByRole("button", { name: "Avaliar colaborador" }), "…e clique em Avaliar colaborador.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        const notas = main(r).getByRole("spinbutton");
        const n = Math.min(await notas.count(), 4);
        for (let i = 0; i < n; i++) {
          await r.digitar(notas.nth(i), String([8, 9, 7, 9][i]), i === 0 ? "Em Notas por Competência, dê de 0 a 10 a cada competência." : undefined);
        }
        const plano = main(r).getByRole("textbox", { name: /Plano de desenvolvimento/ });
        if (await plano.count()) await r.digitar(plano, "Curso de Excel avançado no próximo trimestre.", "Em Desenvolvimento: observações, plano e prazo de melhoria.");
        await r.clicar(main(r).getByRole("button", { name: "Salvar avaliação" }), "Clique em Salvar avaliação: a média aparece na tabela do ciclo.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        const encerrar = main(r).getByRole("button", { name: "Encerrar ciclo" });
        if (await encerrar.count()) await r.apontar(encerrar, "Com todas feitas, Encerrar ciclo. Encerrado, ele não aceita novas avaliações.");
        await r.soltar();
        await encerramento(r, "As competências vêm de Admin → Competências.");
      },
    },
  ];
}

// ─── Recrutamento ───────────────────────────────────────────────────────────

function videosDoRecrutamento(): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "41-vagas",
      titulo: "Vagas e funil de recrutamento",
      resumo: "Criar a vaga e mover os candidatos pelo funil.",
      chave: "recrutamento_vagas",
      logado: true,
      async executar(r) {
        await r.ir("/vagas");
        await r.cartaz(SELO, "Vagas", "Criar a vaga e mover os candidatos pelo funil");
        await r.clicar(main(r).getByRole("link", { name: "Nova vaga" }), "Para criar uma vaga, clique em Nova vaga.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.digitar(main(r).getByRole("textbox", { name: /^Título da vaga/ }), "Assistente fiscal", "Em Dados da vaga, preencha o Título, o Setor e a Empresa…");
        await r.apontar(
          main(r).getByText(/Publicar no portal de vagas/).first(),
          "Para divulgar no portal público, marque Publicar no portal de vagas e preencha a descrição pública, a modalidade e as datas."
        );
        await r.ir("/vagas");
        await r.clicar(main(r).getByRole("link", { name: "Auxiliar de produção" }), "Abra uma vaga para ver o funil.");
        await r.page.waitForURL(/\/vagas\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        const funil = main(r).getByRole("heading", { name: /^Funil de recrutamento/ });
        await r.rolarAte(funil);
        await r.apontar(funil, "No Funil de recrutamento, os candidatos de cada etapa: triagem, entrevista, teste, proposta e contratado.");
        await selecionar(
          r,
          main(r).getByRole("combobox", { name: "Etapa de Gabriel Santos" }),
          /Entrevista/,
          "Para mover, arraste o cartão — ou escolha a etapa na lista do próprio cartão."
        );
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.clicar(main(r).getByRole("button", { name: "Mais ações para Larissa Oliveira" }), "Para tirar alguém do funil, o botão ⋯ do cartão: Reprovar ou Desistiu.");
        await r.pausa(1200);
        await r.page.keyboard.press("Escape");
        await r.apontar(
          main(r).getByRole("link", { name: "Avaliar" }).first(),
          "Avaliar abre o parecer de entrevista: notas, recomendação e observações."
        );
        const triagem = main(r).getByRole("heading", { name: "Triagem de currículos" });
        await r.rolarAte(triagem);
        await r.apontar(
          triagem,
          "Em Triagem de currículos, escreva os requisitos, obrigatórios ou desejáveis, com o peso. A IA dá nota aos currículos."
        );
        await r.legenda("A nota da triagem só ordena os candidatos — nunca reprova ninguém. Nome, idade, cidade e foto não chegam à IA.");
        await r.soltar();
        await encerramento(r, "Contratado vira colaborador com admissão em andamento, no DP.");
      },
    },
    {
      arquivo: "42-candidatos",
      titulo: "Candidatos",
      resumo: "O banco de talentos do escritório.",
      chave: "recrutamento_candidatos",
      logado: true,
      async executar(r) {
        await r.ir("/candidatos");
        await r.cartaz(SELO, "Candidatos", "O banco de talentos do escritório");
        await r.digitar(main(r).getByRole("textbox", { name: /Buscar por nome/ }), "Isabela", "Busque pelo nome, e-mail ou CPF.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        await main(r).getByRole("textbox", { name: /Buscar por nome/ }).fill("");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByRole("button", { name: "Filtrar a coluna tags" }), "O filtro da coluna Tags acha quem tem uma habilidade.");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "A lista mostra os ativos. Para ver os inativos, Filtros → Situação.");
        await r.clicar(main(r).getByRole("link", { name: "Isabela Freitas" }), "Clique no nome para abrir a ficha.");
        await r.page.waitForURL(/\/candidatos\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        const tags = main(r).getByRole("heading", { name: /Tags/ }).first();
        if (await tags.count()) await r.apontar(tags, "Em Tags / Habilidades, marque o que descreve a pessoa: fica fácil de achar depois.");
        const analisar = main(r).getByRole("button", { name: /Analisar currículo/ });
        if (await analisar.count()) await r.apontar(analisar, "Em Triagem de currículo (IA), Analisar currículo lê o PDF e resume o perfil.");
        const teste = main(r).getByRole("button", { name: /Enviar teste/ });
        if (await teste.count()) await r.apontar(teste, "Em Teste, escolha o tipo e Enviar teste.");
        await r.ir("/candidatos");
        await r.clicar(main(r).getByRole("checkbox", { name: "Selecionar Felipe Carvalho" }), "Para inativar em massa, marque os candidatos…");
        await r.apontar(main(r).getByRole("button", { name: "Inativar" }), "…e clique em Inativar.");
        await r.clicar(main(r).getByRole("checkbox", { name: "Selecionar Felipe Carvalho" }));
        await r.apontar(main(r).getByRole("link", { name: "Novo candidato" }), "Para cadastrar, Novo candidato: nome, contato, endereço e Salvar.");
        await r.soltar();
        await encerramento(r, "A análise do currículo precisa de um PDF na ficha.");
      },
    },
    {
      arquivo: "43-colaboradores-de-clientes",
      titulo: "Colaboradores de clientes",
      resumo: "Quem trabalha nas empresas clientes.",
      chave: "recrutamento_colaboradores_clientes",
      logado: true,
      async executar(r) {
        await r.ir("/colaboradores-clientes");
        await r.cartaz(SELO, "Colaboradores de clientes", "Quem trabalha nas empresas clientes");
        await r.legenda("É este cadastro que alimenta a admissão, as férias e a rescisão no DP.");
        await r.apontar(main(r).getByRole("textbox", { name: /Buscar por nome/ }), "Busque pelo nome…");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "…e use Filtros para a Empresa e a Situação.");
        await r.clicar(main(r).getByRole("link", { name: /Aline Fernandes/ }).first(), "Clique no nome para abrir a ficha.");
        await r.page.waitForURL(/\/pessoas\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.apontar(main(r).getByRole("tablist"), "Na ficha ficam as férias, os afastamentos, o desligamento e os outros registros do DP.");
        await r.ir("/colaboradores-clientes");
        await r.clicar(main(r).getByRole("link", { name: "Novo colaborador" }), "Para cadastrar, clique em Novo colaborador.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(
          main(r).getByRole("tablist").first(),
          "Preencha cada passo e Avançar →. Em Empresa vinculada, a empresa, o cargo e o departamento. Na revisão, Confirmar e salvar."
        );
        await r.soltar();
        await encerramento(r, "Os funcionários do próprio escritório ficam em Pessoas.");
      },
    },
    {
      arquivo: "44-testes",
      titulo: "Testes de candidatos",
      resumo: "DISC e múltipla escolha.",
      chave: "recrutamento_testes",
      logado: true,
      async executar(r) {
        await r.ir("/testes");
        await r.cartaz(SELO, "Testes", "Perfil comportamental (DISC) e múltipla escolha");
        await selecionar(r, main(r).getByRole("combobox", { name: /^Candidato/ }), "Isabela Freitas", "No topo, escolha o Candidato…");
        await r.apontar(main(r).getByRole("combobox", { name: "Tipo de teste" }), "…o Tipo de teste: DISC ou um modelo de múltipla escolha…");
        await r.clicar(main(r).getByRole("button", { name: "Enviar teste" }), "…e clique em Enviar teste. Com e-mail cadastrado, o link vai por e-mail.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.apontar(main(r).getByRole("link", { name: "Abrir" }).first(), "Abrir mostra o link, que vale por 7 dias, e o resultado quando chegar.");
        await r.apontarGrupo(
          main(r).getByRole("link", { name: /^Aguardando resposta/ }),
          main(r).getByRole("link", { name: /^Respondidos/ }),
          "Os cartões separam os que aguardam resposta e os respondidos. Na coluna Resultado, o perfil ou o percentual."
        );
        await r.clicar(main(r).getByRole("link", { name: "Modelos de teste" }), "Para criar um teste de múltipla escolha, Modelos de teste…");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        const novo = main(r).getByRole("link", { name: /Novo modelo/ }).or(main(r).getByRole("button", { name: /Novo modelo/ })).first();
        await r.apontar(novo, "…+ Novo modelo: nome, perguntas, alternativas e a correta. Depois, Criar modelo.");
        await r.soltar();
        await encerramento(r, "Modelo já usado não é excluído, só arquivado.");
      },
    },
  ];
}

// ─── Fiscal ─────────────────────────────────────────────────────────────────

function videosDoFiscal(): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "45-documentos-fiscais",
      titulo: "Documentos fiscais",
      resumo: "O acervo das notas e o que vira conta a pagar ou a receber.",
      chave: "fiscal_documentos",
      logado: true,
      async executar(r) {
        await r.ir("/documentos-fiscais");
        await r.cartaz(SELO, "Documentos fiscais", "O acervo das notas e o que vira conta a pagar ou a receber");
        await r.apontar(
          main(r).getByRole("link", { name: /^Pendentes de decisão/ }),
          "Os cartões separam os pendentes de decisão, os lançados e os ignorados."
        );
        await r.apontar(main(r).getByRole("searchbox", { name: "Buscar documento" }), "Busque pelo número, pela contraparte ou pela chave de acesso.");
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Em Filtros: empresa, competência, tipo ou destino.");
        await r.apontar(main(r).getByRole("link", { name: "Entrada de XML" }), "Para trazer notas, Entrada de XML: arraste os arquivos e clique em Importar.");
        await r.clicar(main(r).getByRole("link", { name: "9921/1" }), "Clique no número do documento para abrir a ficha.");
        await r.page.waitForURL(/\/documentos-fiscais\/[^/]+$/, { timeout: 20000 });
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        const lancamento = main(r).getByRole("heading", { name: /Lançamento/ }).first();
        await r.rolarAte(lancamento);
        await r.apontar(lancamento, "No quadro Lançamento, decida se a nota vira conta.");
        await selecionar(r, main(r).getByRole("combobox", { name: /^Categoria/ }).first(), "Combustível", "Escolha a Categoria — obrigatória na conta a pagar.");
        await r.apontar(
          main(r).getByRole("combobox", { name: /^Vencimento/ }).first(),
          "Confira o Vencimento: ele vem presumido em 30 dias, porque a nota não traz a data da duplicata."
        );
        await r.clicar(main(r).getByRole("button", { name: "Lançar", exact: true }), "Clique em Lançar: a conta nasce a conferir em Contas a pagar.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        const estornar = main(r).getByRole("button", { name: /Estornar lançamento/ });
        if (await estornar.count()) await r.apontar(estornar, "Para desfazer, Estornar lançamento.");
        await r.soltar();
        await r.legenda("Nota que não entra no financeiro: no quadro Destino, Ignorado, com o motivo.");
        await encerramento(r, "CT-e não entra no acervo: use Consultar CT-e para a consulta ao vivo.");
      },
    },
  ];
}

// ─── Gestão ─────────────────────────────────────────────────────────────────

function videosDaGestao(): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "46-painel-de-gestao",
      titulo: "Painel de Gestão",
      resumo: "Todos os setores num lugar: o que anda, o que parou e quem está com o quê.",
      chave: "gestao_painel",
      logado: true,
      async executar(r) {
        await r.ir("/gestao");
        await r.cartaz(SELO, "Painel de Gestão", "O que anda, o que parou e quem está com o quê");
        await r.apontar(
          main(r).getByText(/^Iniciados/).first(),
          "Os totais: iniciados, em andamento, paralisados, concluídos em 30 dias e sem responsável."
        );
        await r.apontar(main(r).getByRole("button", { name: /^Filtros/ }), "Para olhar um setor só, Filtros → Setor.");
        const atencao = main(r).getByRole("region", { name: /^Precisam de atenção/ });
        await r.apontar(atencao.getByRole("heading"), "Em Precisam de atenção, os itens parados ou com prazo vencendo.");
        await r.apontar(
          atencao.getByRole("combobox", { name: "Responsável" }).first(),
          "No seletor à direita do item, troque o responsável."
        );
        await r.clicar(main(r).getByRole("link", { name: "Alertas" }), "Na aba Alertas…");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        const limites = main(r).getByRole("heading", { name: /Limites por setor/ });
        if (await limites.count()) {
          await r.rolarAte(limites);
          await r.apontar(limites, "…em Limites por setor, os dias para considerar parado e o aviso de prazo. Salvar na linha do setor.");
        }
        await r.clicar(main(r).getByRole("link", { name: "Coordenadores" }), "Em Coordenadores, a carga de cada pessoa: em aberto, parados e com prazo vencido.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.clicar(main(r).getByRole("link", { name: "Horas de operação" }), "E em Horas de operação, as horas por setor e por pessoa.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        const exportar = main(r).getByRole("link", { name: /Exportar CSV/ }).or(main(r).getByRole("button", { name: /Exportar CSV/ })).first();
        if (await exportar.count()) await r.apontar(exportar, "Exportar CSV baixa os apontamentos.");
        await r.soltar();
        await encerramento(r, "As horas entram pelo cronômetro ou pelo lançamento manual, no card e no processo.");
      },
    },
    {
      arquivo: "47-cargos-e-salarios",
      titulo: "Cargos e Salários",
      resumo: "A matriz de cargos, as faixas e os pontos de atenção.",
      chave: "gestao_cargos_salarios",
      logado: true,
      async executar(r) {
        await r.ir("/cargos-salarios");
        await r.cartaz(SELO, "Cargos e Salários", "A matriz de cargos, as faixas e os pontos de atenção");
        const pontos = main(r).getByText(/Pontos de atenção/).first();
        if (await pontos.count()) await r.apontar(pontos, "No topo, os pontos de atenção da estrutura: degraus invertidos, nomes diferentes, cargos sem família.");
        const familia = main(r).getByRole("heading", { level: 2 }).first();
        await r.rolarAte(familia);
        await r.apontar(familia, "Cada bloco é uma família de cargos, com quantos cargos e colaboradores tem.");
        await r.apontar(main(r).getByRole("table").first(), "Em cada linha: nível, cargo, empresa, área, pessoas e a faixa salarial.");
        await r.apontar(main(r).getByRole("button", { name: "Filtrar a coluna nível" }).first(), "Os funis de Nível, Empresa e Área filtram a família.");
        await r.clicar(main(r).getByRole("table").first().getByRole("link").first(), "Clique no nome do cargo para abrir a ficha.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1000);
        await r.legenda("Na ficha, preencha Família de cargos, Nível de senioridade e a faixa: inicial, intermediária e final. Depois, Salvar.");
        await r.soltar();
        await encerramento(r, "Cargo novo se cadastra na ficha da empresa: RH & Operação → Cargos → + Novo Cargo.");
      },
    },
    {
      arquivo: "48-indicadores-de-rh",
      titulo: "Indicadores de RH",
      resumo: "Headcount, turnover, férias, vagas e custo de folha.",
      chave: "gestao_indicadores_rh",
      logado: true,
      async executar(r) {
        await r.ir("/indicadores-rh");
        await r.cartaz(SELO, "Indicadores de RH", "Headcount, turnover, férias, vagas e custo de folha");
        await r.apontar(main(r).getByText("Headcount", { exact: true }), "Cada cartão é um número, com a linha que diz o que ele conta.");
        await r.apontar(main(r).getByText("Férias vencidas", { exact: true }), "Férias vencidas fica destacado quando há alguma: é o número que pede ação.");
        const relatorios = main(r).getByRole("heading", { name: "Relatórios" });
        await r.rolarAte(relatorios);
        await r.apontar(relatorios, "Em Relatórios: férias, treinamentos, pendências e distorções salariais — a lista de quem precisa de ação.");
        await r.topo();
        await r.apontarGrupo(
          main(r).getByRole("link", { name: "Exportar PDF" }),
          main(r).getByRole("link", { name: "Exportar Excel" }),
          "Exportar PDF para ler ou imprimir; Exportar Excel para trabalhar os números."
        );
        await r.soltar();
        await encerramento(r, "Os números vêm do que é lançado no DP e no Recrutamento: corrija na origem.");
      },
    },
    {
      arquivo: "49-valora",
      titulo: "Valora",
      resumo: "O honorário pelo custo real de atender.",
      chave: "gestao_valora",
      logado: true,
      async executar(r) {
        await r.ir("/valora");
        await r.cartaz(SELO, "Valora", "O honorário pelo custo real de atender");
        await r.apontar(
          main(r).getByText(/^Em aberto/).first(),
          "Os cartões: propostas em aberto, ganhas, taxa de fechamento e oferecido sobre o alvo."
        );
        await r.clicar(main(r).getByRole("link", { name: "Nova simulação" }), "Para precificar, Nova simulação.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(900);
        const nome = main(r).getByRole("textbox", { name: /^Nome/ }).first();
        await r.digitar(nome, "Padaria Trigo Bom", "Em Cliente, o nome, o regime e os setores que vão atender.");
        await r.legenda("Volumes, operação e situações que dão mais trabalho: as respostas do cliente.");
        const honorario = main(r).getByText(/Honorário mensal/).first();
        if (await honorario.count()) await r.apontar(honorario, "Ao lado, o honorário mensal: o alvo, o piso, a tabela, o custo e as horas por mês.");
        await r.ir("/valora");
        await r.clicar(main(r).getByRole("button", { name: "Registrar retorno" }).first(), "Na lista, Registrar retorno: ganha, perdida, o preço do concorrente e o motivo.");
        await r.pausa(1200);
        await r.page.keyboard.press("Escape");
        await r.apontar(main(r).getByRole("link", { name: "Parâmetros" }), "Em Parâmetros: o custo de cada setor e as margens. Só gestor e administrador.");
        await r.soltar();
        await encerramento(r, "O alvo da proposta é a foto do dia em que ela foi salva.");
      },
    },
  ];
}

export function videosDaEquipe(opcoes: { pastaDeApoio: string }): DefinicaoDeVideo[] {
  return [
    ...videosDoBpo(opcoes.pastaDeApoio),
    ...videosGerais(opcoes.pastaDeApoio),
    ...videosDoSocietario(),
    ...videosDoDp(),
    ...videosDoRecrutamento(),
    ...videosDoFiscal(),
    ...videosDaGestao(),
  ];
}
