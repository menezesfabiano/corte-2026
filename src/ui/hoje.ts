import { blocoDe, modeloDe } from "../core/calendario.ts";
import { ehCaminhada, metaDoDia } from "../core/extras.ts";
import { macrosRefeicao, mediaSemanal, somar, totalDia, zero } from "../core/macros.ts";
import { resumoPlano } from "../core/peso.ts";
import { COD_MODELOS, type CodBloco, type CodModelo, type Refeicao } from "../data/schema.ts";
import { $$, NOMES_MODELO, esc, inteiro, milhar, nf, type Contexto, type Tela } from "./comum.ts";

/**
 * Tela principal: a pagina do protocolo, como no documento de agosto. Blocos numa
 * linha do tempo, modelo de dia em toggles, refeicoes em grade para consulta, o
 * que saiu da calculadora e a meta do dia fixa no rodape. Todo numero vem de src/core/.
 */

/** Bloco e modelo que estao sendo vistos. Null quer dizer "o de hoje". */
let blocoVisto: CodBloco | null = null;
let modeloVisto: CodModelo | null = null;

interface Visao {
  hoje: string;
  blocoHoje: CodBloco;
  modeloHoje: CodModelo;
  bloco: CodBloco;
  modelo: CodModelo;
}

function visao(ctx: Contexto): Visao {
  const hoje = ctx.hoje();
  const blocoHoje = blocoDe(hoje, ctx.plano.faixas);
  const modeloHoje = modeloDe(hoje, ctx.repo.modeloDe(hoje));
  const bloco = blocoVisto ?? blocoHoje;
  const modelo = bloco === blocoHoje ? (modeloVisto ?? modeloHoje) : (modeloVisto ?? "t11");
  return { hoje, blocoHoje, modeloHoje, bloco, modelo };
}

function cabecalho(ctx: Contexto): string {
  const { atleta, parametros } = ctx.plano;
  const { partida, fechamento } = parametros;
  const r = resumoPlano(parametros);
  const resumo =
    `Perda planejada de ${nf(r.perda, 1)} kg em ${nf(r.semanas, 1)} semanas, ${nf(r.ritmo, 2)} kg por semana. ` +
    `De ${nf(parametros.pesoInicial, 1)} para ${nf(fechamento.peso, 1)} kg e cintura de ${nf(partida.cintura, 1)} ` +
    `para ${nf(fechamento.cintura, 1)} cm até ${esc(fechamento.data)}. Proteína fixa, carboidrato cai bloco a bloco.`;
  return `<div class="head">
    <div class="l">
      <div class="eyebrow">${esc(atleta.eyebrow)}</div>
      <h1>Protocolo<br>de <em>corte</em></h1>
      <p class="sub">${resumo}</p>
    </div>
    <div class="athlete">${esc(atleta.nome)}<br><b>${esc(atleta.linha)}</b><br>${esc(atleta.atividade)}</div>
  </div>`;
}

function blocos(ctx: Contexto, v: Visao): string {
  const cartoes = ctx.plano.blocos
    .map((b) => {
      const media = mediaSemanal(ctx.plano.alimentos, ctx.plano.dias[b.cod]!, ctx.plano.parametros.semanaPadrao);
      const selecionado = b.cod === v.bloco;
      return `<button class="heat" role="tab" aria-selected="${selecionado}" data-bloco="${b.cod}">
        <span class="h-top"><span class="h-cod">${b.cod}</span><span class="h-wk">${esc(b.semanas)}</span></span>
        <span class="h-line"><span class="h-sub">${esc(b.periodo)}</span>
          <span class="h-kcal">${milhar(media)}<span>kcal/dia</span></span></span>
      </button>`;
    })
    .join("");
  const b = ctx.plano.blocos.find((x) => x.cod === v.bloco)!;
  return `<div class="section-label">Tempos e movimentos</div>
    <div class="heats" role="tablist">${cartoes}</div>
    <dl class="blockbar">
      <div class="bb"><dt>Perda projetada no bloco</dt><dd>${esc(b.perda)}</dd></div>
      <div class="bb"><dt>Período</dt><dd>${esc(b.periodo)}</dd></div>
      <div class="bb"><dt>O que muda</dt><dd>${esc(b.resumo)}</dd></div>
      <div class="bb"><dt>Peso ao fim do bloco</dt><dd>${esc(b.peso)}</dd></div>
    </dl>`;
}

function toggles(ctx: Contexto, v: Visao): string {
  const botoes = COD_MODELOS.map(
    (cod) =>
      `<button class="day" role="tab" aria-selected="${cod === v.modelo}" data-modelo="${cod}">${NOMES_MODELO[cod]}</button>`,
  ).join("");
  const nota =
    v.bloco !== v.blocoHoje ? ` Você está vendo o bloco ${v.bloco}, só para consulta. O de hoje é o ${v.blocoHoje}.` : "";
  return `<div class="section-label">Modelo de dia</div>
    <div class="days" role="tablist">${botoes}</div>
    <p class="daydesc">${esc(ctx.plano.dias[v.bloco]![v.modelo]!.desc)}${nota}</p>`;
}

/** Cartao de refeicao do plano. So consulta: o plano nao e marcado refeicao a refeicao. */
function cartaoRefeicao(ctx: Contexto, ref: Refeicao): string {
  const { kcalMax, protMin } = ctx.plano.parametros.livre;
  const m = macrosRefeicao(ctx.plano.alimentos, ref);
  const corpo = ref.livre
    ? `<p class="m-free">Almoço ou jantar fora, sem pesar. <b>Teto de ${inteiro(kcalMax)} kcal</b> e
        <b>mínimo de ${inteiro(protMin)} g de proteína</b>.</p>`
    : ref.itens.map((i) => `<div class="m-item"><span>${esc(i.n)}</span><b>${esc(i.q)}</b></div>`).join("");
  return `<div class="meal${ref.livre ? " livre" : ""}">
    <div class="m-head"><span class="m-time">${esc(ref.h)}</span>
      ${ref.tag ? `<span class="m-tag">${esc(ref.tag)}</span>` : ""}</div>
    ${corpo}
    <div class="m-macros"><b>${inteiro(m.p)}</b> P &nbsp;<b>${inteiro(m.c)}</b> C &nbsp;<b>${inteiro(m.g)}</b> G
      &nbsp;·&nbsp; <b>${inteiro(m.kcal)}</b> KCAL</div>
  </div>`;
}

function registradas(ctx: Contexto, v: Visao): string {
  const lista = ctx.repo.refeicoesDe(v.hoje);
  if (lista.length === 0) {
    return `<div class="section-label">Registrado hoje</div>
      <div class="empty">Nada registrado hoje.</div>`;
  }
  const comida = lista.filter((r) => !ehCaminhada(r));
  const total = comida.length > 0 ? somar(...comida.map((r) => ({ ...r, fibra: 0 }))) : zero();
  return `<div class="section-label">Registrado hoje${comida.length > 0 ? ` · ${milhar(total.kcal)} kcal` : ""}</div>
    <div class="meals">${lista
      .map((r) => {
        const macros = ehCaminhada(r)
          ? ""
          : `<b>${inteiro(r.p)}</b> P &nbsp;<b>${inteiro(r.c)}</b> C &nbsp;<b>${inteiro(r.g)}</b> G
            &nbsp;·&nbsp; <b>${inteiro(r.kcal)}</b> KCAL`;
        return `<div class="meal feito">
          <div class="m-head"><span class="m-time">${esc(r.hora)}</span>
            ${r.refeicao ? `<span class="m-tag">${esc(r.refeicao)}</span>` : ""}</div>
          ${r.itens.map((i) => `<div class="m-item"><span>${esc(i.n)}</span><b>${esc(i.q)}</b></div>`).join("")}
          <div class="m-macros">${macros}
            <button class="btn sm" data-apagar="${esc(r.id)}">Apagar</button></div>
        </div>`;
      })
      .join("")}</div>`;
}

/** Meta do dia: cardapio do modelo na tela mais o doce oficial. */
function placar(ctx: Contexto, v: Visao): string {
  const dia = ctx.plano.dias[v.bloco]![v.modelo]!;
  const meta = metaDoDia(totalDia(ctx.plano.alimentos, dia), ctx.plano.parametros);
  const celula = (rotulo: string, valor: string, unidade: string) =>
    `<div class="sc"><dt>${rotulo}</dt><dd>${valor}<small>${unidade}</small></dd></div>`;
  return `<dl class="score">
    ${celula("Proteína", inteiro(meta.p), "g")}
    ${celula("Carboidrato", inteiro(meta.c), "g")}
    ${celula("Gordura", inteiro(meta.g), "g")}
    ${celula("Meta com doce", milhar(meta.kcal), "kcal")}
  </dl>`;
}

export const telaHoje: Tela = {
  render(ctx) {
    const v = visao(ctx);
    const dia = ctx.plano.dias[v.bloco]![v.modelo]!;
    return `
      ${cabecalho(ctx)}
      ${blocos(ctx, v)}
      ${toggles(ctx, v)}
      <div class="meals">${dia.refs.map((r) => cartaoRefeicao(ctx, r)).join("")}</div>
      ${registradas(ctx, v)}
      ${placar(ctx, v)}
    `;
  },

  ligar(ctx, raiz) {
    const v = visao(ctx);

    for (const botao of $$<HTMLButtonElement>(raiz, "[data-bloco]")) {
      botao.addEventListener("click", () => {
        const cod = botao.dataset.bloco as CodBloco;
        blocoVisto = cod === v.blocoHoje ? null : cod;
        modeloVisto = null;
        ctx.redesenhar();
      });
    }

    for (const botao of $$<HTMLButtonElement>(raiz, "[data-modelo]")) {
      botao.addEventListener("click", () => {
        const cod = botao.dataset.modelo as CodModelo;
        // no bloco de hoje, escolher o modelo e decidir o dia, em qualquer dia da semana: persiste
        if (v.bloco === v.blocoHoje) {
          ctx.repo.definirModelo(v.hoje, cod);
          modeloVisto = null;
        } else {
          modeloVisto = cod;
        }
        ctx.redesenhar();
      });
    }

    for (const botao of $$<HTMLButtonElement>(raiz, "[data-apagar]")) {
      botao.addEventListener("click", () => {
        ctx.repo.apagarRefeicao(botao.dataset.apagar!);
        ctx.redesenhar();
      });
    }
  },
};
