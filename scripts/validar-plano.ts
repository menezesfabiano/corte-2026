/**
 * Validacao do plano. Roda no prebuild: se o JSON estiver inconsistente, o build para.
 *
 * Rode com: npm run validar
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validarPlano, COD_BLOCOS, COD_MODELOS } from "../src/data/schema.ts";
import type { CodBloco, CodModelo } from "../src/data/schema.ts";
import { macrosItens, macrosRefeicao, mediaSemanal, paraTupla, totalDia } from "../src/core/macros.ts";
import { blocoDe, dataCurta, diaDaSemana, diasEntre } from "../src/core/calendario.ts";
import { itensDaLista, listaDeCompras } from "../src/core/compras.ts";
import { resumoPlano } from "../src/core/peso.ts";
import { macrosDoce } from "../src/core/extras.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// aceita um caminho alternativo no argv, usado para testar o proprio validador
const CAMINHO = process.argv[2] ? resolve(process.argv[2]) : resolve(RAIZ, "src/data/plano.json");

const erros: string[] = [];
const avisos: string[] = [];
const linhas: string[] = [];

function nf(x: number, casas = 1): string {
  return x.toFixed(casas).replace(".", ",");
}

function titulo(t: string): void {
  linhas.push("");
  linhas.push(t);
  linhas.push("-".repeat(t.length));
}

function ok(msg: string): void {
  linhas.push(`  ok    ${msg}`);
}

function erro(msg: string): void {
  erros.push(msg);
  linhas.push(`  ERRO  ${msg}`);
}

function aviso(msg: string): void {
  avisos.push(msg);
  linhas.push(`  nota  ${msg}`);
}

// ---------------------------------------------------------------- contrato

const cru: unknown = JSON.parse(readFileSync(CAMINHO, "utf8"));
const plano = validarPlano(cru);
const tabela = plano.alimentos;
const { parametros } = plano;

linhas.push("Corte 2026, validacao do plano");
linhas.push("==============================");
titulo("Contrato");
ok(`plano.json passa no schema zod. ${Object.keys(tabela).length} alimentos na tabela.`);

// --------------------------------------------------------------- refeicoes

titulo("Refeicoes");
let totalRefs = 0;
let recalculadas = 0;
let refsFora = 0;
const TOL_MACRO = 1;
const TOL_KCAL = 15;

for (const b of COD_BLOCOS) {
  for (const k of COD_MODELOS) {
    for (const ref of plano.dias[b]![k]!.refs) {
      totalRefs += 1;
      if (ref.livre) {
        const m = macrosRefeicao(tabela, ref);
        if (Math.abs(m.kcal - parametros.livre.kcalMax) > 0.5) {
          erro(`${b}/${k} ${ref.h} livre fecha em ${nf(m.kcal, 0)} kcal, teto e ${parametros.livre.kcalMax}`);
        }
        if (m.p < parametros.livre.protMin) {
          erro(`${b}/${k} ${ref.h} livre tem ${nf(m.p, 0)} g de proteina, minimo e ${parametros.livre.protMin}`);
        }
        continue;
      }
      recalculadas += 1;
      const m = macrosItens(tabela, ref.itens);
      const d = [m.p - ref.m[0], m.c - ref.m[1], m.g - ref.m[2], m.kcal - ref.m[3]];
      const fora =
        Math.abs(d[0]!) > TOL_MACRO ||
        Math.abs(d[1]!) > TOL_MACRO ||
        Math.abs(d[2]!) > TOL_MACRO ||
        Math.abs(d[3]!) > TOL_KCAL;
      if (fora) {
        refsFora += 1;
        erro(
          `${b}/${k} ${ref.h} declara ${ref.m.join("/")} e recalcula ` +
            `${nf(m.p)}/${nf(m.c)}/${nf(m.g)}/${nf(m.kcal, 0)}`,
        );
      }
    }
  }
}
if (refsFora === 0) {
  ok(
    `${totalRefs} refeicoes no plano, ${recalculadas} nao livres recalculadas a partir dos itens, ` +
      `todas dentro de ${TOL_MACRO} g e ${TOL_KCAL} kcal.`,
  );
}

// ---------------------------------------------------------- totais de dia

titulo("Totais de dia");
interface Divergencia {
  dia: string;
  tot: string;
  exato: string;
  arredondado: string;
  delta: string;
}
const divergencias: Divergencia[] = [];
let totaisOk = 0;

for (const b of COD_BLOCOS) {
  for (const k of COD_MODELOS) {
    const dia = plano.dias[b]![k]!;
    const exato = totalDia(tabela, dia);
    const tupla = paraTupla(exato);
    const igual = tupla.every((v, i) => v === dia.tot[i]);
    if (igual) totaisOk += 1;
    else erro(`${b}/${k} tot declara ${dia.tot.join("/")} e o recalculo exato da ${tupla.join("/")}`);

    // o que a versao 1 mostra na tela: soma das refeicoes ja arredondadas
    const soma = dia.refs.reduce<[number, number, number, number]>(
      (acc, r) => [acc[0] + r.m[0], acc[1] + r.m[1], acc[2] + r.m[2], acc[3] + r.m[3]],
      [0, 0, 0, 0],
    );
    const delta = soma.map((v, i) => v - tupla[i]!);
    if (delta.some((v) => v !== 0)) {
      divergencias.push({
        dia: `${b}/${k}`,
        tot: dia.tot.join("/"),
        exato: tupla.join("/"),
        arredondado: soma.join("/"),
        delta: delta.map((v) => (v > 0 ? `+${v}` : String(v))).join("/"),
      });
    }
  }
}
if (totaisOk === 16) ok("16 modelos de dia, tot bate com a soma exata das refeicoes.");

if (divergencias.length > 0) {
  aviso(
    `${divergencias.length} de 16 modelos divergem se o total for feito somando refeicoes ja arredondadas. ` +
      `O tot do plano esta certo, quem erra e a soma arredondada da versao 1.`,
  );
  linhas.push("");
  linhas.push("        dia        tot (plano)        soma exata         soma arredondada   erro P/C/G/kcal");
  for (const d of divergencias) {
    linhas.push(
      `        ${d.dia.padEnd(10)} ${d.tot.padEnd(18)} ${d.exato.padEnd(18)} ${d.arredondado.padEnd(18)} ${d.delta}`,
    );
  }
}

// -------------------------------------------------------- medias de bloco

titulo("Medias de bloco");
const pesos = parametros.semanaPadrao;
const somaPesos = Object.values(pesos).reduce((a, b) => a + b, 0);
if (somaPesos !== 7) erro(`semanaPadrao soma ${somaPesos} dias, precisa somar 7`);

const medias: Record<CodBloco, number> = {} as Record<CodBloco, number>;
for (const b of COD_BLOCOS) {
  const calc = mediaSemanal(tabela, plano.dias[b]!, pesos);
  medias[b] = calc;
  const declarada = plano.blocos.find((x) => x.cod === b)!.media;
  const dif = Math.abs(calc - declarada);
  if (dif > 1) erro(`bloco ${b}: media declarada ${declarada} kcal, calculada ${nf(calc)} kcal, erro ${nf(dif)}`);
  else ok(`bloco ${b}: declarada ${declarada} kcal, calculada ${nf(calc)} kcal, erro ${nf(dif, 2)}`);
}
const degraus = [medias.A - medias.B, medias.B - medias.C, medias.C - medias.D];
ok(`degraus entre blocos: ${degraus.map((d) => nf(d, 0)).join(", ")} kcal`);

// ------------------------------------------------------------------ faixas

titulo("Faixas de data");
const faixas = [...plano.faixas].sort((a, b) => a.inicio.localeCompare(b.inicio));
let faixasOk = true;
for (const f of faixas) {
  if (f.inicio > f.fim) {
    erro(`faixa ${f.cod} comeca depois de terminar`);
    faixasOk = false;
  }
  const bloco = plano.blocos.find((b) => b.cod === f.cod);
  if (!bloco) {
    erro(`faixa ${f.cod} nao tem bloco correspondente`);
    faixasOk = false;
    continue;
  }
  const esperado = `${dataCurta(f.inicio)} a ${dataCurta(f.fim)}`;
  if (bloco.periodo !== esperado) {
    erro(`faixa ${f.cod} vai de ${esperado}, mas o bloco diz "${bloco.periodo}"`);
    faixasOk = false;
  }
}
for (let i = 1; i < faixas.length; i += 1) {
  const anterior = faixas[i - 1]!;
  const atual = faixas[i]!;
  const gap = diasEntre(anterior.fim, atual.inicio);
  if (gap !== 1) {
    erro(`buraco ou sobreposicao entre ${anterior.cod} e ${atual.cod}: ${gap} dia(s) de distancia`);
    faixasOk = false;
  }
}
if (faixasOk) {
  const ini = faixas[0]!.inicio;
  const fim = faixas[faixas.length - 1]!.fim;
  ok(`4 faixas coladas, de ${dataCurta(ini)} a ${dataCurta(fim)}, ${diasEntre(ini, fim) + 1} dias.`);
}

// ------------------------------------------------------------------- curva

titulo("Curva alvo");
const curva = plano.curva;
for (let i = 0; i < curva.length; i += 1) {
  const p = curva[i]!;
  if (p.n !== i + 1) erro(`curva fora de ordem no indice ${i}: n = ${p.n}`);
  if (diaDaSemana(p.iso) !== 1) erro(`semana ${p.n} (${p.data}) nao cai numa segunda-feira`);
  if (dataCurta(p.iso) !== p.data) erro(`semana ${p.n}: iso ${p.iso} nao bate com data "${p.data}"`);
  const daFaixa = blocoDe(p.iso, plano.faixas);
  if (daFaixa !== p.bloco) erro(`semana ${p.n}: bloco declarado ${p.bloco}, faixa diz ${daFaixa}`);
  if (i > 0) {
    const anterior = curva[i - 1]!;
    if (diasEntre(anterior.iso, p.iso) !== 7) erro(`semana ${p.n} nao esta 7 dias depois da anterior`);
    if (p.peso > anterior.peso) erro(`semana ${p.n}: a curva alvo sobe de peso`);
  }
}
const primeiro = curva[0]!;
const ultimo = curva[curva.length - 1]!;
ok(`${curva.length} pontos, de ${primeiro.data} (${nf(primeiro.peso)} kg) a ${ultimo.data} (${nf(ultimo.peso)} kg).`);

// a partida e o fechamento ficam fora da curva de segundas, mas amarram as duas pontas dela
const { partida, fechamento } = parametros;
if (dataCurta(partida.iso) !== partida.data) erro(`partida: iso ${partida.iso} nao bate com data "${partida.data}"`);
if (dataCurta(fechamento.iso) !== fechamento.data) {
  erro(`fechamento: iso ${fechamento.iso} nao bate com data "${fechamento.data}"`);
}
if (partida.iso >= primeiro.iso) erro(`a partida (${partida.data}) precisa vir antes da semana 1 (${primeiro.data})`);
if (fechamento.iso < ultimo.iso) erro(`o fechamento (${fechamento.data}) vem antes da ultima semana (${ultimo.data})`);
if (primeiro.peso > parametros.pesoInicial) erro("a semana 1 tem alvo acima do peso inicial");
if (fechamento.peso > ultimo.peso) erro("o peso do fechamento esta acima do alvo da ultima semana");
if (primeiro.cintura > partida.cintura) erro("a semana 1 tem cintura alvo acima da cintura de partida");
if (fechamento.cintura > ultimo.cintura) erro("a cintura do fechamento esta acima do alvo da ultima semana");
if (diasEntre(partida.iso, primeiro.iso) > 7) erro("a partida fica a mais de 7 dias da semana 1");
ok(
  `partida em ${partida.data} com ${nf(parametros.pesoInicial)} kg, ` +
    `fechamento em ${fechamento.data} com ${nf(fechamento.peso)} kg.`,
);

// ---------------------------------------------------------- ritmo e deficit

titulo("Ritmo e deficit");
const { perda, semanas: semanasPlano, ritmo } = resumoPlano(parametros);
const [pisoPct, tetoPct] = parametros.faixaSemanal;
const piso = pisoPct * parametros.pesoInicial;
const teto = tetoPct * parametros.pesoInicial;
const dias = diasEntre(partida.iso, fechamento.iso);
const deficitTotal = perda * parametros.kcalPorKg;

ok(`perda planejada ${nf(perda)} kg em ${nf(semanasPlano)} semanas reais, ritmo ${nf(ritmo, 2)} kg por semana.`);
ok(
  `faixa segura ${nf(piso, 2)} a ${nf(teto, 2)} kg por semana ` +
    `(${nf(pisoPct * 100, 1)} a ${nf(tetoPct * 100, 1)}% de ${nf(parametros.pesoInicial)} kg).`,
);
ok(`deficit acumulado ${nf(deficitTotal, 0)} kcal em ${dias} dias, ${nf(deficitTotal / dias, 0)} kcal por dia.`);
if (ritmo < piso || ritmo > teto) erro(`ritmo ${nf(ritmo, 2)} kg por semana esta fora da faixa segura`);

const lim = parametros.ritmo;
if (!(lim.paradoKg < lim.minimoKg && lim.minimoKg < lim.rapidoKg)) {
  erro("parametros.ritmo precisa ter paradoKg < minimoKg < rapidoKg");
}
if (ritmo <= lim.minimoKg || ritmo >= lim.rapidoKg) {
  erro(`o ritmo do plano (${nf(ritmo, 2)}) precisa ficar entre minimoKg e rapidoKg, senao a tela Peso alerta o proprio plano`);
}
if (lim.rapidoKg > teto) erro("parametros.ritmo.rapidoKg esta acima do teto da faixa segura");
ok(
  `leitura de ritmo: parado abaixo de ${nf(lim.paradoKg)}, abaixo do ritmo ate ${nf(lim.minimoKg)}, ` +
    `rapido acima de ${nf(lim.rapidoKg)} kg por semana.`,
);

// ------------------------------------------------------------ doce oficial

titulo("Doce oficial e caminhada");
const doce = macrosDoce(parametros);
if (doce.kcal > parametros.doce.kcalMax) {
  erro(`o doce oficial fecha em ${nf(doce.kcal, 0)} kcal, acima do teto de ${parametros.doce.kcalMax}`);
} else {
  ok(`doce oficial de ${nf(doce.kcal, 0)} kcal, dentro do teto de ${parametros.doce.kcalMax}.`);
}
ok(`caminhada de ${parametros.caminhada.minutos} min por dia, meta de ${parametros.caminhada.passos} passos.`);

// -------------------------------------------------------------- alimentos

titulo("Tabela de alimentos");
const usados = new Set<string>();
for (const b of COD_BLOCOS) {
  for (const k of COD_MODELOS) {
    for (const ref of plano.dias[b]![k]!.refs) for (const it of ref.itens) usados.add(it.n);
  }
}
let faltando = 0;
for (const nome of usados) {
  if (!tabela[nome]) {
    erro(`o plano usa "${nome}", que nao esta na tabela de alimentos`);
    faltando += 1;
  }
}
if (faltando === 0) ok(`${usados.size} alimentos usados no plano, todos presentes na tabela.`);
for (const nome of Object.keys(parametros.rendimento)) {
  if (!tabela[nome]) erro(`parametros.rendimento cita "${nome}", que nao esta na tabela de alimentos`);
  else if (!usados.has(nome)) aviso(`parametros.rendimento cita "${nome}", que nenhuma refeicao usa.`);
}

// ---------------------------------------------------------------- compras

titulo("Lista de compras");
for (const nome of usados) {
  const m = parametros.mercado[nome];
  if (!m) erro(`o plano usa "${nome}", que nao tem secao de mercado em parametros.mercado`);
  else if (!parametros.secoes.includes(m.secao)) {
    erro(`"${nome}" esta na secao "${m.secao}", que nao existe em parametros.secoes`);
  }
}
for (const nome of Object.keys(parametros.embalagens)) {
  if (!tabela[nome]) erro(`parametros.embalagens cita "${nome}", que nao esta na tabela de alimentos`);
}

let itensDerivados = 0;
for (const b of COD_BLOCOS) {
  const lista = listaDeCompras(plano, b);
  const derivada = itensDaLista(lista);
  itensDerivados += derivada.length;
  for (const item of derivada) {
    if (!Number.isFinite(item.comprar) || item.comprar <= 0) {
      erro(`bloco ${b}: "${item.nome}" derivou quantidade invalida (${item.comprar})`);
    }
  }
}
ok(`${itensDerivados} itens derivados nos 4 blocos, todos com secao e quantidade positiva.`);

// -------------------------------------------------------------- fechamento

const nomeModelo: Record<CodModelo, string> = {
  t11: "treino 11h",
  t1630: "treino 16h30",
  off: "sem treino",
  fds: "fim de semana",
};
titulo("Resumo");
linhas.push(`  blocos      ${plano.blocos.map((b) => b.cod).join(", ")}`);
linhas.push(`  modelos     ${COD_MODELOS.map((k) => `${k} (${nomeModelo[k]})`).join(", ")}`);
linhas.push(`  semana      ${COD_MODELOS.map((k) => `${pesos[k] ?? 0} x ${k}`).join(", ")}`);
linhas.push(`  refeicoes   ${totalRefs}`);
linhas.push(`  erros       ${erros.length}`);
linhas.push(`  notas       ${avisos.length}`);
linhas.push("");

console.log(linhas.join("\n"));

if (erros.length > 0) {
  console.error(`plano invalido: ${erros.length} erro(s).`);
  process.exit(1);
}
console.log("plano valido.");
