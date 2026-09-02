import { describe, expect, it } from "vitest";
import { consumoSemana, formatarQuantidade, itensDaLista, listaDeCompras } from "./compras.ts";
import { plano } from "../data/plano.ts";
import { COD_BLOCOS } from "../data/schema.ts";

const p = plano.parametros;

function itemDe(bloco: "A" | "B" | "C" | "D", alimento: string) {
  const achado = itensDaLista(listaDeCompras(plano, bloco)).find((i) => i.alimento === alimento);
  if (!achado) throw new Error(`item ausente na lista do bloco ${bloco}: ${alimento}`);
  return achado;
}

/** Diferenca relativa, em porcento. */
function erro(calculado: number, esperado: number): number {
  return (Math.abs(calculado - esperado) / esperado) * 100;
}

describe("consumoSemana", () => {
  it("multiplica cada refeicao pelas vezes que o modelo aparece na semana", () => {
    const consumo = consumoSemana(plano.dias.A!, p.semanaPadrao);
    // t11 aparece 2 vezes e usa 215 g de arroz, t1630 2 vezes com 215 g,
    // off 1 vez com 130 g, fds 2 vezes com 30 g
    expect(consumo.get("Arroz branco cozido")).toBeCloseTo(1030, 6);
    // leite: 500 ml no t11, 500 no t1630, 500 no off, 500 no fds
    expect(consumo.get("Leite integral")).toBeCloseTo(3760, 6);
  });

  it("ignora a refeicao livre, que nao tem itens", () => {
    const consumo = consumoSemana(plano.dias.A!, { fds: 1 });
    expect(consumo.has("Legumes cozidos")).toBe(true);
    expect([...consumo.values()].every((v) => v > 0)).toBe(true);
  });

  it("reclama de modelo ausente", () => {
    expect(() => consumoSemana({ ...plano.dias.A!, t11: undefined } as never, { t11: 2 })).toThrow(/ausente/);
  });
});

describe("formatarQuantidade", () => {
  it("passa para kg e L acima de 1000", () => {
    expect(formatarQuantidade(988, "g")).toBe("988 g");
    expect(formatarQuantidade(1897.7, "g")).toBe("1,90 kg");
    expect(formatarQuantidade(107, "ml")).toBe("107 ml");
    expect(formatarQuantidade(4060.8, "ml")).toBe("4,06 L");
  });
});

describe("lista derivada do bloco A", () => {
  it("reproduz os numeros conhecidos com erro menor que 2%", () => {
    expect(erro(itemDe("A", "Patinho grelhado").comprar, 988)).toBeLessThan(2);
    expect(erro(itemDe("A", "Patinho grelhado").prontoFolga, 692)).toBeLessThan(2);
    expect(erro(itemDe("A", "Peito de frango grelhado").comprar, 1900)).toBeLessThan(2);
    expect(erro(itemDe("A", "Feijão carioca cozido").comprar, 545)).toBeLessThan(2);
    expect(erro(itemDe("A", "Leite integral").comprar, 4060)).toBeLessThan(2);
    expect(erro(itemDe("A", "Aveia em flocos").comprar, 367)).toBeLessThan(2);
  });

  it("aplica a folga de 8% e o rendimento", () => {
    const patinho = itemDe("A", "Patinho grelhado");
    expect(patinho.prontoSemana).toBeCloseTo(640, 6);
    expect(patinho.prontoFolga).toBeCloseTo(640 * 1.08, 6);
    expect(patinho.comprar).toBeCloseTo((640 * 1.08) / 0.7, 6);
    expect(patinho.nota).toBe("rende 691 g prontos");
  });

  it("conta embalagens inteiras para cima", () => {
    const atum = itemDe("A", "Atum em água, drenado");
    expect(atum.comprar).toBeCloseTo(518.4, 6);
    expect(atum.unidades).toBe(5); // 518,4 / 120 = 4,32 latas
    expect(atum.texto).toBe("5 latas");

    const ovo = itemDe("A", "Ovo cozido");
    expect(ovo.unidades).toBe(5);
    expect(ovo.texto).toBe("5 un");

    const pao = itemDe("A", "Pão francês");
    expect(pao.texto).toBe("5 un");
  });

  it("azeite se pesa em g no prato e se compra em ml", () => {
    const azeite = itemDe("A", "Azeite");
    expect(azeite.unidade).toBe("ml");
    expect(azeite.prontoSemana).toBeCloseTo(90, 6);
    // 90 g por semana, mais 8% de folga, divididos pela densidade de 0,92 g por ml
    expect(azeite.comprar).toBeCloseTo((90 * 1.08) / 0.92, 6);
    expect(azeite.texto).toBe("106 ml");
  });

  it("mostra litro e caixa no leite", () => {
    const leite = itemDe("A", "Leite integral");
    expect(leite.texto).toBe("4,06 L");
    expect(leite.extra).toBe("5 caixas");
    expect(leite.nota).toBe("caixa de 1 L");
  });

  it("marca peso com casca no que se compra com casca", () => {
    expect(itemDe("A", "Banana prata").nota).toBe("peso com casca");
    expect(itemDe("A", "Batata doce cozida").nota).toBe("peso com casca");
  });

  it("agrupa por secao de mercado, na ordem do plano", () => {
    const lista = listaDeCompras(plano, "A");
    expect(lista.periodo).toBe("24/08 a 13/09");
    expect(lista.secoes.map((s) => s.secao)).toEqual([
      "Açougue",
      "Ovos",
      "Laticínios",
      "Hortifruti",
      "Mercearia",
      "Padaria",
      "Suplemento",
    ]);
    expect(lista.secoes[0]!.itens.map((i) => i.nome)).toEqual(["Patinho", "Peito de frango"]);
  });
});

describe("lista derivada dos quatro blocos", () => {
  it("cobre todos os alimentos usados no bloco e nada mais", () => {
    for (const b of COD_BLOCOS) {
      const usados = new Set<string>();
      for (const modelo of Object.values(plano.dias[b]!)) {
        for (const ref of modelo.refs) for (const it of ref.itens) usados.add(it.n);
      }
      const naLista = new Set(itensDaLista(listaDeCompras(plano, b)).map((i) => i.alimento));
      expect(naLista).toEqual(usados);
    }
  });

  it("todo item tem secao conhecida, texto e quantidade positiva", () => {
    for (const b of COD_BLOCOS) {
      for (const item of itensDaLista(listaDeCompras(plano, b))) {
        expect(p.secoes, `${b} ${item.alimento}`).toContain(item.secao);
        expect(item.comprar).toBeGreaterThan(0);
        expect(item.texto).not.toBe("");
        expect(Number.isFinite(item.comprar)).toBe(true);
      }
    }
  });

  it("o arroz cai de bloco em bloco, como o protocolo manda", () => {
    const arroz = COD_BLOCOS.map((b) => itemDe(b, "Arroz branco cozido").comprar);
    expect(arroz[0]).toBeGreaterThan(arroz[1]!);
    expect(arroz[1]).toBeGreaterThan(arroz[2]!);
    expect(arroz[2]).toBeGreaterThan(arroz[3]!);
  });

  it("a batata doce some do jantar no bloco C", () => {
    expect(itemDe("C", "Batata doce cozida").prontoSemana).toBeLessThan(
      itemDe("B", "Batata doce cozida").prontoSemana,
    );
  });

  it("reclama de bloco inexistente", () => {
    expect(() => listaDeCompras(plano, "Z" as never)).toThrow(/bloco sem modelos/);
  });
});

describe("plano incompleto", () => {
  it("alimento sem secao de mercado cai em Outros, nao some da lista", () => {
    const copia = structuredClone(plano);
    delete copia.parametros.mercado.Mel;
    delete copia.parametros.rendimento["Arroz branco cozido"];
    const lista = listaDeCompras(copia, "A");
    const mel = itensDaLista(lista).find((i) => i.alimento === "Mel")!;
    expect(mel.secao).toBe("Outros");
    expect(mel.nome).toBe("Mel");
    expect(mel.nota).toBeNull();
    expect(lista.secoes[lista.secoes.length - 1]!.secao).toBe("Outros");
    // sem rendimento cadastrado o fator vira 1, entao comprar e igual ao pronto com folga
    const arroz = itensDaLista(lista).find((i) => i.alimento === "Arroz branco cozido")!;
    expect(arroz.comprar).toBeCloseTo(arroz.prontoFolga, 6);
  });

  it("alimento fora da tabela quebra a lista", () => {
    const copia = structuredClone(plano);
    delete copia.alimentos.Mel;
    expect(() => listaDeCompras(copia, "A")).toThrow(/fora da tabela/);
  });

  it("bloco sem periodo declarado devolve periodo vazio", () => {
    const copia = structuredClone(plano);
    copia.blocos = copia.blocos.filter((b) => b.cod !== "A");
    expect(listaDeCompras(copia, "A").periodo).toBe("");
  });
});
