import { describe, expect, it } from "vitest";
import { alvoDaRefeicao, porcaoFixa, resolver, separar } from "./calculadora.ts";
import { macros, type Tabela } from "./macros.ts";
import { plano } from "../data/plano.ts";

const tabela = plano.alimentos;
const p = plano.parametros;

const ref1230 = plano.dias.A!.t11!.refs.find((r) => r.h === "12:30")!;
const ref0745 = plano.dias.A!.t11!.refs.find((r) => r.h === "07:45")!;

function quantidadeDe(itens: readonly { nome: string; quantidade: number }[], nome: string): number {
  return itens.find((i) => i.nome === nome)?.quantidade ?? 0;
}

describe("separar fixos de variaveis", () => {
  it("leite e volume livre entram fixos, o resto vai para o solver", () => {
    const { fixos, variaveis } = separar(
      tabela,
      ["Whey concentrado", "Leite integral", "Legumes cozidos", "Banana prata"],
      p,
    );
    expect(fixos).toEqual([
      { nome: "Leite integral", quantidade: 250 },
      { nome: "Legumes cozidos", quantidade: 200 },
    ]);
    expect(variaveis).toEqual(["Whey concentrado", "Banana prata"]);
  });

  it("folha tem porcao propria, menor que a de legume", () => {
    expect(porcaoFixa(tabela, "Alface e folhas", p)).toBe(100);
    expect(porcaoFixa(tabela, "Legumes cozidos", p)).toBe(200);
    expect(porcaoFixa(tabela, "Leite integral", p)).toBe(250);
  });

  it("alimento sem porcao definida cai na porcao minima", () => {
    expect(porcaoFixa(tabela, "Peito de frango grelhado", p)).toBe(p.solver.minimoG);
  });

  it("reclama de alimento fora da tabela", () => {
    expect(() => separar(tabela, ["Picanha"], p)).toThrow(/fora da tabela/);
  });
});

describe("caso a: frango, arroz e azeite contra a refeicao das 12:30", () => {
  const r = resolver(tabela, {
    alvo: alvoDaRefeicao(ref1230.m),
    variaveis: ["Peito de frango grelhado", "Arroz branco cozido", "Azeite"],
    fixos: [
      { nome: "Feijão carioca cozido", quantidade: 150 },
      { nome: "Legumes cozidos", quantidade: 200 },
    ],
    parametros: p,
  });

  it("reproduz as quantidades do plano com erro maximo de 5 g", () => {
    expect(Math.abs(quantidadeDe(r.itens, "Peito de frango grelhado") - 170)).toBeLessThanOrEqual(5);
    expect(Math.abs(quantidadeDe(r.itens, "Arroz branco cozido") - 215)).toBeLessThanOrEqual(5);
    expect(Math.abs(quantidadeDe(r.itens, "Azeite") - 13)).toBeLessThanOrEqual(5);
  });

  it("converge bem antes do teto de iteracoes", () => {
    expect(r.iteracoes).toBeLessThan(p.solver.iteracoes);
    expect(r.descartados).toEqual([]);
  });

  it("o total exibido e o macro real das gramas exibidas", () => {
    const soma = r.itens.reduce((s, i) => s + i.m.p, 0);
    expect(r.total.p).toBeCloseTo(soma, 10);
    expect(r.total.kcal).toBeCloseTo(4 * r.total.p + 4 * r.total.c + 9 * r.total.g, 10);
  });

  it("nao sobra aviso quando o alvo foi atingido", () => {
    expect(r.avisos).toEqual([]);
  });
});

describe("caso a sem nada fixo", () => {
  it("compensa a falta de feijao com mais arroz, sem inventar carboidrato", () => {
    const r = resolver(tabela, {
      alvo: alvoDaRefeicao(ref1230.m),
      variaveis: ["Peito de frango grelhado", "Arroz branco cozido", "Azeite"],
      parametros: p,
    });
    // arroz e a unica fonte de carboidrato disponivel, entao a quantidade sobe
    expect(quantidadeDe(r.itens, "Arroz branco cozido")).toBeGreaterThan(300);
    expect(Math.abs(r.residuo.c)).toBeLessThan(2);
    expect(Math.abs(r.residuo.p)).toBeLessThan(2);
  });
});

describe("caso b: so proteina selecionada", () => {
  const r = resolver(tabela, {
    alvo: alvoDaRefeicao(ref1230.m),
    variaveis: ["Peito de frango grelhado"],
    parametros: p,
  });

  it("nao gera quantidade negativa nem NaN", () => {
    for (const i of r.itens) {
      expect(Number.isFinite(i.quantidade)).toBe(true);
      expect(i.quantidade).toBeGreaterThan(0);
    }
    expect(Number.isFinite(r.total.kcal)).toBe(true);
    expect(Number.isFinite(r.residuo.c)).toBe(true);
  });

  it("acerta a proteina e avisa do que falta", () => {
    expect(Math.abs(r.residuo.p)).toBeLessThan(2);
    expect(r.avisos.map((a) => a.tipo)).toContain("carb");
    expect(r.avisos.map((a) => a.tipo)).toContain("azeite");
  });
});

describe("caso c: whey e banana com leite fixo", () => {
  const { fixos, variaveis } = separar(tabela, ["Whey concentrado", "Banana prata", "Leite integral"], p);
  const r = resolver(tabela, { alvo: alvoDaRefeicao(ref0745.m), variaveis, fixos, parametros: p });

  it("mantem o leite fixo em 250 ml e resolve o resto", () => {
    expect(r.itens.find((i) => i.nome === "Leite integral")).toMatchObject({ quantidade: 250, fixo: true });
    expect(quantidadeDe(r.itens, "Whey concentrado")).toBeGreaterThan(0);
    expect(quantidadeDe(r.itens, "Banana prata")).toBeGreaterThan(0);
  });

  it("fecha proteina e carboidrato, e avisa da gordura que falta sem a aveia", () => {
    expect(Math.abs(r.residuo.p)).toBeLessThan(2);
    expect(Math.abs(r.residuo.c)).toBeLessThan(2);
    expect(r.avisos.map((a) => a.tipo)).toContain("azeite");
  });
});

describe("caso d: alimento com macro zero na categoria", () => {
  it("mel como carboidrato sem gordura nao divide por zero", () => {
    const r = resolver(tabela, {
      alvo: macros(40, 60, 0),
      variaveis: ["Mel", "Peito de frango grelhado"],
      parametros: p,
    });
    for (const i of r.itens) expect(Number.isFinite(i.quantidade)).toBe(true);
    // o mel para no teto por refeicao, entao sobra carboidrato faltando de proposito
    expect(quantidadeDe(r.itens, "Mel")).toBe(p.maximos.Mel);
    expect(r.residuo.c).toBeGreaterThan(0);
  });

  it("alimento com todos os macros zerados sai com quantidade zero, sem NaN", () => {
    const sintetica: Tabela = {
      Agua: [0, 0, 0, 0, "livre", "g"],
      Frango: [32, 0, 2.5, 0, "prot", "g"],
    };
    const r = resolver(sintetica, {
      alvo: macros(32, 0, 2.5),
      variaveis: ["Agua", "Frango"],
      parametros: p,
    });
    expect(quantidadeDe(r.itens, "Agua")).toBe(0);
    expect(quantidadeDe(r.itens, "Frango")).toBe(100);
    expect(Number.isFinite(r.total.kcal)).toBe(true);
  });
});

describe("porcao minima e arredondamento", () => {
  it("alimento que o solver quer em quantidade minuscula e descartado", () => {
    // 3,6 g de arroz fechariam o carboidrato, mas isso e menos que a porcao minima
    const r = resolver(tabela, {
      alvo: macros(32, 1, 2.5),
      variaveis: ["Peito de frango grelhado", "Arroz branco cozido"],
      parametros: p,
    });
    expect(r.descartados).toContain("Arroz branco cozido");
    expect(quantidadeDe(r.itens, "Arroz branco cozido")).toBe(0);
    expect(quantidadeDe(r.itens, "Peito de frango grelhado")).toBeGreaterThan(0);
  });

  it("toda quantidade sai em multiplo de 5 g ou 10 ml", () => {
    const r = resolver(tabela, {
      alvo: alvoDaRefeicao(ref0745.m),
      variaveis: ["Whey concentrado", "Banana prata", "Aveia em flocos", "Azeite"],
      parametros: p,
    });
    for (const i of r.itens.filter((x) => !x.fixo)) {
      const passo = i.unidade === "ml" ? p.solver.passoMl : p.solver.passoG;
      expect(i.quantidade % passo, `${i.nome} = ${i.quantidade}`).toBe(0);
    }
  });

  it("alvo zerado nao pede nada", () => {
    const r = resolver(tabela, { alvo: macros(0, 0, 0), variaveis: ["Peito de frango grelhado"], parametros: p });
    expect(r.itens).toEqual([]);
    expect(r.total.kcal).toBe(0);
    expect(r.avisos).toEqual([]);
  });

  it("sem alimento nenhum devolve o alvo inteiro como residuo", () => {
    const r = resolver(tabela, { alvo: macros(50, 60, 20), variaveis: [], parametros: p });
    expect(r.total.kcal).toBe(0);
    expect(r.residuo.p).toBe(50);
    expect(r.iteracoes).toBe(0);
  });
});

describe("teto por refeicao e fontes por categoria", () => {
  const proteinas = Object.entries(tabela)
    .filter(([, dados]) => dados[4] === "prot")
    .map(([nome]) => nome);

  it("nao resolve o almoço com 75 g de whey", () => {
    const r = resolver(tabela, { alvo: macros(70, 78, 16), variaveis: proteinas, parametros: p });
    expect(quantidadeDe(r.itens, "Whey concentrado")).toBeLessThanOrEqual(p.maximos["Whey concentrado"]!);
    for (const item of r.itens) {
      const teto = p.maximos[item.nome];
      if (teto !== undefined) expect(item.quantidade, item.nome).toBeLessThanOrEqual(teto);
    }
  });

  it("não monta prato com mais de duas fontes da mesma categoria", () => {
    const r = resolver(tabela, {
      alvo: macros(70, 78, 16),
      variaveis: [...proteinas, "Arroz branco cozido", "Batata doce cozida", "Azeite"],
      parametros: p,
    });
    const porCategoria = new Map<string, number>();
    for (const item of r.itens) {
      const cat = tabela[item.nome]![4];
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + 1);
    }
    for (const [cat, quantas] of porCategoria) {
      expect(quantas, cat).toBeLessThanOrEqual(p.solver.maxPorCategoria);
    }
  });

  it("com uma fonte de cada macro, fecha o alvo", () => {
    const r = resolver(tabela, {
      alvo: macros(70, 78, 16),
      variaveis: [...proteinas, "Arroz branco cozido", "Azeite"],
      parametros: p,
    });
    expect(Math.abs(r.residuo.p)).toBeLessThan(3);
    expect(Math.abs(r.residuo.c)).toBeLessThan(3);
    expect(Math.abs(r.residuo.g)).toBeLessThan(3);
    expect(r.avisos).toEqual([]);
  });

  it("diz o que marcar quando falta a fonte inteira de um macro", () => {
    const r = resolver(tabela, { alvo: macros(70, 78, 16), variaveis: proteinas, parametros: p });
    const carb = r.avisos.find((a) => a.tipo === "carb");
    expect(carb?.texto).toMatch(/não marcou nenhuma fonte/);
    expect(carb?.texto).toMatch(/arroz, batata doce, pão ou uma fruta/);
  });

  it("com fonte marcada, o aviso é outro", () => {
    const r = resolver(tabela, {
      // mel e a unica fonte de carboidrato e tem teto de 40 g, entao falta mesmo
      alvo: macros(70, 200, 16),
      variaveis: ["Peito de frango grelhado", "Mel"],
      parametros: p,
    });
    const carb = r.avisos.find((a) => a.tipo === "carb");
    expect(carb?.texto).toMatch(/não fecha o alvo/);
  });
});

describe("avisos", () => {
  it("avisa quando sobra gordura, com o custo em kcal", () => {
    // 60 g de proteina de salmao arrastam 32 g de gordura, bem acima dos 5 do alvo
    const r = resolver(tabela, {
      alvo: macros(60, 0, 5),
      variaveis: ["Salmão grelhado"],
      parametros: p,
    });
    const gord = r.avisos.find((a) => a.tipo === "gord");
    expect(gord).toBeDefined();
    expect(gord!.texto).toMatch(/kcal a mais/);
  });

  it("nao sugere azeite quando ja existe gordura na selecao", () => {
    const r = resolver(tabela, {
      alvo: macros(50, 40, 20),
      variaveis: ["Peito de frango grelhado", "Arroz branco cozido", "Azeite"],
      parametros: p,
    });
    expect(r.avisos.map((a) => a.tipo)).not.toContain("azeite");
  });

  it("sugere azeite em multiplo de 5 g quando falta gordura", () => {
    const r = resolver(tabela, {
      alvo: macros(50, 40, 20),
      variaveis: ["Peito de frango grelhado", "Arroz branco cozido"],
      parametros: p,
    });
    const azeite = r.avisos.find((a) => a.tipo === "azeite");
    expect(azeite).toBeDefined();
    expect(azeite!.texto).toMatch(/\d+ g de azeite resolvem/);
  });

  it("avisa proteina faltando acima do limite", () => {
    const r = resolver(tabela, {
      alvo: macros(60, 30, 10),
      variaveis: ["Arroz branco cozido"],
      parametros: p,
    });
    expect(r.avisos.map((a) => a.tipo)).toContain("prot");
  });
});
