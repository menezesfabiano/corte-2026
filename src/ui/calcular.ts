import { blocoDe, modeloDe } from "../core/calendario.ts";
import { alvoDaRefeicao, porcaoFixa, resolver, separar, type Fixo, type Resultado } from "../core/calculadora.ts";
import { CATEGORIAS, type Categoria, type Refeicao } from "../data/schema.ts";
import { $, $$, NOMES_CATEGORIA, esc, inteiro, lerNumero, nf, type Contexto, type Tela } from "./comum.ts";

/**
 * Tela Calcular: escolhe a refeicao alvo, marca o que tem em casa e o solver
 * devolve as gramas. Quem resolve e src/core/calculadora.ts; aqui so desenha.
 */

let selecionados = new Set<string>();
const quantidadesFixas = new Map<string, number>();
let indiceRef = 0;
let barraAberta = true;

function refeicoesDoDia(ctx: Contexto): Refeicao[] {
  const data = ctx.hoje();
  const bloco = blocoDe(data, ctx.plano.faixas);
  const modelo = modeloDe(data, ctx.repo.modeloDe(data));
  return ctx.plano.dias[bloco]![modelo]!.refs.filter((r) => !r.livre);
}

function montarFixos(ctx: Contexto, nomes: readonly string[]): { fixos: Fixo[]; variaveis: string[] } {
  const { fixos, variaveis } = separar(ctx.plano.alimentos, nomes, ctx.plano.parametros);
  return {
    fixos: fixos.map((f) => ({ nome: f.nome, quantidade: quantidadesFixas.get(f.nome) ?? f.quantidade })),
    variaveis,
  };
}

function calcular(ctx: Contexto): { alvo: Refeicao | null; resultado: Resultado | null } {
  const refs = refeicoesDoDia(ctx);
  const alvo = refs[indiceRef] ?? refs[0] ?? null;
  if (!alvo || selecionados.size === 0) return { alvo, resultado: null };
  const { fixos, variaveis } = montarFixos(ctx, [...selecionados]);
  return {
    alvo,
    resultado: resolver(ctx.plano.alimentos, {
      alvo: alvoDaRefeicao(alvo.m),
      variaveis,
      fixos,
      parametros: ctx.plano.parametros,
    }),
  };
}

function chips(ctx: Contexto): string {
  const porCategoria = new Map<Categoria, string[]>();
  for (const [nome, dados] of Object.entries(ctx.plano.alimentos)) {
    const lista = porCategoria.get(dados[4]);
    if (lista) lista.push(nome);
    else porCategoria.set(dados[4], [nome]);
  }

  return CATEGORIAS.filter((c) => porCategoria.has(c))
    .map((cat) => {
      const nomes = porCategoria.get(cat)!.sort((a, b) => a.localeCompare(b, "pt-BR"));
      return `<h2>${NOMES_CATEGORIA[cat]}</h2>
        <div class="pick">${nomes
          .map(
            (n) =>
              `<button data-alimento="${esc(n)}" aria-pressed="${selecionados.has(n)}">${esc(n)}</button>`,
          )
          .join("")}</div>`;
    })
    .join("");
}

function camposFixos(ctx: Contexto): string {
  const { fixos } = montarFixos(ctx, [...selecionados]);
  if (fixos.length === 0) return "";
  return `<h2>Quantidade fixa</h2>
    <p class="lead">Leite e volume livre entram com porção padrão e saem da conta antes do solver. Ajuste se quiser.</p>
    <div class="grid2">${fixos
      .map((f) => {
        const unidade = ctx.plano.alimentos[f.nome]![5];
        return `<div><label for="fx-${esc(f.nome)}">${esc(f.nome)}, ${unidade}</label>
          <input id="fx-${esc(f.nome)}" data-fixo="${esc(f.nome)}" inputmode="decimal" value="${nf(f.quantidade)}"></div>`;
      })
      .join("")}</div>`;
}

function barra(alvo: Refeicao | null, r: Resultado | null): string {
  if (!alvo) return "";
  if (!r) {
    return `<div class="stickybar"><div class="wrap"><div class="sb-vazio">Marque o que você tem em casa.</div></div></div>`;
  }
  const alvoTexto = `alvo ${inteiro(r.alvo.p)} P · ${inteiro(r.alvo.c)} C · ${inteiro(r.alvo.g)} G · ${inteiro(r.alvo.kcal)} kcal`;
  return `<div class="stickybar${barraAberta ? " open" : ""}" id="barra"><div class="wrap">
    <div class="sb-head" id="sb-head">
      <span class="sb-ref">${esc(alvo.h)}</span>
      <span class="sb-mac">${inteiro(r.total.p)} P · ${inteiro(r.total.c)} C · ${inteiro(r.total.g)} G · ${inteiro(r.total.kcal)} kcal</span>
      <span class="sb-seta">▲</span>
    </div>
    <div class="sb-body">
      ${r.itens
        .map(
          (i) => `<div class="sb-l"><span>${esc(i.nome)}${i.fixo ? ` <small style="color:var(--mut)">fixo</small>` : ""}</span>
            <b>${inteiro(i.quantidade)} ${i.unidade}</b></div>`,
        )
        .join("")}
      ${
        r.descartados.length > 0
          ? `<div class="sb-alvo">Fora do prato: ${esc(r.descartados.join(", "))}.</div>`
          : ""
      }
      ${r.avisos.map((a) => `<div class="sb-av">${esc(a.texto)}</div>`).join("")}
      <div class="sb-alvo">${alvoTexto}</div>
      <div class="row">
        <button class="btn pri" id="registrar">Registrar como comido</button>
        <button class="btn" id="limpar">Limpar</button>
      </div>
    </div>
  </div></div>`;
}

export const telaCalcular: Tela = {
  render(ctx) {
    const refs = refeicoesDoDia(ctx);
    if (indiceRef >= refs.length) indiceRef = 0;
    const { alvo, resultado } = calcular(ctx);

    return `
      <div class="stickytop">
        <label for="sel-ref">Refeição alvo</label>
        <select id="sel-ref">${refs
          .map(
            (r, i) =>
              `<option value="${i}" ${i === indiceRef ? "selected" : ""}>${esc(r.h)}${
                r.tag ? ` · ${esc(r.tag)}` : ""
              } · ${r.m[0]}P ${r.m[1]}C ${r.m[2]}G</option>`,
          )
          .join("")}</select>
      </div>
      ${camposFixos(ctx)}
      ${chips(ctx)}
      <div style="height:${resultado ? "220px" : "90px"}"></div>
      ${barra(alvo, resultado)}
    `;
  },

  ligar(ctx, raiz) {
    $<HTMLSelectElement>(raiz, "#sel-ref")?.addEventListener("change", (e) => {
      indiceRef = Number((e.target as HTMLSelectElement).value);
      ctx.redesenhar();
    });

    for (const botao of $$<HTMLButtonElement>(raiz, "[data-alimento]")) {
      botao.addEventListener("click", () => {
        const nome = botao.dataset.alimento!;
        if (selecionados.has(nome)) {
          selecionados.delete(nome);
          quantidadesFixas.delete(nome);
        } else {
          selecionados.add(nome);
        }
        ctx.redesenhar();
      });
    }

    for (const campo of $$<HTMLInputElement>(raiz, "[data-fixo]")) {
      campo.addEventListener("change", () => {
        const valor = lerNumero(campo);
        const nome = campo.dataset.fixo!;
        if (valor !== null && valor >= 0) quantidadesFixas.set(nome, valor);
        else quantidadesFixas.set(nome, porcaoFixa(ctx.plano.alimentos, nome, ctx.plano.parametros));
        ctx.redesenhar();
      });
    }

    $(raiz, "#sb-head")?.addEventListener("click", () => {
      barraAberta = !barraAberta;
      $(raiz, "#barra")?.classList.toggle("open", barraAberta);
    });

    $(raiz, "#limpar")?.addEventListener("click", () => {
      selecionados = new Set();
      quantidadesFixas.clear();
      ctx.redesenhar();
    });

    $(raiz, "#registrar")?.addEventListener("click", () => {
      const { alvo, resultado } = calcular(ctx);
      if (!alvo || !resultado || resultado.itens.length === 0) return;
      // registra as gramas arredondadas e o macro real delas, nao a solucao continua
      ctx.repo.registrarRefeicao({
        data: ctx.hoje(),
        hora: alvo.h,
        refeicao: alvo.tag || "Calculada",
        itens: resultado.itens.map((i) => ({ n: i.nome, q: `${inteiro(i.quantidade)} ${i.unidade}` })),
        p: resultado.total.p,
        c: resultado.total.c,
        g: resultado.total.g,
        kcal: resultado.total.kcal,
      });
      selecionados = new Set();
      quantidadesFixas.clear();
      ctx.redesenhar();
    });
  },
};
