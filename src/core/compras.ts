import type { CodBloco, CodModelo, DiaModelo, Parametros, Plano } from "../data/schema.ts";
import { parseQuantidade, type Tabela } from "./macros.ts";

/**
 * Lista de compras derivada do plano, nao digitada.
 *
 * A conta e sempre a mesma:
 *   pronto_semana = soma das quantidades da refeicao vezes quantas vezes o modelo
 *                   aparece na semana padrao
 *   pronto_folga  = pronto_semana x (1 + folgaCompras)
 *   comprar       = pronto_folga / rendimento
 *
 * O usuario pesa pronto e compra cru. O rendimento faz essa ponte.
 */

export interface ItemDerivado {
  /** Nome na tabela de alimentos, sempre o pronto. */
  alimento: string;
  /** Nome no mercado, o que vai na lista. */
  nome: string;
  secao: string;
  unidade: "g" | "ml";
  prontoSemana: number;
  prontoFolga: number;
  /** Quantidade a comprar, ja com folga e rendimento aplicados. */
  comprar: number;
  /** Embalagens inteiras, arredondadas para cima, quando o item e vendido em unidades. */
  unidades: number | null;
  texto: string;
  extra: string | null;
  nota: string | null;
}

export interface SecaoCompras {
  secao: string;
  itens: ItemDerivado[];
}

export interface ListaCompras {
  bloco: CodBloco;
  periodo: string;
  secoes: SecaoCompras[];
}

/** Quanto de cada alimento pronto a semana padrao consome, em g ou ml. */
export function consumoSemana(
  dias: Readonly<Record<CodModelo, DiaModelo>>,
  semanaPadrao: Readonly<Partial<Record<CodModelo, number>>>,
): Map<string, number> {
  const total = new Map<string, number>();
  for (const [cod, vezes] of Object.entries(semanaPadrao) as [CodModelo, number][]) {
    const modelo = dias[cod];
    if (!modelo) throw new Error(`modelo de dia ausente: ${cod}`);
    for (const ref of modelo.refs) {
      for (const item of ref.itens) {
        const q = parseQuantidade(item.q) * vezes;
        total.set(item.n, (total.get(item.n) ?? 0) + q);
      }
    }
  }
  return total;
}

function nf(x: number, casas: number): string {
  return x.toFixed(casas).replace(".", ",");
}

/** 988 vira "988 g", 1898 vira "1,90 kg", 4061 ml vira "4,06 L". */
export function formatarQuantidade(valor: number, unidade: "g" | "ml"): string {
  if (unidade === "ml") {
    return valor >= 1000 ? `${nf(valor / 1000, 2)} L` : `${Math.round(valor)} ml`;
  }
  return valor >= 1000 ? `${nf(valor / 1000, 2)} kg` : `${Math.round(valor)} g`;
}

function plural(unidade: string, n: number): string {
  if (n === 1 || unidade === "un") return unidade;
  return `${unidade}s`;
}

/** Lista de compras de um bloco, agrupada por secao de mercado. */
export function listaDeCompras(plano: Plano, bloco: CodBloco): ListaCompras {
  const dias = plano.dias[bloco];
  if (!dias) throw new Error(`bloco sem modelos de dia: ${bloco}`);
  const p: Parametros = plano.parametros;
  const tabela: Tabela = plano.alimentos;
  const consumo = consumoSemana(dias, p.semanaPadrao);

  const itens: ItemDerivado[] = [];
  for (const [alimento, prontoSemana] of consumo) {
    const dados = tabela[alimento];
    if (!dados) throw new Error(`alimento fora da tabela: ${alimento}`);
    const mercado = p.mercado[alimento];
    const rendimento = p.rendimento[alimento] ?? 1;
    const embalagem = p.embalagens[alimento];
    // o azeite e pesado em g no prato e vendido em ml no mercado; o rendimento faz a ponte
    const unidade = mercado?.unidadeCompra ?? dados[5];

    const prontoFolga = prontoSemana * (1 + p.folgaCompras);
    const comprar = prontoFolga / rendimento;
    const unidades = embalagem ? Math.ceil(comprar / embalagem.porcao) : null;

    let texto: string;
    let extra: string | null = null;
    if (embalagem && unidades !== null) {
      if (embalagem.mostrar === "unidades") {
        texto = `${unidades} ${plural(embalagem.unidade, unidades)}`;
      } else {
        texto = formatarQuantidade(comprar, unidade);
        extra = `${unidades} ${plural(embalagem.unidade, unidades)}`;
      }
    } else {
      texto = formatarQuantidade(comprar, unidade);
    }

    let nota: string | null = null;
    if (embalagem) nota = embalagem.rotulo;
    else if (mercado?.notaRendimento === "rende") nota = `rende ${formatarQuantidade(prontoFolga, dados[5])} prontos`;
    else if (mercado?.notaRendimento === "casca") nota = "peso com casca";
    else if (mercado?.nota) nota = mercado.nota;

    itens.push({
      alimento,
      nome: mercado?.nome ?? alimento,
      secao: mercado?.secao ?? "Outros",
      unidade,
      prontoSemana,
      prontoFolga,
      comprar,
      unidades,
      texto,
      extra,
      nota,
    });
  }

  const ordem = new Map(p.secoes.map((s, i) => [s, i]));
  const porSecao = new Map<string, ItemDerivado[]>();
  for (const item of itens) {
    const lista = porSecao.get(item.secao);
    if (lista) lista.push(item);
    else porSecao.set(item.secao, [item]);
  }

  const secoes: SecaoCompras[] = [...porSecao.entries()]
    .sort((a, b) => (ordem.get(a[0]) ?? 999) - (ordem.get(b[0]) ?? 999) || a[0].localeCompare(b[0], "pt-BR"))
    .map(([secao, lista]) => ({
      secao,
      itens: lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }));

  const periodo = plano.blocos.find((b) => b.cod === bloco)?.periodo ?? "";
  return { bloco, periodo, secoes };
}

/** Achata a lista em itens, na ordem em que aparecem na tela. */
export function itensDaLista(lista: ListaCompras): ItemDerivado[] {
  return lista.secoes.flatMap((s) => s.itens);
}
