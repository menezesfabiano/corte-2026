import { describe, expect, it } from "vitest";
import {
  NOME_CAMINHADA,
  NOME_DOCE,
  ehCaminhada,
  ehDoce,
  entradaCaminhada,
  entradaDoce,
  macrosDoce,
  metaDoDia,
} from "./extras.ts";
import { totalDia } from "./macros.ts";
import { plano } from "../data/plano.ts";

const p = plano.parametros;

describe("doce oficial", () => {
  it("a kcal sai dos macros e cabe no teto do plano", () => {
    const m = macrosDoce(p);
    expect(m.kcal).toBe(4 * p.doce.p + 4 * p.doce.c + 9 * p.doce.g);
    expect(m.kcal).toBe(146);
    expect(m.kcal).toBeLessThanOrEqual(p.doce.kcalMax);
  });

  it("vira um registro de refeicao com data, hora e nome fixo", () => {
    const e = entradaDoce(p, "2026-11-13", "21:40");
    expect(e).toMatchObject({ data: "2026-11-13", hora: "21:40", refeicao: NOME_DOCE, p: 2, c: 21, g: 6, kcal: 146 });
    expect(e.itens).toEqual([{ n: "Doce do dia", q: "até 150 kcal" }]);
    expect(ehDoce(e)).toBe(true);
    expect(ehCaminhada(e)).toBe(false);
  });
});

describe("caminhada", () => {
  it("entra como registro sem macro nenhum, reconhecido pelo nome", () => {
    const e = entradaCaminhada(p, "2026-11-13", "18:05");
    expect(e).toMatchObject({ data: "2026-11-13", hora: "18:05", refeicao: NOME_CAMINHADA, p: 0, c: 0, g: 0, kcal: 0 });
    expect(e.itens).toEqual([{ n: "Caminhada", q: `${p.caminhada.minutos} min` }]);
    expect(ehCaminhada(e)).toBe(true);
    expect(ehDoce(e)).toBe(false);
  });
});

describe("meta do dia", () => {
  it("soma o doce oficial ao cardapio do modelo", () => {
    const cardapio = totalDia(plano.alimentos, plano.dias.C!.t11!);
    const meta = metaDoDia(cardapio, p);
    expect(meta.kcal).toBeCloseTo(cardapio.kcal + 146, 10);
    expect(meta.p).toBeCloseTo(cardapio.p + 2, 10);
    expect(meta.c).toBeCloseTo(cardapio.c + 21, 10);
    expect(meta.g).toBeCloseTo(cardapio.g + 6, 10);
  });

  it("treino 11h do bloco C fecha em 2.671 kcal com o doce", () => {
    const meta = metaDoDia(totalDia(plano.alimentos, plano.dias.C!.t11!), p);
    expect(Math.round(meta.kcal)).toBe(2671);
  });
});
