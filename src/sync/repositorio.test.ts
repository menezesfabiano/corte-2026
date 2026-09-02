import { beforeEach, describe, expect, it } from "vitest";
import { CacheLocal, armazemMemoria, type Armazem } from "./local.ts";
import { Repositorio } from "./repositorio.ts";
import { aplicarOperacao } from "./local.ts";
import { instantaneoVazio, type Instantaneo, type Operacao, type Servidor } from "./tipos.ts";

/** Dublê de servidor: guarda um instantaneo e pode falhar sob comando. */
class ServidorFalso implements Servidor {
  estado: Instantaneo = instantaneoVazio();
  recebidas: Operacao[] = [];
  falharAplicar: string | null = null;
  falharPuxar: string | null = null;

  async puxar(): Promise<Instantaneo> {
    if (this.falharPuxar) throw new Error(this.falharPuxar);
    return structuredClone(this.estado);
  }

  async aplicar(op: Operacao): Promise<void> {
    if (this.falharAplicar) throw new Error(this.falharAplicar);
    this.recebidas.push(op);
    this.estado = aplicarOperacao(this.estado, op);
  }
}

let armazem: Armazem;
let contador: number;

function novoRepositorio(): Repositorio {
  contador = 0;
  return new Repositorio(
    new CacheLocal(armazem),
    () => "2026-08-24T12:00:00Z",
    () => `id${++contador}`,
  );
}

beforeEach(() => {
  armazem = armazemMemoria();
});

describe("sem login", () => {
  it("grava e le tudo localmente", () => {
    const repo = novoRepositorio();
    repo.salvarPesagem("2026-08-24", 95.8, 94.2);
    repo.definirModelo("2026-08-24", "t1630");
    const r = repo.registrarRefeicao({
      data: "2026-08-24",
      hora: "12:30",
      refeicao: "Pós-treino",
      itens: [{ n: "Arroz branco cozido", q: "215 g" }],
      p: 71,
      c: 93,
      g: 19,
      kcal: 827,
    });

    expect(repo.estado()).toBe("sem-login");
    expect(repo.pesagens()).toHaveLength(1);
    expect(repo.modeloDe("2026-08-24")).toBe("t1630");
    expect(repo.refeicoesDe("2026-08-24")).toHaveLength(1);
    expect(r.id).toMatch(/^id\d+$/);
  });

  it("acumula a fila para subir depois", () => {
    const repo = novoRepositorio();
    repo.salvarPesagem("2026-08-24", 95.8, null);
    repo.definirModelo("2026-08-24", "off");
    expect(repo.pendentes()).toBe(2);
  });

  it("apagar refeicao funciona offline, porque o id vem do cliente", () => {
    const repo = novoRepositorio();
    const r = repo.registrarRefeicao({
      data: "2026-08-24",
      hora: "19:00",
      refeicao: "Jantar",
      itens: [],
      p: 30,
      c: 0,
      g: 5,
      kcal: 165,
    });
    repo.apagarRefeicao(r.id);
    expect(repo.refeicoesDe("2026-08-24")).toEqual([]);
    expect(repo.pendentes()).toBe(2); // salvar e apagar, nesta ordem
  });

  it("avisa quem esta assinando a cada escrita", () => {
    const repo = novoRepositorio();
    let toques = 0;
    const cancelar = repo.assinar(() => (toques += 1));
    repo.salvarPesagem("2026-08-24", 95.8, null);
    expect(toques).toBeGreaterThan(0);
    const ate = toques;
    cancelar();
    repo.definirModelo("2026-08-24", "off");
    expect(toques).toBe(ate);
  });
});

describe("conectando", () => {
  it("puxa do servidor e sobrescreve o cache", async () => {
    const servidor = new ServidorFalso();
    servidor.estado = {
      pesagens: [{ data: "2026-08-24", peso: 95.5, cintura: 94, atualizadoEm: "2026-08-24T09:00:00Z" }],
      refeicoes: [],
      dias: [],
    };
    const repo = novoRepositorio();
    await repo.conectar(servidor);
    expect(repo.estado()).toBe("sincronizado");
    expect(repo.pesagens()[0]!.peso).toBe(95.5);
  });

  it("o que foi escrito offline vence o que veio do servidor e depois sobe", async () => {
    const servidor = new ServidorFalso();
    servidor.estado = {
      pesagens: [{ data: "2026-08-24", peso: 95.5, cintura: null, atualizadoEm: "2026-08-24T09:00:00Z" }],
      refeicoes: [],
      dias: [],
    };
    const repo = novoRepositorio();
    repo.salvarPesagem("2026-08-24", 94.9, 93.5); // escrita offline, mais nova

    await repo.conectar(servidor);

    expect(repo.pesagens()[0]!.peso).toBe(94.9);
    expect(repo.pendentes()).toBe(0);
    expect(servidor.estado.pesagens[0]!.peso).toBe(94.9);
  });

  it("drena a fila na ordem em que foi criada", async () => {
    const servidor = new ServidorFalso();
    const repo = novoRepositorio();
    const r = repo.registrarRefeicao({
      data: "2026-08-24",
      hora: "12:30",
      refeicao: "Almoço",
      itens: [],
      p: 1,
      c: 1,
      g: 1,
      kcal: 17,
    });
    repo.apagarRefeicao(r.id);

    await repo.conectar(servidor);

    expect(servidor.recebidas.map((o) => o.tipo)).toEqual(["refeicao.salvar", "refeicao.apagar"]);
    expect(servidor.estado.refeicoes).toEqual([]);
    expect(repo.estado()).toBe("sincronizado");
  });

  it("pull que falha deixa os dados locais intactos e marca erro", async () => {
    const servidor = new ServidorFalso();
    servidor.falharPuxar = "sem rede";
    const repo = novoRepositorio();
    repo.salvarPesagem("2026-08-24", 94.9, null);

    await repo.conectar(servidor);

    expect(repo.estado()).toBe("erro");
    expect(repo.ultimoErro()).toBe("sem rede");
    expect(repo.pesagens()[0]!.peso).toBe(94.9);
    expect(repo.pendentes()).toBe(1);
  });
});

describe("drenagem com falha", () => {
  it("para na operacao que falhou e nao perde as seguintes", async () => {
    const servidor = new ServidorFalso();
    const repo = novoRepositorio();
    await repo.conectar(servidor);

    servidor.falharAplicar = "500 do servidor";
    repo.salvarPesagem("2026-08-24", 95.8, null);
    repo.definirModelo("2026-08-24", "off");
    await repo.sincronizar();

    expect(repo.estado()).toBe("erro");
    expect(repo.pendentes()).toBe(2);
    expect(servidor.recebidas).toHaveLength(0);
  });

  it("a proxima tentativa sobe tudo e volta para sincronizado", async () => {
    const servidor = new ServidorFalso();
    const repo = novoRepositorio();
    await repo.conectar(servidor);

    servidor.falharAplicar = "sem rede";
    repo.salvarPesagem("2026-08-24", 95.8, null);
    await repo.sincronizar();
    expect(repo.estado()).toBe("erro");

    servidor.falharAplicar = null;
    await repo.sincronizar();

    expect(repo.estado()).toBe("sincronizado");
    expect(repo.pendentes()).toBe(0);
    expect(servidor.estado.pesagens[0]!.peso).toBe(95.8);
  });

  it("chamadas simultaneas compartilham a mesma drenagem", async () => {
    const servidor = new ServidorFalso();
    const repo = novoRepositorio();
    await repo.conectar(servidor);
    repo.salvarPesagem("2026-08-24", 95.8, null);

    await Promise.all([repo.sincronizar(), repo.sincronizar(), repo.sincronizar()]);

    expect(servidor.recebidas).toHaveLength(1);
    expect(repo.pendentes()).toBe(0);
  });
});

describe("desconectar", () => {
  it("volta para local, mantendo os dados no aparelho", async () => {
    const servidor = new ServidorFalso();
    const repo = novoRepositorio();
    await repo.conectar(servidor);
    repo.salvarPesagem("2026-08-24", 95.8, null);
    await repo.sincronizar();

    repo.desconectar();

    expect(repo.estado()).toBe("sem-login");
    expect(repo.pesagens()).toHaveLength(1);
  });

  it("sincronizar sem servidor nao faz nada e nao quebra", async () => {
    const repo = novoRepositorio();
    repo.salvarPesagem("2026-08-24", 95.8, null);
    await expect(repo.sincronizar()).resolves.toBeUndefined();
    expect(repo.pendentes()).toBe(1);
  });
});
