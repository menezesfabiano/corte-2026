import { dataComDia, dataCurta, segundaDe, semanaDe } from "../core/calendario.ts";
import {
  acao,
  faixaSeguraKg,
  perdido,
  projecao,
  ritmo,
  semanasPesadas,
  semanasReais,
  type SemanaPesada,
} from "../core/peso.ts";
import type { Parametros, PontoCurva } from "../data/schema.ts";
import { $, esc, lerNumero, nf, sinal, type Tela } from "./comum.ts";

/**
 * Tela Peso: lancar a media da semana, ver o ritmo real e a acao do protocolo.
 * Grafico em SVG feito na mao, sem biblioteca.
 */

const COR_ALVO = "#5A5E66";
const COR_REAL = "#C8102E";
const COR_PROJ = "#4FCB7C";
const COR_LINHA = "#2A2D33";
const COR_TEXTO = "#8A8E96";

/**
 * Eixo do tempo em semanas reais desde a partida do plano. A partida e o
 * fechamento nao caem em segunda-feira, entao o numero da semana nao serve de eixo.
 */
function grafico(
  parametros: Parametros,
  curva: readonly PontoCurva[],
  pesadas: readonly SemanaPesada[],
  inclinacao: number | null,
): string {
  const W = 700;
  const H = 250;
  const ml = 40;
  const mr = 20;
  const mt = 14;
  const mb = 26;
  const { partida, fechamento, pesoInicial } = parametros;
  const tempo = (iso: string) => semanasReais(partida.iso, iso);
  const fim = tempo(fechamento.iso);

  const x = (t: number) => ml + (t / fim) * (W - ml - mr);
  const valores = [pesoInicial, fechamento.peso, ...curva.map((c) => c.peso), ...pesadas.map((p) => p.peso)];
  const baixo = Math.floor(Math.min(...valores) - 1);
  const alto = Math.ceil(Math.max(...valores) + 1);
  const y = (v: number) => mt + ((alto - v) / (alto - baixo)) * (H - mt - mb);
  const caminho = (pontos: readonly [number, number][]) =>
    pontos.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  let grade = "";
  for (let v = baixo; v <= alto; v += 2) {
    grade += `<line x1="${ml}" y1="${y(v)}" x2="${W - mr}" y2="${y(v)}" stroke="${COR_LINHA}"/>
      <text x="${ml - 7}" y="${y(v) + 4}" text-anchor="end" fill="${COR_TEXTO}" font-size="11">${v}</text>`;
  }
  const rotulo = (t: number, texto: string, ancora: string) =>
    `<text x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="${ancora}" fill="${COR_TEXTO}" font-size="11">${esc(texto)}</text>`;
  grade += rotulo(0, partida.data, "start");
  grade += curva
    .filter((c) => c.n > 1 && c.n % 3 === 1)
    .map((c) => rotulo(tempo(c.iso), c.data, "middle"))
    .join("");
  grade += rotulo(fim, fechamento.data, "end");

  const alvo = caminho([
    [0, pesoInicial],
    ...curva.map((c) => [tempo(c.iso), c.peso] as [number, number]),
    [fim, fechamento.peso],
  ]);
  const real = pesadas.map((p) => [tempo(p.iso), p.peso] as [number, number]);
  const ultimo = real[real.length - 1];

  const projetado =
    ultimo && inclinacao !== null && ultimo[0] < fim
      ? `<path d="${caminho([ultimo, [fim, ultimo[1] + inclinacao * (fim - ultimo[0])]])}"
           fill="none" stroke="${COR_PROJ}" stroke-width="2" stroke-dasharray="5 4"/>`
      : "";

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso alvo contra peso registrado">
    ${grade}
    <path d="${alvo}" fill="none" stroke="${COR_ALVO}" stroke-width="2"/>
    ${projetado}
    ${
      real.length > 0
        ? `<path d="${caminho([[0, pesoInicial], ...real])}" fill="none" stroke="${COR_REAL}" stroke-width="2.5"/>`
        : ""
    }
    ${real.map(([t, v]) => `<circle cx="${x(t).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${COR_REAL}"/>`).join("")}
  </svg>`;
}

export const telaPeso: Tela = {
  render(ctx) {
    const p = ctx.plano.parametros;
    const curva = ctx.plano.curva;
    const pesadas = semanasPesadas(ctx.repo.pesagens(), curva);
    const r = ritmo(pesadas, p);
    const fim = p.fechamento;
    const ultima = pesadas[pesadas.length - 1] ?? null;
    const projetado = projecao(pesadas, r, p);
    const jaPerdido = perdido(pesadas, p.pesoInicial);
    const decisao = acao(pesadas, p);
    const [piso, teto] = faixaSeguraKg(p, p.pesoInicial);

    const hoje = ctx.hoje();
    const semanaAtual = semanaDe(hoje, curva) ?? curva[0]!;
    const registrada = ctx.repo.pesagens().find((x) => x.data === semanaAtual.iso);

    return `
      <h2>Lançar medida</h2>
      <label for="sel-semana">Semana, sempre na segunda-feira</label>
      <select id="sel-semana">${curva
        .map(
          (c) =>
            `<option value="${c.iso}" ${c.iso === semanaAtual.iso ? "selected" : ""}>Semana ${c.n} · ${esc(
              c.data,
            )} · alvo ${nf(c.peso, 1)} kg</option>`,
        )
        .join("")}</select>
      <div class="grid2" style="margin-top:10px">
        <div><label for="in-peso">Peso, média de 7 dias</label>
          <input id="in-peso" inputmode="decimal" placeholder="kg" value="${registrada ? nf(registrada.peso, 1) : ""}"></div>
        <div><label for="in-cintura">Cintura</label>
          <input id="in-cintura" inputmode="decimal" placeholder="cm" value="${
            registrada?.cintura != null ? nf(registrada.cintura, 1) : ""
          }"></div>
      </div>
      <div class="row"><button class="btn pri" id="salvar-peso">Salvar</button></div>
      <p class="lead" style="margin-top:8px">Hoje é ${esc(dataComDia(hoje))}. A medida desta semana entra
      na segunda ${esc(dataCurta(segundaDe(hoje)))}, com a média dos 7 dias anteriores em jejum.</p>

      <dl class="panel" style="margin-top:20px">
        <div class="pn"><dt>Semanas</dt><dd>${pesadas.length}<small>/${curva.length}</small></dd>
          <div class="h">${ultima ? `última: semana ${ultima.n}` : "nenhuma ainda"}</div></div>
        <div class="pn"><dt>Perdido</dt><dd>${jaPerdido !== null ? nf(jaPerdido, 1) : "sem dado"}<small>kg</small></dd>
          <div class="h">${
            ultima
              ? `${sinal(ultima.desvio)} kg vs alvo da semana`
              : `desde ${nf(p.pesoInicial, 1)} kg em ${esc(p.partida.data)}`
          }</div></div>
        <div class="pn"><dt>Ritmo real</dt><dd>${r ? sinal(r.inclinacao, 2) : "sem dado"}<small>kg/sem</small></dd>
          <div class="h">${
            r ? `R² ${nf(r.r2, 2)} em ${r.pontos} pontos` : `precisa de ${p.ritmo.janelaMinDias} dias medidos`
          }, faixa segura −${nf(piso, 2)} a −${nf(teto, 2)}</div></div>
        <div class="pn"><dt>Projeção ${esc(fim.data)}</dt>
          <dd>${projetado !== null ? nf(projetado, 1) : "sem dado"}<small>kg</small></dd>
          <div class="h">alvo ${nf(fim.peso, 1)} kg</div></div>
        <div class="pn"><dt>Ação</dt>
          <dd class="alert${decisao.alerta ? " on" : ""}">${esc(decisao.texto)}</dd>
          <div class="h">${esc(decisao.detalhe)}</div></div>
      </dl>

      ${grafico(p, curva, pesadas, r?.inclinacao ?? null)}

      <h2>Histórico</h2>
      <table class="tbl">
        <tr><th>Sem</th><th>Data</th><th>Alvo</th><th>Peso</th><th>Desvio</th><th>Cintura</th></tr>
        ${curva
          .map((c) => {
            const feita = pesadas.find((x) => x.n === c.n);
            const dentro = feita ? Math.abs(feita.desvio) <= p.autorregulacao.desvioKg : true;
            return `<tr class="${c.n === semanaAtual.n ? "hoje" : ""}">
              <td>${c.n}</td><td>${esc(c.data)}</td><td>${nf(c.peso, 1)}</td>
              <td class="n">${feita ? nf(feita.peso, 1) : ""}</td>
              <td class="${dentro ? "ok" : "warn"}">${feita ? `${sinal(feita.desvio)}` : ""}</td>
              <td>${feita?.cintura != null ? nf(feita.cintura, 1) : ""}</td>
            </tr>`;
          })
          .join("")}
        <tr><td>fim</td><td>${esc(fim.data)}</td><td>${nf(fim.peso, 1)}</td><td class="n"></td><td></td><td></td></tr>
      </table>
    `;
  },

  ligar(ctx, raiz) {
    const seletor = $<HTMLSelectElement>(raiz, "#sel-semana");
    seletor?.addEventListener("change", () => {
      const escolhida = ctx.repo.pesagens().find((x) => x.data === seletor.value);
      const campoPeso = $<HTMLInputElement>(raiz, "#in-peso");
      const campoCintura = $<HTMLInputElement>(raiz, "#in-cintura");
      if (campoPeso) campoPeso.value = escolhida ? nf(escolhida.peso, 1) : "";
      if (campoCintura) campoCintura.value = escolhida?.cintura != null ? nf(escolhida.cintura, 1) : "";
    });

    $(raiz, "#salvar-peso")?.addEventListener("click", () => {
      const peso = lerNumero($<HTMLInputElement>(raiz, "#in-peso"));
      const cintura = lerNumero($<HTMLInputElement>(raiz, "#in-cintura"));
      const data = seletor?.value;
      if (!data || peso === null || peso <= 0) return;
      ctx.repo.salvarPesagem(data, peso, cintura);
      ctx.redesenhar();
    });
  },
};
