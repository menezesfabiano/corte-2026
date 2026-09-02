import { blocoDe, diasEntre, ehFimDeSemana, modeloDe } from "../core/calendario.ts";
import { macrosRefeicao, mediaSemanal, somar, totalDia, zero } from "../core/macros.ts";
import { COD_MODELOS, type CodBloco, type CodModelo, type Refeicao } from "../data/schema.ts";
import { $$, NOMES_MODELO, esc, inteiro, milhar, nf, type Contexto, type Tela } from "./comum.ts";

/**
 * Tela principal: a pagina do protocolo, como no documento de agosto, com o
 * registro do dia em cima. Blocos numa linha do tempo, modelo de dia em toggles,
 * refeicoes em grade e o placar fixo no rodape. Todo numero vem de src/core/.
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
  /** O que esta na tela e exatamente o dia de hoje: registra e mostra placar feito/alvo. */
  ehHoje: boolean;
}

function visao(ctx: Contexto): Visao {
  const hoje = ctx.hoje();
  const blocoHoje = blocoDe(hoje, ctx.plano.faixas);
  const modeloHoje = modeloDe(hoje, ctx.repo.modeloDe(hoje));
  const bloco = blocoVisto ?? blocoHoje;
  const modelo = bloco === blocoHoje ? (modeloVisto ?? modeloHoje) : (modeloVisto ?? "t11");
  return { hoje, blocoHoje, modeloHoje, bloco, modelo, ehHoje: bloco === blocoHoje && modelo === modeloHoje };
}

function cabecalho(ctx: Contexto): string {
  const { atleta, curva, parametros } = ctx.plano;
  const primeiro = curva[0]!;
  const ultimo = curva[curva.length - 1]!;
  const perda = parametros.pesoInicial - ultimo.peso;
  const semanas = diasEntre(primeiro.iso, ultimo.iso) / 7;
  const resumo =
    `Perda planejada de ${nf(perda, 1)} kg em ${semanas} semanas, ${nf(perda / semanas, 2)} kg por semana. ` +
    `De ${nf(parametros.pesoInicial, 1)} para ${nf(ultimo.peso, 1)} kg e cintura de ${nf(primeiro.cintura, 1)} ` +
    `para ${nf(ultimo.cintura, 1)} cm até ${esc(ultimo.data)}. Proteína fixa, carboidrato cai bloco a bloco.`;
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
  const fimDeSemana = ehFimDeSemana(v.hoje) && v.bloco === v.blocoHoje;
  const botoes = COD_MODELOS.map(
    (cod) =>
      `<button class="day" role="tab" aria-selected="${cod === v.modelo}" data-modelo="${cod}">${NOMES_MODELO[cod]}</button>`,
  ).join("");
  const nota = fimDeSemana
    ? " Hoje é fim de semana, então o modelo do dia é fixo; os outros ficam só para consulta."
    : v.bloco !== v.blocoHoje
      ? ` Você está vendo o bloco ${v.bloco}, só para consulta. O de hoje é o ${v.blocoHoje}.`
      : "";
  return `<div class="section-label">Modelo de dia</div>
    <div class="days" role="tablist">${botoes}</div>
    <p class="daydesc">${esc(ctx.plano.dias[v.bloco]![v.modelo]!.desc)}${nota}</p>`;
}

function cartaoRefeicao(ctx: Contexto, ref: Refeicao, indice: number, v: Visao, jaRegistrada: boolean): string {
  const { kcalMax, protMin } = ctx.plano.parametros.livre;
  const m = macrosRefeicao(ctx.plano.alimentos, ref);
  const corpo = ref.livre
    ? `<p class="m-free">Almoço ou jantar fora, sem pesar. <b>Teto de ${inteiro(kcalMax)} kcal</b> e
        <b>mínimo de ${inteiro(protMin)} g de proteína</b>.</p>`
    : ref.itens.map((i) => `<div class="m-item"><span>${esc(i.n)}</span><b>${esc(i.q)}</b></div>`).join("");
  const rotulo = jaRegistrada ? "De novo" : ref.livre ? "Comi a livre" : "Comi isso";
  const botao = v.ehHoje ? `<button class="btn sm" data-comi="${indice}">${rotulo}</button>` : "";
  return `<div class="meal${ref.livre ? " livre" : ""}${jaRegistrada ? " feito" : ""}">
    <div class="m-head"><span class="m-time">${esc(ref.h)}</span>
      ${ref.tag ? `<span class="m-tag">${esc(ref.tag)}</span>` : ""}
      ${jaRegistrada ? `<span class="ok-tag">registrada</span>` : ""}</div>
    ${corpo}
    <div class="m-macros"><b>${inteiro(m.p)}</b> P &nbsp;<b>${inteiro(m.c)}</b> C &nbsp;<b>${inteiro(m.g)}</b> G
      &nbsp;·&nbsp; <b>${inteiro(m.kcal)}</b> KCAL ${botao}</div>
  </div>`;
}

function registradas(ctx: Contexto, v: Visao): string {
  const lista = ctx.repo.refeicoesDe(v.hoje);
  if (lista.length === 0) {
    return `<div class="section-label">Registrado hoje</div>
      <div class="empty">Nada registrado ainda. Marque uma refeição do plano ou use a calculadora.</div>`;
  }
  return `<div class="section-label">Registrado hoje</div>
    <div class="meals">${lista
      .map(
        (r) => `<div class="meal feito">
          <div class="m-head"><span class="m-time">${esc(r.hora)}</span>
            ${r.refeicao ? `<span class="m-tag">${esc(r.refeicao)}</span>` : ""}</div>
          ${r.itens.map((i) => `<div class="m-item"><span>${esc(i.n)}</span><b>${esc(i.q)}</b></div>`).join("")}
          <div class="m-macros"><b>${inteiro(r.p)}</b> P &nbsp;<b>${inteiro(r.c)}</b> C &nbsp;<b>${inteiro(r.g)}</b> G
            &nbsp;·&nbsp; <b>${inteiro(r.kcal)}</b> KCAL
            <button class="btn sm" data-apagar="${esc(r.id)}">Apagar</button></div>
        </div>`,
      )
      .join("")}</div>`;
}

function placar(ctx: Contexto, v: Visao): string {
  const dia = ctx.plano.dias[v.bloco]![v.modelo]!;
  const alvo = totalDia(ctx.plano.alimentos, dia);
  const lista = ctx.repo.refeicoesDe(v.hoje);
  const feito = lista.length > 0 ? somar(...lista.map((r) => ({ ...r, fibra: 0 }))) : zero();
  const celula = (rotulo: string, valorFeito: number, valorAlvo: number, unidade: string, grande = false) =>
    v.ehHoje
      ? `<div class="sc"><dt>${rotulo}</dt><dd>${grande ? milhar(valorFeito) : inteiro(valorFeito)}<small>/${
          grande ? milhar(valorAlvo) : inteiro(valorAlvo)
        } ${unidade}</small></dd></div>`
      : `<div class="sc"><dt>${rotulo}</dt><dd>${grande ? milhar(valorAlvo) : inteiro(valorAlvo)}<small>${unidade}</small></dd></div>`;
  return `<dl class="score">
    ${celula("Proteína", feito.p, alvo.p, "g")}
    ${celula("Carboidrato", feito.c, alvo.c, "g")}
    ${celula("Gordura", feito.g, alvo.g, "g")}
    ${celula(v.ehHoje ? "Hoje" : "Total do dia", feito.kcal, alvo.kcal, "kcal", true)}
  </dl>`;
}

export const telaHoje: Tela = {
  render(ctx) {
    const v = visao(ctx);
    const dia = ctx.plano.dias[v.bloco]![v.modelo]!;
    const horasRegistradas = new Set(ctx.repo.refeicoesDe(v.hoje).map((r) => r.hora));
    return `
      ${cabecalho(ctx)}
      ${blocos(ctx, v)}
      ${toggles(ctx, v)}
      <div class="meals">${dia.refs
        .map((r, i) => cartaoRefeicao(ctx, r, i, v, v.ehHoje && horasRegistradas.has(r.h)))
        .join("")}</div>
      ${registradas(ctx, v)}
      ${placar(ctx, v)}
    `;
  },

  ligar(ctx, raiz) {
    const v = visao(ctx);
    const dia = ctx.plano.dias[v.bloco]![v.modelo]!;

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
        // no bloco de hoje, em dia util, escolher o modelo e decidir o dia: persiste
        if (v.bloco === v.blocoHoje && !ehFimDeSemana(v.hoje)) {
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

    for (const botao of $$<HTMLButtonElement>(raiz, "[data-comi]")) {
      botao.addEventListener("click", () => {
        const ref = dia.refs[Number(botao.dataset.comi)];
        if (!ref || !v.ehHoje) return;
        // recalcula a partir dos itens: registrar o m arredondado do plano e o erro da v1
        const m = macrosRefeicao(ctx.plano.alimentos, ref);
        ctx.repo.registrarRefeicao({
          data: v.hoje,
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

