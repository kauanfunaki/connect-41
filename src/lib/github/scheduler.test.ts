import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./sync", () => ({ processGithubCron: mocks.run }));
import { startGithubScheduler, stopGithubScheduler } from "./scheduler";

afterEach(() => { stopGithubScheduler(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetAllMocks(); });
describe("executor automático GitHub", () => {
  it("não inicia em desenvolvimento, build ou quando desativado", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "development"); startGithubScheduler();
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PHASE", "phase-production-build"); startGithubScheduler();
    vi.stubEnv("NEXT_PHASE", ""); vi.stubEnv("GITHUB_SYNC_ENABLED", "false"); startGithubScheduler();
    await vi.advanceTimersByTimeAsync(60000);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("inicia uma vez, evita lotes sobrepostos e retoma sem navegador", async () => {
    vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "production");
    let finish!: () => void;
    mocks.run.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue({ ok: true });
    startGithubScheduler(); startGithubScheduler();
    await vi.advanceTimersByTimeAsync(1000); expect(mocks.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); expect(mocks.run).toHaveBeenCalledTimes(1);
    finish(); await vi.advanceTimersByTimeAsync(10000); expect(mocks.run).toHaveBeenCalledTimes(2);
    stopGithubScheduler(); await vi.advanceTimersByTimeAsync(60000); expect(mocks.run).toHaveBeenCalledTimes(2);
  });
  it("aguarda um minuto após falha do banco e tenta novamente", async () => {
    vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.run.mockRejectedValueOnce(new Error("indisponível")).mockResolvedValue({ ok: true });
    startGithubScheduler(); await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(59000); expect(mocks.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(mocks.run).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
