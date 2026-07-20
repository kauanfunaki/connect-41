# Critério: formulário inline vs. página `/novo`

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
