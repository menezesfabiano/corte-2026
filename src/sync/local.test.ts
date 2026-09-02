import { describe, expect, it } from "vitest";
import {
  CHAVE_DADOS,
  CHAVE_FILA,
  CacheLocal,
  aplicarOperacao,
  armazemMemoria,
  armazemPadrao,
  fundir,
  type Armazem,
} from "./local.ts";
import {
  agoraISO,
  instantaneoVazio,
  novoId,
  type Operacao,
  type PesagemRegistrada,
  type RefeicaoRegistrada,
} from "./tipos.ts";

const pesagem = (data: string, peso: number, em = "2026-08-24T12:00:00Z"): PesagemRegistrada => ({
  data,
  peso,
  cintura: null,
  atualizadoEm: em,
});

const refeicao = (id: string, data: string, hora: string): RefeicaoRegistrada => ({
  id,
  data,
  hora,
  refeicao: "Almoço",
  itens: [{ n: "Arroz branco cozido", q: "215 g" }],
  p: 10,
  c: 60,
  g: 1,
  kcal: 289,
  criadoEm: "2026-08-24T15:00:00Z",
});

const op = (id: string, tipo: Operacao["tipo"], alvo: unknown): Operacao =>
  ({ id, em: "2026-08-24T12:00:00Z", tipo, alvo }) as Operacao;

describe("CacheLocal, leitura e escrita", () => {
  it("guarda e devolve pesagens em ordem de data", () => {
    const c = new CacheLocal(armazemMemoria());
    c.salvarPesagem(pesagem("2026-08-31", 95.2));
    c.salvarPesagem(pesagem("2026-08-24", 95.8));
    expect(c.pesagens().map((p) => p.data)).toEqual(["2026-08-24", "2026-08-31"]);
  });

  it("uma pesagem por data, a ultima ganha", () => {
    const c = new CacheLocal(armazemMemoria());
    c.salvarPesagem(pesagem("2026-08-24", 95.8));
    c.salvarPesagem(pesagem("2026-08-24", 95.5));
    expect(c.pesagens()).toHaveLength(1);
    expect(c.pesagens()[0]!.peso).toBe(95.5);
  });

  it("filtra refeicoes pelo dia e ordena pela hora", () => {
    const c = new CacheLocal(armazemMemoria());
    c.salvarRefeicao(refeicao("b", "2026-08-24", "20:30"));
    c.salvarRefeicao(refeicao("a", "2026-08-24", "12:30"));
    c.salvarRefeicao(refeicao("c", "2026-08-25", "12:30"));
    expect(c.refeicoesDe("2026-08-24").map((r) => r.id)).toEqual(["a", "b"]);
    expect(c.refeicoesDe("2026-08-25")).toHaveLength(1);
    expect(c.refeicoesDe("2026-09-01")).toEqual([]);
  });

  it("apaga refeicao por id", () => {
    const c = new CacheLocal(armazemMemoria());
    c.salvarRefeicao(refeicao("a", "2026-08-24", "12:30"));
    c.apagarRefeicao("a");
    expect(c.refeicoesDe("2026-08-24")).toEqual([]);
  });

  it("guarda o modelo escolhido do dia", () => {
    const c = new CacheLocal(armazemMemoria());
    expect(c.modeloDe("2026-08-24")).toBeNull();
    c.definirModelo({ data: "2026-08-24", modelo: "t1630", atualizadoEm: "2026-08-24T07:00:00Z" });
    expect(c.modeloDe("2026-08-24")).toBe("t1630");
    c.definirModelo({ data: "2026-08-24", modelo: "off", atualizadoEm: "2026-08-24T08:00:00Z" });
    expect(c.modeloDe("2026-08-24")).toBe("off");
  });

  it("sobrevive a um recarregamento do app", () => {
    const armazem = armazemMemoria();
    const primeiro = new CacheLocal(armazem);
    primeiro.salvarPesagem(pesagem("2026-08-24", 95.8));
    primeiro.enfileirar(op("op1", "pesagem.salvar", pesagem("2026-08-24", 95.8)));

    const segundo = new CacheLocal(armazem);
    expect(segundo.pesagens()).toHaveLength(1);
    expect(segundo.fila()).toHaveLength(1);
  });

  it("limparTudo esvazia dados e fila", () => {
    const armazem = armazemMemoria();
    const c = new CacheLocal(armazem);
    c.salvarPesagem(pesagem("2026-08-24", 95.8));
    c.enfileirar(op("op1", "pesagem.salvar", pesagem("2026-08-24", 95.8)));
    c.limparTudo();
    expect(c.pesagens()).toEqual([]);
    expect(c.fila()).toEqual([]);
    expect(armazem.getItem(CHAVE_DADOS)).toBeNull();
  });
});

describe("CacheLocal, resiliencia", () => {
  it("JSON quebrado vira cache vazio e a chave e descartada", () => {
    const armazem = armazemMemoria({ [CHAVE_DADOS]: "{isso nao e json" });
    const c = new CacheLocal(armazem);
    expect(c.instantaneo()).toEqual(instantaneoVazio());
    expect(armazem.getItem(CHAVE_DADOS)).toBeNull();
  });

  it("dado fora do contrato vira cache vazio", () => {
    const armazem = armazemMemoria({
      [CHAVE_DADOS]: JSON.stringify({ pesagens: [{ data: "ontem", peso: "muito" }], refeicoes: [], dias: [] }),
    });
    expect(new CacheLocal(armazem).pesagens()).toEqual([]);
  });

  it("fila corrompida nao impede o app de abrir", () => {
    const armazem = armazemMemoria({ [CHAVE_FILA]: JSON.stringify([{ tipo: "explodir" }]) });
    expect(new CacheLocal(armazem).fila()).toEqual([]);
  });

  it("storage que recusa escrita nao derruba a sessao", () => {
    const memoria = armazemMemoria();
    const travado: Armazem = {
      getItem: memoria.getItem,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: memoria.removeItem,
    };
    const c = new CacheLocal(travado);
    expect(() => c.salvarPesagem(pesagem("2026-08-24", 95.8))).not.toThrow();
    expect(c.pesagens()).toHaveLength(1); // a memoria continua certa
  });
});

describe("armazemPadrao", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  function trocarLocalStorage(valor: unknown): void {
    Object.defineProperty(globalThis, "localStorage", { value: valor, configurable: true, writable: true });
  }

  function restaurar(): void {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }

  it("usa o localStorage quando o navegador deixa", () => {
    trocarLocalStorage(armazemMemoria());
    const a = armazemPadrao();
    a.setItem("x", "1");
    expect(a.getItem("x")).toBe("1");
    restaurar();
  });

  it("cai na memoria quando o storage esta bloqueado", () => {
    trocarLocalStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("modo privado");
      },
      removeItem: () => {},
    });
    const a = armazemPadrao();
    expect(() => a.setItem("x", "1")).not.toThrow();
    expect(a.getItem("x")).toBe("1"); // gravou na memoria
    restaurar();
  });

  it("cai na memoria quando nem existe localStorage", () => {
    trocarLocalStorage(undefined);
    expect(() => armazemPadrao()).not.toThrow();
    restaurar();
  });
});

describe("identificadores", () => {
  it("gera id unico e carimbo ISO", () => {
    expect(novoId()).not.toBe(novoId());
    expect(agoraISO()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("fila", () => {
  it("enfileira, remove por id e limpa", () => {
    const c = new CacheLocal(armazemMemoria());
    c.enfileirar(op("1", "pesagem.salvar", pesagem("2026-08-24", 95.8)));
    c.enfileirar(op("2", "refeicao.apagar", { id: "x" }));
    expect(c.fila().map((o) => o.id)).toEqual(["1", "2"]);
    c.removerDaFila(["1"]);
    expect(c.fila().map((o) => o.id)).toEqual(["2"]);
    c.limparFila();
    expect(c.fila()).toEqual([]);
  });

  it("a fila devolvida e copia, mexer nela nao mexe no cache", () => {
    const c = new CacheLocal(armazemMemoria());
    c.enfileirar(op("1", "refeicao.apagar", { id: "x" }));
    c.fila().pop();
    expect(c.fila()).toHaveLength(1);
  });
});

describe("fusao depois do pull", () => {
  const remoto = {
    pesagens: [pesagem("2026-08-24", 95.8, "2026-08-24T10:00:00Z")],
    refeicoes: [refeicao("servidor", "2026-08-24", "12:30")],
    dias: [{ data: "2026-08-24", modelo: "t11" as const, atualizadoEm: "2026-08-24T06:00:00Z" }],
  };

  it("sem fila, o remoto vale tal como veio", () => {
    expect(fundir(remoto, [])).toEqual(remoto);
  });

  it("o que ainda nao subiu vence o que veio do servidor", () => {
    const fundido = fundir(remoto, [
      op("1", "pesagem.salvar", pesagem("2026-08-24", 95.3, "2026-08-24T20:00:00Z")),
      op("2", "dia.definir", { data: "2026-08-24", modelo: "t1630", atualizadoEm: "2026-08-24T21:00:00Z" }),
    ]);
    expect(fundido.pesagens).toHaveLength(1);
    expect(fundido.pesagens[0]!.peso).toBe(95.3);
    expect(fundido.dias[0]!.modelo).toBe("t1630");
  });

  it("refeicao nova entra e refeicao apagada offline some", () => {
    const fundido = fundir(remoto, [
      op("1", "refeicao.salvar", refeicao("nova", "2026-08-24", "20:30")),
      op("2", "refeicao.apagar", { id: "servidor" }),
    ]);
    expect(fundido.refeicoes.map((r) => r.id)).toEqual(["nova"]);
  });

  it("aplicarOperacao nao muda o instantaneo original", () => {
    const antes = structuredClone(remoto);
    aplicarOperacao(remoto, op("1", "refeicao.apagar", { id: "servidor" }));
    expect(remoto).toEqual(antes);
  });
});
