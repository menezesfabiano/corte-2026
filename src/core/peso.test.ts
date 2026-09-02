import { describe, expect, it } from "vitest";
import {
  acao,
  faixaSeguraKg,
  perdido,
  projecao,
  ritmo,
  semanasPesadas,
  type Pesagem,
  type SemanaPesada,
} from "./peso.ts";
import { plano } from "../data/plano.ts";

const p = plano.parametros;
const curva = plano.curva;

/** Ponto sintetico, para testar a matematica sem depender da curva real. */
function sp(n: number, peso: number, alvo = peso): SemanaPesada {
  return { n, data: `2026-01-${String(n).padStart(2, "0")}`, peso, cintura: null, alvo, desvio: peso - alvo };
}

describe("ritmo", () => {
  it("quatro pontos em linha reta devolvem a inclinacao exata", () => {
    const r = ritmo([sp(1, 96), sp(2, 95.5), sp(3, 95), sp(4, 94.5)], 4);
    expect(r).not.toBeNull();
    expect(r!.inclinacao).toBeCloseTo(-0.5, 10);
    expect(r!.r2).toBeCloseTo(1, 10);
    expect(r!.pontos).toBe(4);
  });

  it("usa so os ultimos pontos pedidos", () => {
    // as tres primeiras semanas foram paradas, as quatro ultimas caem 0,4 por semana
    const serie = [sp(1, 96), sp(2, 96), sp(3, 96), sp(4, 95.6), sp(5, 95.2), sp(6, 94.8), sp(7, 94.4)];
    expect(ritmo(serie, 4)!.inclinacao).toBeCloseTo(-0.4, 10);
    expect(ritmo(serie, 7)!.inclinacao).toBeGreaterThan(-0.4);
  });

  it("menos de dois pontos nao tem ritmo", () => {
    expect(ritmo([], 4)).toBeNull();
    expect(ritmo([sp(1, 96)], 4)).toBeNull();
  });

  it("serie irregular derruba o R2", () => {
    const r = ritmo([sp(1, 96), sp(2, 94), sp(3, 95.8), sp(4, 94.2)], 4);
    expect(r!.inclinacao).toBeLessThan(0);
    expect(r!.r2).toBeLessThan(0.7);
  });

  it("peso parado da inclinacao zero e R2 cheio", () => {
    const r = ritmo([sp(1, 96), sp(2, 96), sp(3, 96)], 4);
    expect(r!.inclinacao).toBeCloseTo(0, 10);
    expect(r!.r2).toBe(1);
  });

  it("ganho de peso da inclinacao positiva", () => {
    expect(ritmo([sp(1, 94), sp(2, 94.6)], 4)!.inclinacao).toBeCloseTo(0.6, 10);
  });
});

describe("projecao", () => {
  it("estende o ritmo ate a ultima semana da curva", () => {
    const serie = [sp(1, 96), sp(2, 95.5), sp(3, 95), sp(4, 94.5)];
    const r = ritmo(serie, 4)!;
    // da semana 4 ate a 19 sao 15 semanas a menos 0,5 kg
    expect(projecao(serie, r, curva)).toBeCloseTo(94.5 - 7.5, 10);
  });

  it("sem ritmo ou sem pesagem nao ha projecao", () => {
    expect(projecao([], null, curva)).toBeNull();
    expect(projecao([sp(1, 96)], null, curva)).toBeNull();
    expect(projecao([], ritmo([sp(1, 96), sp(2, 95)], 4), curva)).toBeNull();
  });
});

describe("perdido", () => {
  it("conta a partir do peso inicial do plano", () => {
    expect(perdido([sp(1, 95.5), sp(2, 94.5)], p.pesoInicial)).toBeCloseTo(1.5, 10);
  });

  it("sem pesagem nao ha o que contar", () => {
    expect(perdido([], p.pesoInicial)).toBeNull();
  });
});

describe("faixa segura", () => {
  it("da 0,48 a 0,67 kg por semana sobre 96 kg", () => {
    const [piso, teto] = faixaSeguraKg(p, p.pesoInicial);
    expect(piso).toBeCloseTo(0.48, 10);
    expect(teto).toBeCloseTo(0.672, 10);
  });
});

describe("autorregulacao", () => {
  const regra = p.autorregulacao;

  it("duas semanas acima do alvo mandam antecipar o bloco", () => {
    const r = acao([sp(3, 95.4, 94.5), sp(4, 94.8, 94.0)], regra);
    expect(r.codigo).toBe("antecipar");
    expect(r.texto).toBe("Antecipe o próximo bloco");
  });

  it("duas semanas abaixo do alvo mandam voltar um bloco", () => {
    const r = acao([sp(3, 93.8, 94.5), sp(4, 93.2, 94.0)], regra);
    expect(r.codigo).toBe("voltar");
    expect(r.texto).toBe("Volte um bloco");
  });

  it("sequencia alternada segue o cronograma", () => {
    const r = acao([sp(3, 95.4, 94.5), sp(4, 93.2, 94.0)], regra);
    expect(r.codigo).toBe("seguir");
  });

  it("desvio de exatamente 0,5 nao dispara nada", () => {
    const r = acao([sp(3, 95.0, 94.5), sp(4, 94.5, 94.0)], regra);
    expect(r.codigo).toBe("seguir");
  });

  it("so a ultima janela conta", () => {
    const serie = [sp(1, 97, 95.5), sp(2, 96.5, 95), sp(3, 94.5, 94.5), sp(4, 94.0, 94.0)];
    expect(acao(serie, regra).codigo).toBe("seguir");
  });

  it("menos de duas pesagens pedem mais dados", () => {
    expect(acao([], regra).codigo).toBe("aguardar");
    expect(acao([sp(1, 96, 95.5)], regra).texto).toBe("Registre 2 semanas");
  });
});

describe("semanasPesadas", () => {
  const pesagem = (data: string, peso: number, cintura: number | null = null): Pesagem => ({ data, peso, cintura });

  it("casa a pesagem com a semana da curva e calcula o desvio", () => {
    const s = semanasPesadas([pesagem("2026-08-24", 95.8, 94.2)], curva);
    expect(s).toHaveLength(1);
    expect(s[0]!.n).toBe(1);
    expect(s[0]!.alvo).toBe(95.5);
    expect(s[0]!.desvio).toBeCloseTo(0.3, 10);
    expect(s[0]!.cintura).toBe(94.2);
  });

  it("uma pesagem no meio da semana conta para aquela semana", () => {
    const s = semanasPesadas([pesagem("2026-08-27", 95.0)], curva);
    expect(s[0]!.n).toBe(1);
  });

  it("duas pesagens na mesma semana viram a mais recente", () => {
    const s = semanasPesadas([pesagem("2026-08-24", 96), pesagem("2026-08-26", 95.2)], curva);
    expect(s).toHaveLength(1);
    expect(s[0]!.peso).toBe(95.2);
  });

  it("pesagem anterior a semana 1 fica de fora", () => {
    expect(semanasPesadas([pesagem("2026-08-20", 96)], curva)).toHaveLength(0);
  });

  it("devolve em ordem de semana, mesmo com entrada bagunçada", () => {
    const s = semanasPesadas([pesagem("2026-09-07", 94.6), pesagem("2026-08-24", 95.8)], curva);
    expect(s.map((x) => x.n)).toEqual([1, 3]);
  });

  it("serie real de tres semanas produz ritmo, projecao e acao coerentes", () => {
    const s = semanasPesadas(
      [pesagem("2026-08-24", 95.8), pesagem("2026-08-31", 95.3), pesagem("2026-09-07", 94.9)],
      curva,
    );
    const r = ritmo(s, p.regressaoPontos)!;
    expect(r.inclinacao).toBeLessThan(0);
    expect(r.pontos).toBe(3);
    expect(projecao(s, r, curva)).toBeLessThan(94.9);
    expect(acao(s, p.autorregulacao).codigo).toBe("seguir");
  });
});
