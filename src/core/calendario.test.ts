import { describe, expect, it } from "vitest";
import {
  blocoDe,
  dataComDia,
  dataCurta,
  diaDaSemana,
  diasEntre,
  ehFimDeSemana,
  ehISO,
  hojeISO,
  modeloDe,
  partesISO,
  pontoDaCurva,
  segundaDe,
  semanaDe,
  somarDias,
} from "./calendario.ts";
import { plano } from "../data/plano.ts";

const faixas = plano.faixas;
const curva = plano.curva;

describe("hojeISO", () => {
  it("usa o fuso de Sao Paulo, nao UTC", () => {
    // 25/08 as 02:30 UTC e 24/08 as 23:30 em Sao Paulo.
    const noite = new Date("2026-08-25T02:30:00Z");
    expect(hojeISO(noite)).toBe("2026-08-24");
    // este e exatamente o bug da versao 1
    expect(noite.toISOString().slice(0, 10)).toBe("2026-08-25");
  });

  it("vira o dia na hora certa", () => {
    expect(hojeISO(new Date("2026-08-25T02:59:59Z"))).toBe("2026-08-24");
    expect(hojeISO(new Date("2026-08-25T03:00:00Z"))).toBe("2026-08-25");
  });

  it("devolve YYYY-MM-DD", () => {
    expect(ehISO(hojeISO(new Date("2026-12-31T12:00:00Z")))).toBe(true);
  });
});

describe("partesISO", () => {
  it("quebra a data", () => {
    expect(partesISO("2026-08-24")).toEqual({ ano: 2026, mes: 8, dia: 24 });
  });

  it("recusa lixo", () => {
    expect(() => partesISO("24/08/2026")).toThrow();
    expect(ehISO("24/08/2026")).toBe(false);
  });
});

describe("aritmetica de datas", () => {
  it("soma e subtrai dias atravessando o mes", () => {
    expect(somarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(somarDias("2026-09-01", -1)).toBe("2026-08-31");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("conta a distancia entre datas", () => {
    expect(diasEntre("2026-08-24", "2026-08-31")).toBe(7);
    expect(diasEntre("2026-08-31", "2026-08-24")).toBe(-7);
    expect(diasEntre("2026-08-24", "2026-12-28")).toBe(126);
  });
});

describe("dia da semana", () => {
  it("acerta os dias conhecidos do protocolo", () => {
    expect(diaDaSemana("2026-08-24")).toBe(1); // segunda, semana 1
    expect(diaDaSemana("2026-08-29")).toBe(6); // sabado
    expect(diaDaSemana("2026-08-30")).toBe(0); // domingo
    expect(diaDaSemana("2026-12-28")).toBe(1); // segunda, semana 19
  });

  it("marca o fim de semana", () => {
    expect(ehFimDeSemana("2026-08-29")).toBe(true);
    expect(ehFimDeSemana("2026-08-30")).toBe(true);
    expect(ehFimDeSemana("2026-08-28")).toBe(false);
  });

  it("acha a segunda da semana", () => {
    expect(segundaDe("2026-08-24")).toBe("2026-08-24");
    expect(segundaDe("2026-08-28")).toBe("2026-08-24");
    expect(segundaDe("2026-08-30")).toBe("2026-08-24"); // domingo fecha a semana
    expect(segundaDe("2026-08-31")).toBe("2026-08-31");
  });

  it("todas as pesagens da curva caem numa segunda", () => {
    for (const p of curva) expect(diaDaSemana(p.iso)).toBe(1);
  });
});

describe("formatacao", () => {
  it("mostra data curta e com dia", () => {
    expect(dataCurta("2026-08-24")).toBe("24/08");
    expect(dataComDia("2026-08-24")).toBe("seg 24/08");
    expect(dataComDia("2026-08-30")).toBe("dom 30/08");
  });
});

describe("blocoDe", () => {
  it("acerta os limites de cada bloco", () => {
    expect(blocoDe("2026-08-24", faixas)).toBe("A");
    expect(blocoDe("2026-09-13", faixas)).toBe("A");
    expect(blocoDe("2026-09-14", faixas)).toBe("B");
    expect(blocoDe("2026-10-18", faixas)).toBe("B");
    expect(blocoDe("2026-10-19", faixas)).toBe("C");
    expect(blocoDe("2026-11-29", faixas)).toBe("C");
    expect(blocoDe("2026-11-30", faixas)).toBe("D");
    expect(blocoDe("2026-12-31", faixas)).toBe("D");
  });

  it("antes do inicio devolve A e depois do fim devolve D", () => {
    expect(blocoDe("2026-01-01", faixas)).toBe("A");
    expect(blocoDe("2027-03-15", faixas)).toBe("D");
  });

  it("cai no ultimo bloco se a data ficar num buraco entre faixas", () => {
    const comBuraco = [
      { cod: "A" as const, inicio: "2026-08-24", fim: "2026-08-31" },
      { cod: "D" as const, inicio: "2026-09-10", fim: "2026-12-31" },
    ];
    expect(blocoDe("2026-09-05", comBuraco)).toBe("D");
  });

  it("recusa plano sem faixas", () => {
    expect(() => blocoDe("2026-08-24", [])).toThrow();
  });
});

describe("modeloDe", () => {
  it("fim de semana e sempre fds, mesmo com override", () => {
    expect(modeloDe("2026-08-29", "t11")).toBe("fds");
    expect(modeloDe("2026-08-30", null)).toBe("fds");
  });

  it("dia util respeita a escolha do usuario", () => {
    expect(modeloDe("2026-08-24", "t1630")).toBe("t1630");
    expect(modeloDe("2026-08-24", "off")).toBe("off");
  });

  it("dia util sem escolha cai no padrao t11", () => {
    expect(modeloDe("2026-08-24")).toBe("t11");
    expect(modeloDe("2026-08-24", null)).toBe("t11");
  });
});

describe("semanaDe", () => {
  it("pega a segunda mais recente ate a data", () => {
    expect(semanaDe("2026-08-24", curva)?.n).toBe(1);
    expect(semanaDe("2026-08-28", curva)?.n).toBe(1);
    expect(semanaDe("2026-08-31", curva)?.n).toBe(2);
    expect(semanaDe("2026-12-31", curva)?.n).toBe(19);
  });

  it("devolve null antes da semana 1", () => {
    expect(semanaDe("2026-08-23", curva)).toBeNull();
  });

  it("acha o ponto exato da pesagem", () => {
    expect(pontoDaCurva("2026-09-07", curva)?.peso).toBe(94.5);
    expect(pontoDaCurva("2026-09-08", curva)).toBeNull();
  });
});
