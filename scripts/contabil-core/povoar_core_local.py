"""Dados INVENTADOS no Contábil Core local, para ensaiar a carga (Fase 5, 10/11/2026).

Usa os serviços do próprio original (importar OFX, NEO, classificação manual, cancelamento,
reclassificação, composição, desfazer importação e exportação para o Domínio), para os dados
terem a forma que a produção tem. Grava também o TXT do Domínio de cada empresa e mês numa pasta
LOCAL, que é o gabarito da conferência depois da carga.

Recusa rodar fora de 127.0.0.1/localhost. Nenhum dado real: empresas, pessoas e CNPJs inventados.

Uso, a partir da raiz do contabil-core, com as dependências dele e as migrations aplicadas:
    DATABASE_URL=postgresql+asyncpg://contabil:contabil@127.0.0.1:5435/contabil_dev \\
    SECRET_KEY=... python scripts/contabil-core/povoar_core_local.py <pasta dos TXT do Domínio>
"""
import asyncio
import os
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse

url = os.environ.get("DATABASE_URL", "")
if urlparse(url.replace("+asyncpg", "")).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("Só banco local.")
os.environ.setdefault("ENVIRONMENT", "development")
sys.path.insert(0, os.getcwd())

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from src.db.models import (  # noqa: E402
    AgenciaBancaria, Contraparte, Empresa, PlanoConta, PlanoContaFaixaTipo, RegistroContabil, Regra,
    Tenant, Transacao, Usuario,
)
from src.domain.exportacao.service import ExportacaoService  # noqa: E402
from src.domain.extrato.importacoes import abrir_importacao, cancelar_importacao, registrar_resultado  # noqa: E402
from src.domain.extrato.service import ExtratoService  # noqa: E402
from src.domain.neo.cancelamento import cancelar_lancamento, reclassificar_lancamento  # noqa: E402
from src.domain.neo.composicao import alterar_composicao  # noqa: E402
from src.domain.neo.engine import NeoEngine  # noqa: E402
from src.schemas.contabil import ExportJobCreate  # noqa: E402

saida = Path(sys.argv[1])
saida.mkdir(parents=True, exist_ok=True)


def cnpj(base12: str) -> str:
    """CNPJ válido a partir de 12 dígitos inventados."""
    d = [int(c) for c in base12]
    for pesos in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        r = sum(x * p for x, p in zip(d, pesos)) % 11
        d.append(0 if r < 2 else 11 - r)
    s = "".join(map(str, d))
    return f"{s[:2]}.{s[2:5]}.{s[5:8]}/{s[8:12]}-{s[12:]}"


def ofx(conta: str, linhas: list[tuple[str, str, str, str]], saldo: str, data_saldo: str) -> str:
    corpo = "".join(
        f"<STMTTRN><TRNTYPE>{'CREDIT' if not v.startswith('-') else 'DEBIT'}<DTPOSTED>{d}<TRNAMT>{v}<FITID>{f}<MEMO>{m}</STMTTRN>\n"
        for d, v, f, m in linhas
    )
    return (
        "OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>\n"
        f"<BANKACCTFROM><BANKID>0756<BRANCHID>1234<ACCTID>{conta}</BANKACCTFROM>\n<BANKTRANLIST>\n{corpo}</BANKTRANLIST>\n"
        f"<LEDGERBAL><BALAMT>{saldo}<DTASOF>{data_saldo}</LEDGERBAL>\n</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
    )


async def main():
    engine = create_async_engine(url, echo=False)
    fabrica = async_sessionmaker(engine, expire_on_commit=False)
    async with fabrica() as db:
        if (await db.execute(select(Tenant).where(Tenant.nome == "Escritório Fictício da Carga"))).scalar_one_or_none():
            raise SystemExit("Já povoado. Recrie o banco para começar de novo.")
        tenant = Tenant(nome="Escritório Fictício da Carga", cnpj=cnpj("410000000001"), plano="premium")
        db.add(tenant)
        await db.flush()
        # Uma pessoa que existe no Connect local (o administrador do seed) e uma que não existe.
        quem = Usuario(tenant_id=tenant.id, email="adm6@41bpo.com.br", nome="Pessoa do Seed", senha_hash="x" * 60, role="admin")
        outra = Usuario(tenant_id=tenant.id, email="fora.do.connect@exemplo.invalid", nome="Pessoa Ausente", senha_hash="x" * 60, role="contador")
        db.add_all([quem, outra])
        await db.flush()

        empresas = [
            Empresa(tenant_id=tenant.id, razao_social="Mercearia Ensaio da Carga LTDA", cnpj=cnpj("314159260001"), regime_tributario="simples_nacional"),
            Empresa(tenant_id=tenant.id, razao_social="Oficina Sem Par no Connect LTDA", cnpj=cnpj("271828180001"), regime_tributario="lucro_presumido"),
        ]
        db.add_all(empresas)
        await db.flush()

        for n, empresa in enumerate(empresas):
            def conta(codigo, descricao, tipo, numero, tipo_sa="A", pai=None):
                c = PlanoConta(empresa_id=empresa.id, codigo=codigo, descricao=descricao, tipo=tipo, conta_numero=numero, tipo_sa=tipo_sa, pai_id=pai.id if pai else None)
                db.add(c)
                return c

            ativo = conta("1", "Ativo", "ativo", None, "S")
            await db.flush()
            banco = conta("1.1.1.01", "Banco Cooperativo c/c", "ativo", 12, pai=ativo)
            clientes = conta("1.1.2.01", "Clientes", "ativo", 101, pai=ativo)
            fornecedores = conta("2.1.1.01", "Fornecedores", "passivo", 2001)
            tarifas = conta("3.4.2.05", "Tarifas bancárias", "despesa", 1026)
            receita = conta("3.1.1.01", "Receita de vendas", "receita", 3001)
            juros = conta("3.4.2.10", "Juros pagos", "despesa", 1030)
            apagada = conta("9.9.9", "Conta apagada", "despesa", 9999)
            await db.flush()
            apagada.deleted_at = datetime.now(timezone.utc)
            db.add_all([
                PlanoContaFaixaTipo(empresa_id=empresa.id, tipo="ativo", codigo_de="1", codigo_ate="1.9"),
                PlanoContaFaixaTipo(empresa_id=empresa.id, tipo="despesa", codigo_de="3.4", codigo_ate="3.4.9"),
            ])
            agencia = AgenciaBancaria(empresa_id=empresa.id, banco_sigla="756", agencia="1234", numero=f"9876{n}", digito="4", conta_contabil_id=banco.id)
            inativa = AgenciaBancaria(empresa_id=empresa.id, banco_sigla="ITAU", agencia="0001", numero=f"1111{n}", digito="1", ativa=False)
            db.add_all([agencia, inativa])
            await db.flush()
            db.add_all([
                Contraparte(empresa_id=empresa.id, tipo="fornecedor", documento="11222333000181", razao_social="Moinho Fictício Ltda", conta_contabil_id=fornecedores.id, origem="manual"),
                Contraparte(
                    empresa_id=empresa.id, tipo="cliente", documento="12345678909", razao_social="Cliente Inventado da Silva", conta_contabil_id=clientes.id,
                    origem="relatorio_fiscal", confirmado_em=datetime.now(timezone.utc), confirmado_por=quem.id,
                    dados_cadastrais={"uf": "SC", "municipio": "Cidade Fictícia", "cep": "89000000"},
                ),
                Contraparte(empresa_id=empresa.id, tipo="fornecedor", documento="98765432000110", razao_social="Fornecedor Inativo Ltda", conta_contabil_id=fornecedores.id, origem="manual", ativa=False),
            ])
            db.add_all([
                Regra(empresa_id=empresa.id, conta_id=tarifas.id, descricao="Tarifa bancária", historico="TARIFA PACOTE", historico_normalizado="tarifa pacote", dc="D", tipo="automatica"),
                Regra(empresa_id=empresa.id, conta_id=receita.id, agencia_id=agencia.id, descricao="Vendas no cartão", historico="VENDAS CARTAO", historico_normalizado="vendas cartao", dc="C", tipo="automatica", manter_historico=True),
                Regra(empresa_id=empresa.id, conta_id=juros.id, descricao="Juros antigos", historico="JUROS ANTIGOS", historico_normalizado="juros antigos", dc="D", tipo="automatica", ativa=False),
            ])
            await db.commit()

            svc = ExtratoService(db=db, empresa_id=empresa.id)
            for mes, linhas in (
                ("01", [("20260105", "-15.90", f"A{n}1", "TARIFA PACOTE SERVICOS"), ("20260106", "350.00", f"A{n}2", "VENDAS CARTAO DEBITO"),
                        ("20260107", "-1200.00", f"A{n}3", "PIX EMITIDO Moinho 11.222.333/0001-81"), ("20260108", "-80.00", f"A{n}4", "PAGTO DIVERSO SEM REGRA"),
                        ("20260109", "-500.00", f"A{n}5", "BOLETO COM JUROS")]),
                ("02", [("20260203", "-15.90", f"B{n}1", "TARIFA PACOTE SERVICOS"), ("20260204", "920.10", f"B{n}2", "VENDAS CARTAO CREDITO"),
                        ("20260205", "-42.00", f"B{n}3", "OUTRA SAIDA SEM REGRA")]),
            ):
                texto = ofx(f"9876{n}-4", linhas, "1000.00", f"2026{mes}28")
                lote = await abrir_importacao(db, empresa_id=empresa.id, agencia_id=agencia.id, nome_arquivo=f"extrato-{mes}.ofx", conteudo=texto.encode(), criado_por=quem.id)
                resultado = await svc.importar_ofx(texto, agencia.id, importacao_id=lote.id)
                await registrar_resultado(db, lote, resultado)
                await db.commit()
            # Um terceiro arquivo, importado e desfeito (lote cancelado com motivo).
            texto = ofx(f"9876{n}-4", [("20260310", "-7.00", f"C{n}1", "TARIFA AVULSA")], "993.00", "20260331")
            lote = await abrir_importacao(db, empresa_id=empresa.id, agencia_id=agencia.id, nome_arquivo="extrato-03-errado.ofx", conteudo=texto.encode(), criado_por=outra.id)
            await registrar_resultado(db, lote, await svc.importar_ofx(texto, agencia.id, importacao_id=lote.id))
            await db.commit()
            await cancelar_importacao(db, empresa_id=empresa.id, importacao_id=lote.id, motivo="Arquivo de outra conta", usuario_id=quem.id)
            await db.commit()

            await NeoEngine(db, empresa.id).processar()
            await db.commit()
            # Classificação manual de uma pendência, cancelamento, reclassificação e composição.
            pendente = (await db.execute(select(Transacao).where(Transacao.empresa_id == empresa.id, Transacao.historico.like("%SEM REGRA%"), Transacao.status == "pendente").order_by(Transacao.data))).scalars().first()
            if pendente:
                await NeoEngine(db, empresa.id).classificar_manualmente_lote([pendente], fornecedores.id, "PAGAMENTO DIVERSO")
                await db.commit()
            registros = (await db.execute(select(RegistroContabil).where(RegistroContabil.empresa_id == empresa.id, RegistroContabil.deleted_at.is_(None), RegistroContabil.cancelado_em.is_(None)).order_by(RegistroContabil.data_lancamento))).scalars().all()
            lancamentos = list(dict.fromkeys(r.lancamento_id for r in registros))
            if len(lancamentos) >= 2:
                await cancelar_lancamento(db, empresa_id=empresa.id, lancamento_id=lancamentos[0], motivo="Classificado errado", usuario_id=quem.id)
                await db.commit()
                await reclassificar_lancamento(db, empresa_id=empresa.id, tenant_id=tenant.id, lancamento_id=lancamentos[1], conta_id=juros.id, descricao="RECLASSIFICADO PARA JUROS", motivo="Conta certa é juros", usuario_id=quem.id)
                await db.commit()
            boleto = (await db.execute(select(Transacao).where(Transacao.empresa_id == empresa.id, Transacao.historico == "BOLETO COM JUROS"))).scalar_one()
            if boleto.status == "pendente":
                await NeoEngine(db, empresa.id).classificar_manualmente_lote([boleto], fornecedores.id, "PAGAMENTO DE BOLETO")
                await db.commit()
            vigente = (await db.execute(select(RegistroContabil).where(RegistroContabil.transacao_id == boleto.id, RegistroContabil.deleted_at.is_(None), RegistroContabil.cancelado_em.is_(None)))).scalars().first()
            if vigente:
                from src.schemas.neo import NeoComponenteInput
                await alterar_composicao(
                    db, empresa_id=empresa.id, tenant_id=tenant.id, transacao_id=boleto.id, lancamento_vigente_id=vigente.lancamento_id,
                    componentes=[
                        NeoComponenteInput(conta_id=fornecedores.id, historico="PRINCIPAL DO BOLETO", valor=Decimal("480.00")),
                        NeoComponenteInput(conta_id=juros.id, historico="JUROS DO BOLETO", valor=Decimal("20.00")),
                    ],
                    motivo="Separar juros", usuario_id=quem.id,
                )
                await db.commit()

            exportacao = ExportacaoService(db, empresa.id, quem.id)
            for mes in ("2026-01", "2026-02"):
                _, conteudo = await exportacao.exportar(ExportJobCreate(formato="txt", tipo="lancamentos_importacao", mes=mes))
                (saida / f"{empresa.cnpj.replace('/', '-')}_{mes}.txt").write_bytes(conteudo)
            await db.commit()
            print(empresa.razao_social, "povoada")
    await engine.dispose()


asyncio.run(main())
