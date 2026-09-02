import { dataComDia, dataCurta, segundaDe, semanaDe } from "../core/calendario.ts";
import { acao, faixaSeguraKg, perdido, projecao, ritmo, semanasPesadas, type SemanaPesada } from "../core/peso.ts";
import type { PontoCurva } from "../data/schema.ts";
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

function grafico(curva: readonly PontoCurva[], pesadas: readonly SemanaPesada[], inclinacao: number | null): string {
  const W = 700;
  const H = 250;
  const ml = 40;
  const mr = 20;
  const mt = 14;
  const mb = 26;
  const ultimoN = curva[curva.length - 1]!.n;

  const x = (n: number) => ml + ((n - 1) / (ultimoN - 1)) * (W - ml - mr);
  const valores = [...curva.map((c) => c.peso), ...pesadas.map((p) => p.peso)];
  const baixo = Math.floor(Math.min(...valores) - 1);
  const alto = Math.ceil(Math.max(...valores) + 1);
  const y = (v: number) => mt + ((alto - v) / (alto - baixo)) * (H - mt - mb);
  const caminho = (pontos: readonly [number, number][]) =>
    pontos.map(([n, v], i) => `${i ? "L" : "M"}${x(n).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  let grade = "";
  for (let v = baixo; v <= alto; v += 2) {
    grade += `<line x1="${ml}" y1="${y(v)}" x2="${W - mr}" y2="${y(v)}" stroke="${COR_LINHA}"/>
      <text x="${ml - 7}" y="${y(v) + 4}" text-anchor="end" fill="${COR_TEXTO}" font-size="11">${v}</text>`;
  }
  grade += curva
    .filter((c) => c.n % 3 === 1)
    .map(
      (c) =>
        `<text x="${x(c.n)}" y="${H - 8}" text-anchor="middle" fill="${COR_TEXTO}" font-size="11">${esc(c.data)}</text>`,
    )
    .join("");

  const alvo = caminho(curva.map((c) => [c.n, c.peso] as [number, number]));
  const real = pesadas.map((p) => [p.n, p.peso] as [number, number]);
  const ultimo = real[real.length - 1];

  const projetado =
    ultimo && inclinacao !== null
      ? `<path d="${caminho([ultimo, [ultimoN, ultimo[1] + inclinacao * (ultimoN - ultimo[0])]])}"
           fill="none" stroke="${COR_PROJ}" stroke-width="2" stroke-dasharray="5 4"/>`
      : "";

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso alvo contra peso registrado">
    ${grade}
    <path d="${alvo}" fill="none" stroke="${COR_ALVO}" stroke-width="2"/>
    ${projetado}
    ${real.length > 0 ? `<path d="${caminho(real)}" fill="none" stroke="${COR_REAL}" stroke-width="2.5"/>` : ""}
    ${real.map(([n, v]) => `<circle cx="${x(n).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${COR_REAL}"/>`).join("")}
  </svg>`;
}

export const telaPeso: Tela = {
  render(ctx) {
    const p = ctx.plano.parametros;
    const curva = ctx.plano.curva;
    const pesadas = semanasPesadas(ctx.repo.pesagens(), curva);
    const r = ritmo(pesadas, p.regressaoPontos);
    const fim = curva[curva.length - 1]!;
    const ultima = pesadas[pesadas.length - 1] ?? null;
    const projetado = projecao(pesadas, r, curva);
    const jaPerdido = perdido(pesadas, p.pesoInicial);
    const decisao = acao(pesadas, p.autorregulacao);
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
          <div class="h">${ultima ? `${sinal(ultima.desvio)} kg vs alvo da semana` : `desde ${nf(p.pesoInicial, 1)} kg`}</div></div>
        <div class="pn"><dt>Ritmo real</dt><dd>${r ? sinal(r.inclinacao, 2) : "sem dado"}<small>kg/sem</small></dd>
          <div class="h">${
            r ? `R² ${nf(r.r2, 2)} em ${r.pontos} pontos` : "precisa de 2 pesagens"
          }, faixa segura −${nf(piso, 2)} a −${nf(teto, 2)}</div></div>
        <div class="pn"><dt>Projeção ${esc(fim.data)}</dt>
          <dd>${projetado !== null ? nf(projetado, 1) : "sem dado"}<small>kg</small></dd>
          <div class="h">alvo ${nf(fim.peso, 1)} kg</div></div>
        <div class="pn"><dt>Ação</dt>
          <dd class="alert${decisao.codigo === "seguir" || decisao.codigo === "aguardar" ? "" : " on"}">${esc(decisao.texto)}</dd>
          <div class="h">${esc(decisao.detalhe)}</div></div>
      </dl>

      ${grafico(curva, pesadas, r?.inclinacao ?? null)}

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
