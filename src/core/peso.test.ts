import { describe, expect, it } from "vitest";
import {
  acao,
  faixaSeguraKg,
  perdido,
  pontosReais,
  projecao,
  resumoPlano,
  ritmo,
  ritmosPorIntervalo,
  semanasPesadas,
  semanasReais,
  type Pesagem,
  type SemanaPesada,
} from "./peso.ts";
import { plano } from "../data/plano.ts";

const p = plano.parametros;
const curva = plano.curva;

/** Semana n da curva real com um peso sintetico. O relogio e a segunda-feira daquela semana. */
function sem(n: number, peso: number, alvo = peso): SemanaPesada {
  const ponto = curva[n - 1]!;
  return { n, iso: ponto.iso, data: ponto.iso, peso, cintura: null, alvo, desvio: peso - alvo };
}

/** Peso que cai exatamente `kgPorSemana` desde a partida, na semana n. */
function naLinha(n: number, kgPorSemana: number): number {
  return p.pesoInicial - kgPorSemana * semanasReais(p.partida.iso, curva[n - 1]!.iso);
}

describe("tempo real", () => {
  it("a semana 1 fica a 2 dias da partida e a semana 2 a 9", () => {
    expect(semanasReais(p.partida.iso, curva[0]!.iso)).toBeCloseTo(2 / 7, 10);
    expect(semanasReais(p.partida.iso, curva[1]!.iso)).toBeCloseTo(9 / 7, 10);
  });

  it("a partida entra como ponto zero, com o peso inicial", () => {
    const pontos = pontosReais([sem(2, 95.1)], p);
    expect(pontos).toHaveLength(2);
    expect(pontos[0]).toEqual({ t: 0, peso: p.pesoInicial });
    expect(pontos[1]!.t).toBeCloseTo(9 / 7, 10);
  });
});

describe("resumo do plano", () => {
  it("mede perda, duracao e ritmo da partida ao fechamento", () => {
    const r = resumoPlano(p);
    expect(r.perda).toBeCloseTo(p.pesoInicial - p.fechamento.peso, 10);
    expect(r.semanas).toBeCloseTo(60 / 7, 10);
    expect(r.ritmo).toBeCloseTo(r.perda / r.semanas, 10);
    expect(r.ritmo).toBeGreaterThan(0.7);
    expect(r.ritmo).toBeLessThan(0.75);
  });
});

describe("ritmo", () => {
  it("pontos em linha reta desde a partida devolvem a inclinacao exata", () => {
    const serie = [sem(1, naLinha(1, 0.7)), sem(2, naLinha(2, 0.7)), sem(3, naLinha(3, 0.7))];
    const r = ritmo(serie, p);
    expect(r).not.toBeNull();
    expect(r!.inclinacao).toBeCloseTo(-0.7, 10);
    expect(r!.r2).toBeCloseTo(1, 10);
    expect(r!.pontos).toBe(4); // tres pesagens mais a partida
  });

  it("usa so os ultimos pontos pedidos, e ai a partida sai da conta", () => {
    // semanas 1 e 2 paradas, depois cai 0,4 por semana
    const serie = [sem(1, 96), sem(2, 96), sem(3, 95.6), sem(4, 95.2), sem(5, 94.8)];
    const r = ritmo(serie, p)!;
    expect(r.pontos).toBe(p.regressaoPontos);
    expect(r.inclinacao).toBeCloseTo(-0.4, 10);
    expect(ritmo(serie, { ...p, regressaoPontos: 6 })!.inclinacao).toBeGreaterThan(-0.4);
  });

  it("sem pesagem nao tem ritmo", () => {
    expect(ritmo([], p)).toBeNull();
  });

  it("so a semana 1 nao tem ritmo: sao 2 dias desde a partida", () => {
    expect(ritmo([sem(1, 95.5)], p)).toBeNull();
  });

  it("so a semana 2 ja tem ritmo, medido contra a partida", () => {
    const r = ritmo([sem(2, naLinha(2, 0.7))], p)!;
    expect(r.inclinacao).toBeCloseTo(-0.7, 10);
    expect(r.pontos).toBe(2);
  });

  it("serie irregular derruba o R2", () => {
    const r = ritmo([sem(2, 94), sem(3, 95.8), sem(4, 94.2)], p);
    expect(r!.inclinacao).toBeLessThan(0);
    expect(r!.r2).toBeLessThan(0.7);
  });

  it("peso parado da inclinacao zero e R2 cheio", () => {
    const r = ritmo([sem(1, 96), sem(2, 96), sem(3, 96)], p);
    expect(r!.inclinacao).toBeCloseTo(0, 10);
    expect(r!.r2).toBe(1);
  });

  it("ganho de peso da inclinacao positiva", () => {
    expect(ritmo([sem(2, 97.7)], p)!.inclinacao).toBeGreaterThan(1);
  });
});

describe("projecao", () => {
  it("estende o ritmo ate a data de fechamento, em semanas reais", () => {
    const serie = [sem(1, naLinha(1, 0.7)), sem(2, naLinha(2, 0.7)), sem(3, naLinha(3, 0.7))];
    const r = ritmo(serie, p)!;
    // da segunda 16/11 ao fechamento em 30/12 sao 44 dias
    expect(projecao(serie, r, p)).toBeCloseTo(naLinha(3, 0.7) - (0.7 * 44) / 7, 10);
  });

  it("a ultima segunda fica a 2 dias do fechamento, nao a uma semana", () => {
    const ultima = [sem(9, 90)];
    const r = { inclinacao: -0.7, r2: 1, pontos: 4 };
    expect(projecao(ultima, r, p)).toBeCloseTo(90 - (0.7 * 2) / 7, 10);
  });

  it("pesagem depois do fechamento nao projeta para tras", () => {
    const encerrado = { ...p, fechamento: { ...p.fechamento, iso: "2026-11-10" } };
    expect(projecao([sem(3, 94.4)], { inclinacao: -0.7, r2: 1, pontos: 3 }, encerrado)).toBe(94.4);
  });

  it("sem ritmo ou sem pesagem nao ha projecao", () => {
    expect(projecao([], null, p)).toBeNull();
    expect(projecao([sem(1, 96)], null, p)).toBeNull();
    expect(projecao([], { inclinacao: -0.7, r2: 1, pontos: 2 }, p)).toBeNull();
  });
});

describe("perdido", () => {
  it("conta a partir do peso inicial do plano", () => {
    expect(perdido([sem(1, 95.5), sem(2, 94.5)], p.pesoInicial)).toBeCloseTo(1.5, 10);
  });

  it("sem pesagem nao ha o que contar", () => {
    expect(perdido([], p.pesoInicial)).toBeNull();
  });
});

describe("faixa segura", () => {
  it("vai de 0,48 kg por semana ao teto de 0,9 do plano v2, sobre 96 kg", () => {
    const [piso, teto] = faixaSeguraKg(p, p.pesoInicial);
    expect(piso).toBeCloseTo(0.48, 10);
    expect(teto).toBeCloseTo(0.9024, 10);
    expect(teto).toBeGreaterThanOrEqual(p.ritmo.rapidoKg);
  });
});

describe("ritmo por intervalo", () => {
  it("sem pesagem nao ha intervalo", () => {
    expect(ritmosPorIntervalo([], p)).toEqual([]);
  });

  it("a semana 1 sozinha e pulada: 2 dias viram ruido", () => {
    expect(ritmosPorIntervalo([sem(1, 95.5)], p)).toEqual([]);
  });

  it("semanas 1 e 2 dao um intervalo so, da partida ate a semana 2", () => {
    const r = ritmosPorIntervalo([sem(1, 95.8), sem(2, naLinha(2, 0.7))], p);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(-0.7, 10);
  });

  it("de segunda em segunda cada intervalo tem 7 dias", () => {
    const r = ritmosPorIntervalo([sem(2, 95.1), sem(3, 94.6), sem(4, 93.8)], p);
    expect(r).toHaveLength(3);
    expect(r[1]).toBeCloseTo(-0.5, 10);
    expect(r[2]).toBeCloseTo(-0.8, 10);
  });

  it("semana pulada estica o intervalo em vez de inventar ritmo", () => {
    const r = ritmosPorIntervalo([sem(2, 95), sem(4, 94)], p);
    expect(r[1]).toBeCloseTo(-0.5, 10); // 1 kg em 14 dias
  });
});

describe("leitura do ritmo", () => {
  it("sem intervalo medido pede mais dados", () => {
    expect(acao([], p).codigo).toBe("aguardar");
    const umaSemana = acao([sem(1, 95.5)], p);
    expect(umaSemana.codigo).toBe("aguardar");
    expect(umaSemana.texto).toBe("Registre duas semanas");
    expect(umaSemana.alerta).toBe(false);
  });

  it("um intervalo so da leitura parcial, sem alerta", () => {
    const emDia = acao([sem(1, 95.8), sem(2, naLinha(2, 0.7))], p);
    expect(emDia.codigo).toBe("parcial");
    expect(emDia.texto).toBe("No ritmo, 1 semana medida");
    expect(emDia.alerta).toBe(false);
    expect(emDia.detalhe).toContain("−0,70");

    const devagar = acao([sem(2, 95.8)], p);
    expect(devagar.codigo).toBe("parcial");
    expect(devagar.texto).toBe("Abaixo do ritmo, 1 semana medida");
  });

  it("dois intervalos sem perda sao peso parado", () => {
    const r = acao([sem(1, 96), sem(2, 96), sem(3, 95.9)], p);
    expect(r.codigo).toBe("parado");
    expect(r.texto).toBe("Parado há 2 semanas: fale com o coach");
    expect(r.alerta).toBe(true);
  });

  it("dois intervalos acima de 0,9 kg por semana mandam voltar ao cardapio B", () => {
    const r = acao([sem(2, 94.5), sem(3, 93.4), sem(4, 92.4)], p);
    expect(r.codigo).toBe("rapido");
    expect(r.texto).toBe("Rápido demais: volte ao cardápio B");
    expect(r.alerta).toBe(true);
  });

  it("acima do alvo mas perdendo 0,7 por semana segue o cronograma", () => {
    // 0,7 kg acima da curva nas tres semanas: a regra antiga, por desvio, chamaria de parado
    const r = acao([sem(2, 95.8, 95.1), sem(3, 95.1, 94.4), sem(4, 94.4, 93.7)], p);
    expect(r.codigo).toBe("seguir");
    expect(r.texto).toBe("Siga o cronograma");
    expect(r.alerta).toBe(false);
  });

  it("abaixo do alvo e no ritmo certo tambem segue o cronograma", () => {
    const r = acao([sem(2, 94.4, 95.1), sem(3, 93.7, 94.4), sem(4, 93.0, 93.7)], p);
    expect(r.codigo).toBe("seguir");
  });

  it("perda pequena mas real fica abaixo do ritmo, nao parada", () => {
    const r = acao([sem(2, 95.7), sem(3, 95.4), sem(4, 95.1)], p);
    expect(r.codigo).toBe("abaixo");
    expect(r.texto).toBe("Abaixo do ritmo: confira doce e caminhada");
    expect(r.alerta).toBe(true);
  });

  it("so os dois ultimos intervalos contam", () => {
    // comecou parado, depois engrenou
    const r = acao([sem(2, 96), sem(3, 96), sem(4, 95.3), sem(5, 94.6)], p);
    expect(r.codigo).toBe("seguir");
  });

  it("ganho de peso aparece no detalhe com sinal de mais", () => {
    const r = acao([sem(2, 96.5), sem(3, 97)], p);
    expect(r.codigo).toBe("parado");
    expect(r.detalhe).toContain("+0,50");
  });

  it("intervalo sem variacao aparece sem sinal", () => {
    const r = acao([sem(2, 96), sem(3, 96)], p);
    expect(r.detalhe).toContain("0,00 e 0,00");
  });
});

describe("semanasPesadas", () => {
  const pesagem = (data: string, peso: number, cintura: number | null = null): Pesagem => ({ data, peso, cintura });

  it("casa a pesagem com a semana da curva e calcula o desvio", () => {
    const s = semanasPesadas([pesagem("2026-11-02", 96.1, 94.2)], curva);
    expect(s).toHaveLength(1);
    expect(s[0]!.n).toBe(1);
    expect(s[0]!.iso).toBe("2026-11-02");
    expect(s[0]!.alvo).toBe(95.8);
    expect(s[0]!.desvio).toBeCloseTo(0.3, 10);
    expect(s[0]!.cintura).toBe(94.2);
  });

  it("uma pesagem no meio da semana conta para aquela semana, com o relogio na segunda", () => {
    const s = semanasPesadas([pesagem("2026-11-05", 95.0)], curva);
    expect(s[0]!.n).toBe(1);
    expect(s[0]!.iso).toBe("2026-11-02");
    expect(s[0]!.data).toBe("2026-11-05");
  });

  it("duas pesagens na mesma semana viram a mais recente", () => {
    const s = semanasPesadas([pesagem("2026-11-02", 96), pesagem("2026-11-04", 95.2)], curva);
    expect(s).toHaveLength(1);
    expect(s[0]!.peso).toBe(95.2);
  });

  it("a mais antiga nao sobrescreve a mais recente, em qualquer ordem de chegada", () => {
    const s = semanasPesadas([pesagem("2026-11-04", 95.2), pesagem("2026-11-02", 96)], curva);
    expect(s[0]!.peso).toBe(95.2);
  });

  it("pesagem anterior a semana 1 fica de fora", () => {
    expect(semanasPesadas([pesagem("2026-10-31", 96)], curva)).toHaveLength(0);
  });

  it("devolve em ordem de semana, mesmo com entrada bagunçada", () => {
    const s = semanasPesadas([pesagem("2026-11-16", 94.6), pesagem("2026-11-02", 95.8)], curva);
    expect(s.map((x) => x.n)).toEqual([1, 3]);
  });

  it("serie real de tres semanas produz ritmo, projecao e leitura coerentes", () => {
    const s = semanasPesadas(
      [pesagem("2026-11-02", 95.8), pesagem("2026-11-09", 95.1), pesagem("2026-11-16", 94.4)],
      curva,
    );
    const r = ritmo(s, p)!;
    expect(r.inclinacao).toBeCloseTo(-0.7, 6);
    expect(r.pontos).toBe(4);
    expect(projecao(s, r, p)).toBeCloseTo(90, 1);
    expect(acao(s, p).codigo).toBe("seguir");
  });
});
