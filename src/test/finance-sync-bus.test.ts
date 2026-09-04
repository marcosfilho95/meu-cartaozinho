import { describe, expect, it, vi } from "vitest";
import { emitFinanceSync, subscribeFinanceSync } from "@/lib/financeSyncBus";
import { getFinanceViewCache, setFinanceViewCache } from "@/lib/financeViewCache";

describe("financeSyncBus", () => {
  it("notifica assinantes com o detalhe enviado", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeFinanceSync(handler);
    emitFinanceSync({ userId: "user-1", source: "test" });
    unsubscribe();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ userId: "user-1", source: "test" });
  });

  it("invalida o cache de views ao sincronizar", () => {
    setFinanceViewCache("home:user-1", { total: 10 });
    expect(getFinanceViewCache("home:user-1")).toEqual({ total: 10 });

    emitFinanceSync({ userId: "user-1" });

    expect(getFinanceViewCache("home:user-1")).toBeNull();
  });

  it("para de notificar após cancelar a assinatura", () => {
    const handler = vi.fn();
    subscribeFinanceSync(handler)();
    emitFinanceSync({ userId: "user-1" });
    expect(handler).not.toHaveBeenCalled();
  });
});
