import { blocoDe, modeloDe } from "../core/calendario.ts";
import { macrosRefeicao, somar, totalDia, zero } from "../core/macros.ts";
import { COD_MODELOS, type CodModelo, type Refeicao } from "../data/schema.ts";
import { $$, NOMES_MODELO, esc, inteiro, type Contexto, type Tela } from "./comum.ts";

/**
 * Tela Hoje: o alvo do dia, o que ja foi registrado e o plano.
 * Todo numero vem de src/core/macros.ts, nada e somado aqui.
 */

function placar(ctx: Contexto, alvo: readonly number[], soma: { p: number; c: number; g: number; kcal: number }): string {
  const linhas: [string, number, number, string][] = [
    ["Proteína", soma.p, alvo[0]!, "g"],
    ["Carbo", soma.c, alvo[1]!, "g"],
    ["Gordura", soma.g, alvo[2]!, "g"],
    ["kcal", soma.kcal, alvo[3]!, ""],
  ];
  void ctx;
  return `<dl class="score">${linhas
    .map(
      ([rotulo, feito, meta, unidade]) =>
        `<div><dt>${rotulo}</dt><dd>${inteiro(feito)}<small>/${inteiro(meta)}${unidade}</small></dd></div>`,
    )
    .join("")}</dl>`;
}

function cartaoRegistrado(r: {
  id: string;
  hora: string;
  refeicao: string;
  itens: readonly { n: string; q: string }[];
  p: number;
  c: number;
  g: number;
  kcal: number;
}): string {
  return `<div class="card on">
    <div class="crow"><span class="ctime">${esc(r.hora)}</span>
      ${r.refeicao ? `<span class="ctag">${esc(r.refeicao)}</span>` : ""}
      <span style="flex:1"></span>
      <button class="btn sm" data-apagar="${esc(r.id)}">Apagar</button></div>
    ${r.itens
      .map((i) => `<div class="citem"><span>${esc(i.n)}</span><b>${esc(i.q)}</b></div>`)
      .join("")}
    <div class="cmac"><b>${inteiro(r.p)}</b> P &nbsp;<b>${inteiro(r.c)}</b> C &nbsp;<b>${inteiro(r.g)}</b> G
      &nbsp;·&nbsp; <b>${inteiro(r.kcal)}</b> KCAL</div>
  </div>`;
}

function cartaoPlano(ctx: Contexto, ref: Refeicao, indice: number, jaRegistrada: boolean): string {
  const { kcalMax, protMin } = ctx.plano.parametros.livre;
  const m = macrosRefeicao(ctx.plano.alimentos, ref);
  const corpo = ref.livre
    ? `<div style="font-size:15px">Refeição livre. Teto de ${inteiro(kcalMax)} kcal e mínimo de
        ${inteiro(protMin)} g de proteína. Coma devagar, comece pela proteína.</div>`
    : ref.itens
        .map((i) => `<div class="citem"><span>${esc(i.n)}</span><b>${esc(i.q)}</b></div>`)
        .join("");

  // sem esta marca o botao nao da retorno nenhum e a mesma refeicao entra tres vezes
  const rotulo = jaRegistrada ? "Registrar de novo" : ref.livre ? "Comi a livre" : "Comi isso";

  return `<div class="card${ref.livre ? " livre" : ""}${jaRegistrada ? " feito" : ""}">
    <div class="crow"><span class="ctime">${esc(ref.h)}</span>
      ${ref.tag ? `<span class="ctag">${esc(ref.tag)}</span>` : ""}
      ${jaRegistrada ? `<span class="ok-tag">registrada</span>` : ""}
      <span style="flex:1"></span>
      <button class="btn sm" data-comi="${indice}">${rotulo}</button></div>
    ${corpo}
    <div class="cmac"><b>${inteiro(m.p)}</b> P &nbsp;<b>${inteiro(m.c)}</b> C &nbsp;<b>${inteiro(m.g)}</b> G
      &nbsp;·&nbsp; <b>${inteiro(m.kcal)}</b> KCAL</div>
  </div>`;
}

export const telaHoje: Tela = {
  render(ctx) {
    const data = ctx.hoje();
    const bloco = blocoDe(data, ctx.plano.faixas);
    const modelo = modeloDe(data, ctx.repo.modeloDe(data));
    const dia = ctx.plano.dias[bloco]![modelo]!;
    const registradas = ctx.repo.refeicoesDe(data);
    const soma = registradas.length > 0 ? somar(...registradas.map((r) => ({ ...r, fibra: 0 }))) : zero();
    const alvo = totalDia(ctx.plano.alimentos, dia);
    const fimDeSemana = modelo === "fds";
    const horasRegistradas = new Set(registradas.map((r) => r.hora));

    return `
      <label for="sel-modelo">Modelo de hoje</label>
      <select id="sel-modelo" ${fimDeSemana ? "disabled" : ""}>
        ${COD_MODELOS.map(
          (cod) => `<option value="${cod}" ${cod === modelo ? "selected" : ""}>${NOMES_MODELO[cod]}</option>`,
        ).join("")}
      </select>
      ${fimDeSemana ? `<p class="lead" style="margin-top:6px">Sábado e domingo são sempre fim de semana.</p>` : ""}
      ${placar(ctx, [Math.round(alvo.p), Math.round(alvo.c), Math.round(alvo.g), Math.round(alvo.kcal)], soma)}
      <p class="lead" style="margin-top:10px">${esc(dia.desc)}</p>

      <h2>Registrado hoje</h2>
      ${
        registradas.length > 0
          ? registradas.map(cartaoRegistrado).join("")
          : `<div class="empty">Nada registrado ainda. Marque uma refeição do plano ou use a calculadora.</div>`
      }

      <h2>Plano do dia, bloco ${bloco}</h2>
      ${dia.refs.map((r, i) => cartaoPlano(ctx, r, i, horasRegistradas.has(r.h))).join("")}
    `;
  },

  ligar(ctx, raiz) {
    const data = ctx.hoje();
    const bloco = blocoDe(data, ctx.plano.faixas);
    const modelo = modeloDe(data, ctx.repo.modeloDe(data));
    const dia = ctx.plano.dias[bloco]![modelo]!;

    const seletor = raiz.querySelector<HTMLSelectElement>("#sel-modelo");
    seletor?.addEventListener("change", () => {
      ctx.repo.definirModelo(data, seletor.value as CodModelo);
      ctx.redesenhar();
    });

    for (const botao of $$<HTMLButtonElement>(raiz, "[data-apagar]")) {
      botao.addEventListener("click", () => {
        ctx.repo.apagarRefeicao(botao.dataset.apagar!);
        ctx.redesenhar();
      });
    }

    for (const botao of $$<HTMLButtonElement>(raiz, "[data-comi]")) {
      botao.addEventListener("click", () => {
        const ref = dia.refs[Number(botao.dataset.comi)];
        if (!ref) return;
        // recalcula a partir dos itens: registrar o m arredondado do plano e o erro da v1
        const m = macrosRefeicao(ctx.plano.alimentos, ref);
        ctx.repo.registrarRefeicao({
          data,
          hora: ref.h,
          refeicao: ref.livre ? "Livre" : ref.tag,
          itens: ref.itens.map((i) => ({ n: i.n, q: i.q })),
          p: m.p,
          c: m.c,
          g: m.g,
          kcal: m.kcal,
        });
        ctx.redesenhar();
      });
    }
  },
};
