import { describe, expect, it } from "vitest";
import {
  daTupla,
  kcalDe,
  macros,
  macrosDe,
  macrosItens,
  macrosRefeicao,
  mediaSemanal,
  paraTupla,
  parseQuantidade,
  somar,
  subtrair,
  totalDia,
  zero,
} from "./macros.ts";
import { plano } from "../data/plano.ts";
import { COD_BLOCOS, COD_MODELOS } from "../data/schema.ts";

const tabela = plano.alimentos;

describe("parseQuantidade", () => {
  it("le grama, mililitro e unidade", () => {
    expect(parseQuantidade("215 g")).toBe(215);
    expect(parseQuantidade("250 ml")).toBe(250);
    expect(parseQuantidade("2 un")).toBe(2);
    expect(parseQuantidade("80")).toBe(80);
  });

  it("aceita virgula e ponto decimal", () => {
    expect(parseQuantidade("1,5 g")).toBe(1.5);
    expect(parseQuantidade("1.5 g")).toBe(1.5);
    expect(parseQuantidade("  12,25  ml ")).toBe(12.25);
  });

  it("recusa o que nao e quantidade", () => {
    expect(() => parseQuantidade("a gosto")).toThrow();
    expect(() => parseQuantidade("")).toThrow();
    expect(() => parseQuantidade("215 xicaras")).toThrow();
  });
});

describe("kcal", () => {
  it("usa Atwater e ignora fibra", () => {
    expect(kcalDe(10, 10, 10)).toBe(170);
    expect(macros(10, 10, 10, 99).kcal).toBe(170);
    expect(zero()).toEqual({ p: 0, c: 0, g: 0, fibra: 0, kcal: 0 });
  });

  it("a refeicao livre fecha exatamente no teto do plano", () => {
    const { kcalMax, protMin } = plano.parametros.livre;
    expect(kcalDe(45, 70, 30)).toBe(kcalMax);
    expect(protMin).toBe(45);
  });
});

describe("macrosDe", () => {
  it("escala pela quantidade sobre 100 g", () => {
    const m = macrosDe(tabela, "Peito de frango grelhado", 170);
    expect(m.p).toBeCloseTo(54.4, 6);
    expect(m.c).toBeCloseTo(0, 6);
    expect(m.g).toBeCloseTo(4.25, 6);
    expect(m.kcal).toBeCloseTo(4 * 54.4 + 9 * 4.25, 6);
  });

  it("azeite e gordura pura", () => {
    expect(macrosDe(tabela, "Azeite", 13).g).toBeCloseTo(13, 6);
    expect(macrosDe(tabela, "Azeite", 13).kcal).toBeCloseTo(117, 6);
  });

  it("reclama de alimento fora da tabela", () => {
    expect(() => macrosDe(tabela, "Picanha na brasa", 200)).toThrow(/fora da tabela/);
  });
});

describe("soma e subtracao", () => {
  it("soma sem arredondar no meio", () => {
    const s = somar(macros(0.4, 0.4, 0.4), macros(0.4, 0.4, 0.4), macros(0.4, 0.4, 0.4));
    expect(s.p).toBeCloseTo(1.2, 6);
    expect(paraTupla(s)[0]).toBe(1);
  });

  it("subtrai para o placar do dia", () => {
    const falta = subtrair(macros(236, 272, 72), macros(100, 100, 30));
    expect(paraTupla(falta)).toEqual([136, 172, 42, 1610]);
  });

  it("converte tupla do plano para macros", () => {
    expect(daTupla([45, 70, 30, 730]).kcal).toBe(730);
  });
});

describe("refeicoes do plano", () => {
  it("recalcula as 84 refeicoes nao livres dentro da tolerancia", () => {
    let contadas = 0;
    for (const b of COD_BLOCOS) {
      for (const k of COD_MODELOS) {
        for (const ref of plano.dias[b]![k]!.refs) {
          if (ref.livre) continue;
          contadas += 1;
          const m = macrosItens(tabela, ref.itens);
          expect(Math.abs(m.p - ref.m[0]), `${b}/${k} ${ref.h} P`).toBeLessThanOrEqual(1);
          expect(Math.abs(m.c - ref.m[1]), `${b}/${k} ${ref.h} C`).toBeLessThanOrEqual(1);
          expect(Math.abs(m.g - ref.m[2]), `${b}/${k} ${ref.h} G`).toBeLessThanOrEqual(1);
          expect(Math.abs(m.kcal - ref.m[3]), `${b}/${k} ${ref.h} kcal`).toBeLessThanOrEqual(15);
        }
      }
    }
    expect(contadas).toBe(84);
  });

  it("refeicao livre vale o valor declarado, sem itens", () => {
    const livre = plano.dias.A!.fds!.refs.find((r) => r.livre)!;
    expect(livre.itens).toHaveLength(0);
    expect(paraTupla(macrosRefeicao(tabela, livre))).toEqual([45, 70, 30, 730]);
  });

  it("refeicao normal vem dos itens", () => {
    const pos = plano.dias.A!.t11!.refs.find((r) => r.h === "12:30")!;
    expect(paraTupla(macrosRefeicao(tabela, pos))).toEqual(pos.m);
  });
});

describe("total do dia", () => {
  it("bate com o tot do plano nos 16 modelos", () => {
    for (const b of COD_BLOCOS) {
      for (const k of COD_MODELOS) {
        const dia = plano.dias[b]![k]!;
        expect(paraTupla(totalDia(tabela, dia)), `${b}/${k}`).toEqual(dia.tot);
      }
    }
  });

  it("nao arredonda no meio: somar tuplas ja arredondadas erra", () => {
    const dia = plano.dias.A!.t11!;
    const somaArredondada = dia.refs.reduce((acc, r) => acc + r.m[1], 0);
    expect(paraTupla(totalDia(tabela, dia))[1]).toBe(272);
    expect(somaArredondada).toBe(273); // o erro que a versao 1 mostra na tela
  });
});

describe("media semanal do bloco", () => {
  it("reproduz a media declarada de cada bloco com erro menor que 1 kcal", () => {
    for (const b of COD_BLOCOS) {
      const media = mediaSemanal(tabela, plano.dias[b]!, plano.parametros.semanaPadrao);
      const declarada = plano.blocos.find((x) => x.cod === b)!.media;
      expect(Math.abs(media - declarada), `bloco ${b}`).toBeLessThan(1);
    }
  });

  it("os degraus entre blocos sao 83, 56 e 55 kcal", () => {
    const m = COD_BLOCOS.map((b) => mediaSemanal(tabela, plano.dias[b]!, plano.parametros.semanaPadrao));
    expect(Math.round(m[0]! - m[1]!)).toBe(83);
    expect(Math.round(m[1]! - m[2]!)).toBe(56);
    expect(Math.round(m[2]! - m[3]!)).toBe(55);
  });

  it("reclama de semana padrao vazia ou incompleta", () => {
    expect(() => mediaSemanal(tabela, plano.dias.A!, {})).toThrow(/sem dias/);
    const semT11 = { ...plano.dias.A!, t11: undefined } as never;
    expect(() => mediaSemanal(tabela, semT11, { t11: 2 })).toThrow(/ausente/);
  });
});
