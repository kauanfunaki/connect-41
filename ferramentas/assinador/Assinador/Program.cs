// O Assinador do Connect (13/11/2026, funcionalidades 668 e 671). MEDIDA
// TEMPORÁRIA: sai quando a assinatura definitiva (CertificadoConnect ou
// certificado no servidor) entrar.
//
// Atende só em 127.0.0.1 e só aceita chamadas das páginas do Connect
// (cabeçalho Origin na lista de OrigensPermitidas). Usa o certificado que o
// CertDigital liga no Windows de quem está usando; a chave nunca sai daqui.

using System.Reflection;
using Assinador;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = AppContext.BaseDirectory });
var porta = builder.Configuration.GetValue("Porta", 47141);
var origens = builder.Configuration.GetSection("OrigensPermitidas").Get<string[]>() ?? [];
builder.WebHost.UseUrls($"http://127.0.0.1:{porta}");
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o => o.SingleLine = true);

var app = builder.Build();
var versao = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

app.Use(async (ctx, next) =>
{
    // Contra "DNS rebinding": o endereço pedido tem de ser o próprio computador.
    var host = ctx.Request.Host.Host;
    if (host is not ("127.0.0.1" or "localhost"))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }
    var origem = ctx.Request.Headers.Origin.ToString();
    var permitida = origens.Any(o => string.Equals(o.TrimEnd('/'), origem.TrimEnd('/'), StringComparison.OrdinalIgnoreCase));
    if (!string.IsNullOrEmpty(origem))
    {
        if (!permitida)
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        ctx.Response.Headers.AccessControlAllowOrigin = origem;
        ctx.Response.Headers.Vary = "Origin";
        ctx.Response.Headers.AccessControlAllowHeaders = "Content-Type";
        ctx.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
        // O Chrome pede licença para um site público falar com o próprio computador.
        ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
    }
    else if (!HttpMethods.IsGet(ctx.Request.Method))
    {
        // Só o /status responde sem Origin (para o TI conferir no navegador).
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }
    if (HttpMethods.IsOptions(ctx.Request.Method))
    {
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }
    await next();
});

app.MapGet("/status", () => Results.Json(new { ok = true, versao, certificados = Certificados.Listar() }));

app.MapPost("/esocial/consultar-trabalhador", async (PedidoDeConsulta p, CancellationToken ct) =>
    await Responder(async () =>
    {
        var cert = Certificados.Escolher(p.Thumbprint, p.Cnpj);
        var r = await ClienteEsocial.ConsultarTrabalhador(cert, p.Cnpj, p.Cpf, p.DtIni, p.DtFim, p.Restrita, ct);
        return new
        {
            ok = true,
            certificado = Certificados.NomeDe(cert),
            cdResposta = r.CdResposta,
            descResposta = r.DescResposta,
            qtdeTotal = r.QtdeTotal,
            dhUltimoEvt = r.DhUltimoEvt,
            identificadores = r.Identificadores.Select(i => new { id = i.Id, nrRec = i.NrRec }),
        };
    }));

app.MapPost("/esocial/baixar", async (PedidoDeDownload p, CancellationToken ct) =>
    await Responder(async () =>
    {
        var cert = Certificados.Escolher(p.Thumbprint, p.Cnpj);
        var r = await ClienteEsocial.BaixarPorId(cert, p.Cnpj, p.Ids, p.Restrita, ct);
        return new { ok = true, certificado = Certificados.NomeDe(cert), cdResposta = r.CdResposta, descResposta = r.DescResposta, xml = r.Xml };
    }));

Console.WriteLine($"Assinador do Connect {versao} em http://127.0.0.1:{porta} — deixe esta janela aberta enquanto usa o eSocial no Connect.");
app.Run();

static async Task<IResult> Responder(Func<Task<object>> trabalho)
{
    try
    {
        return Results.Json(await trabalho());
    }
    catch (ErroParaOConnect e)
    {
        return Results.Json(new { ok = false, erro = e.Message });
    }
    catch (Exception e)
    {
        Console.Error.WriteLine($"[erro] {e.GetType().Name}: {e.Message}");
        return Results.Json(new { ok = false, erro = "O Assinador teve um erro inesperado. Veja a janela dele e avise a Tech." });
    }
}

internal sealed record PedidoDeConsulta(string Cnpj, string Cpf, DateTime DtIni, DateTime DtFim, string? Thumbprint, bool Restrita = false);

internal sealed record PedidoDeDownload(string Cnpj, string[] Ids, string? Thumbprint, bool Restrita = false);

public partial class Program;
