# Critério: formulário inline vs. página `/novo`

> **Atualizado em 28/10/2026.** As decisões de 08/10 (5A) e 15/10 (respondendo
> ao #208) mudaram a regra abaixo:
>
> - **Janela ou painel ao lado** é o padrão para criar e editar cadastros: o
>   "+ Novo …" fica no cabeçalho, e o formulário abre sobre a lista, com o
>   endereço `?novo=1` / `?editar=<id>` (`PainelDeCadastro`). Os endereços
>   antigos `/novo` e `/[id]/editar` redirecionam. Vale para Usuários,
>   Setores, Tags, Campos, Assuntos, Plano de contas e, desde o lote 5
>   (28/10), Treinamentos, Departamentos, Benefícios e Turnos — inclusive os
>   escopados a uma empresa.
> - **Página própria** fica só para o que não cabe num painel: Empresa e
>   Pessoa (muitos campos, várias etapas).
> - O **formulário inline** acima da lista saiu (P19, 15/10): o que era
>   inline virou janela pelo "+ Novo" do cabeçalho.
>
> O texto abaixo é o registro de antes, mantido para contexto.

> Documenta um padrão que já existia implicitamente no código (levantado ao
> revisar o app inteiro) — não é uma mudança de comportamento, é o registro
> da regra pra próximas telas seguirem o mesmo critério.

## Regra

**Formulário inline** (`Add*Form` renderizado direto na página de listagem,
acima da lista) quando:
- O cadastro tem poucos campos (1–4);
- Não existe fluxo de edição separado — a linha da lista já permite editar/excluir direto;
- A entidade é de escopo tenant-wide, gerida por poucos admins (ex: Competências, Feriados, Planos, Obrigações Recorrentes, Ciclos de Avaliação).

Exemplos no código: `AddCompetenciaForm`, `AddFeriadoForm`, `AddObrigacaoForm`,
`NovoPlanoForm`, `AddCicloForm`.

**Página `/novo` separada** quando:
- O cadastro tem muitos campos ou é multi-step (Empresa, Pessoa);
- Existe fluxo de edição espelhado em `/[id]/editar` reaproveitando o mesmo
  formulário (ver `EmpresaForm`/`PessoaForm`, usados em criar E editar);
- A entidade é escopada a uma empresa específica (Cargo, Turno, Benefício,
  Departamento, Documento para Cliente — todas vivem em
  `/empresas/[id]/<recurso>/novo`).

## Por que isso importa

Misturar os dois padrões pra mesma entidade (ex: um form inline pesado numa
listagem que já cresceu) deixa a tela poluída; forçar página separada pra um
cadastro de 1 campo é fricção desnecessária. A tabela acima é a referência
pra decidir ao criar uma tela nova.
