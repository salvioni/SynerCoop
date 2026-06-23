// Port do report_generator.py — usa pacote docx (npm) para gerar .docx.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  convertInchesToTwip
} from 'docx';
import { generateText } from './llm.js';

const REPORT_PROMPT = `Você é um analista financeiro especializado em cooperativas brasileiras.

Com base nos indicadores financeiros abaixo, gere um relatório de análise detalhado e profissional.

Empresa: {company_name}
Tipo: {company_type}
Exercício: {year}

INDICADORES CALCULADOS:
{indicators_json}

VALORES DO BALANÇO PATRIMONIAL:
{bp_json}

VALORES DO DSP:
{dsp_json}

Retorne SOMENTE um JSON válido (sem texto antes ou depois) com esta estrutura:

{
  "sumario_executivo": "Parágrafo de 3-5 frases resumindo a situação financeira geral da empresa/cooperativa.",
  "liquidez": "Parágrafo analisando os índices de liquidez geral, liquidez corrente, liquidez seca e imobilização. Cite os valores exatos.",
  "rentabilidade": "Parágrafo analisando ROE, ROA, rentabilidade dos ingressos e EBITDA. Cite os valores exatos.",
  "endividamento": "Parágrafo analisando endividamento total, perfil, alavancagem e estrutura de capital. Cite os valores exatos.",
  "capacidade_operacional": "Parágrafo analisando PME, PMR, PMP, ciclo financeiro e giro do ativo. Cite os valores exatos.",
  "tesouraria": "Parágrafo analisando capital de giro, NCG, tesouraria e independência financeira. Cite os valores exatos.",
  "forcas": "1-2 frases sobre os pontos fortes identificados.",
  "fraquezas": "1-2 frases sobre os pontos de atenção críticos.",
  "riscos": "1-2 frases sobre os riscos identificados.",
  "recomendacoes": [
    "Recomendação 1 com título curto: descrição da ação necessária.",
    "Recomendação 2 com título curto: descrição da ação necessária.",
    "Recomendação 3 com título curto: descrição da ação necessária.",
    "Recomendação 4 com título curto: descrição da ação necessária."
  ]
}

Regras:
- Use linguagem profissional mas acessível para contadores e diretores de cooperativa
- Cooperativas usam "sobras/perdas" em vez de "lucro/prejuízo", "ingressos" em vez de "receita"
- Seja específico: cite os valores exatos dos indicadores
- Identifique claramente o que é positivo, o que é preocupante e o que é crítico
- As recomendações devem ser práticas e acionáveis`;

async function generateNarrative(companyName, companyType, year, indicators, bp, dsp) {
  const prompt = REPORT_PROMPT
    .replace('{company_name}', companyName)
    .replace('{company_type}', companyType)
    .replace('{year}', year)
    .replace('{indicators_json}', JSON.stringify(indicators, null, 2))
    .replace('{bp_json}', JSON.stringify(bp, null, 2))
    .replace('{dsp_json}', JSON.stringify(dsp, null, 2));

  let raw = await generateText(prompt);

  if (raw.startsWith('```')) {
    const parts = raw.split('```');
    raw = parts[1] || parts[0];
    if (raw.startsWith('json')) raw = raw.slice(4);
  }
  return JSON.parse(raw.trim());
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

const NAVY = '0D1E3B';
const GRAY = '5C646F';
const BODY_COLOR = '2A3442';
const MUTED = '8A929D';
const GOLD = 'C6A050';
const GREEN_BG = 'E8F5E9';
const GREEN_T = '14874E';
const YELLOW_BG = 'FFF8E1';
const YELLOW_T = 'EB881F';
const RED_BG = 'FFEBEE';
const RED_T = 'D01D21';
const BLUE_LABEL = '0D1E3B';
const BORDER = 'DADEE5';
const BG_MUTED = 'F1F0F5';

function sectionLabel(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), size: 18, color: BLUE_LABEL, bold: true })],
    spacing: { before: 300, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER, space: 6 } },
  });
}

function mainHeading(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 28, color: NAVY, font: 'Georgia' })],
    spacing: { before: 360, after: 140 },
  });
}

function subHeading(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), size: 18, color: BLUE_LABEL, bold: true })],
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER, space: 4 } },
  });
}

function bodyText(text) {
  if (!text) return new Paragraph({ spacing: { after: 80 } });
  return new Paragraph({
    children: [new TextRun({ text, size: 22, color: BODY_COLOR })],
    spacing: { after: 160 },
  });
}

function makeSwotCell(label, text, bgHex, colorHex) {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  return new TableCell({
    children: [
      new Paragraph({ children: [new TextRun({ text: label, bold: true, color: colorHex, size: 20 })], spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: text || '—', size: 20, color: BODY_COLOR })], spacing: { after: 40 } }),
    ],
    shading: { fill: bgHex, type: ShadingType.CLEAR, color: 'auto' },
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    borders,
  });
}

async function buildDocx(companyName, companyType, year, narrative, indicators) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');

  const children = [
    // Título
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Relatório de Análise de Desempenho Financeiro', size: 40, color: NAVY, font: 'Georgia' })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${companyName}  •  Exercício ${year}`, size: 24, color: GRAY })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Emitido em ${dateStr}`, size: 18, color: MUTED, italics: true })],
      spacing: { after: 400 },
    }),

    // 1. Sumário
    mainHeading('1. Sumário Executivo'),
    bodyText(narrative.sumario_executivo || narrative.sumario || ''),

    // 2. Análise por Pilares
    mainHeading('2. Análise por Pilares'),

    subHeading('A. Liquidez e Eficiência Econômica'),
    bodyText(narrative.liquidez || ''),

    subHeading('B. Rentabilidade'),
    bodyText(narrative.rentabilidade || ''),

    subHeading('C. Endividamento'),
    bodyText(narrative.endividamento || ''),

    subHeading('D. Capacidade Operacional'),
    bodyText(narrative.capacidade_operacional || ''),

    subHeading('E. Tesouraria e Capital de Giro'),
    bodyText(narrative.tesouraria || ''),

    // 3. SWOT
    mainHeading('3. Diagnóstico — SWOT Financeiro'),
    new Paragraph({ spacing: { after: 80 } }),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [
        new TableRow({ children: [
          makeSwotCell('Forças', narrative.forcas || '', GREEN_BG, GREEN_T),
          makeSwotCell('Fraquezas', narrative.fraquezas || '', YELLOW_BG, YELLOW_T),
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph('')], borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, margins: { top: 40, bottom: 40 } }),
          new TableCell({ children: [new Paragraph('')], borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, margins: { top: 40, bottom: 40 } }),
        ]}),
        new TableRow({ children: [
          makeSwotCell('Riscos', narrative.riscos || '', RED_BG, RED_T),
          new TableCell({ children: [new Paragraph('')], shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } } }),
        ]}),
      ],
    }),

    // 4. Recomendações
    mainHeading('4. Recomendações Estratégicas'),
    ...(narrative.recomendacoes || []).map((rec, i) => {
      const colonIdx = rec.indexOf(':');
      const title = colonIdx > 0 ? rec.substring(0, colonIdx).replace(/^Recomendação\s*\d*\s*/i, '').trim() : '';
      const desc = colonIdx > 0 ? rec.substring(colonIdx + 1).trim() : rec;
      const priority = i < 2 ? 'ALTA' : 'MÉDIA';
      const prColor = i < 2 ? RED_T : YELLOW_T;

      const runs = [
        new TextRun({ text: `${String(i + 1).padStart(2, '0')}  `, size: 28, color: MUTED, font: 'Georgia' }),
      ];
      if (title) {
        runs.push(new TextRun({ text: title + '  ', size: 22, bold: true, color: NAVY }));
        runs.push(new TextRun({ text: priority, size: 16, bold: true, color: prColor }));
      }

      return [
        new Paragraph({ children: runs, spacing: { before: 200, after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: desc || rec, size: 22, color: BODY_COLOR })], spacing: { after: 120 }, indent: { left: 560 } }),
      ];
    }).flat(),

    new Paragraph({ spacing: { after: 320 } }),

    // Footer
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER, space: 8 } },
      children: [new TextRun({ text: 'Relatório gerado por SynerCoop · IA assistida · Revise antes de enviar ao cliente', size: 16, italics: true, color: MUTED })],
      spacing: { before: 200 },
    }),
  ];

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22, color: BODY_COLOR } } },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(1.0), right: convertInchesToTwip(1.0) },
        },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function generateReport(companyName, companyType, year, indicators, bp, dsp, existingNarrative) {
  const narrative = existingNarrative || await generateNarrative(companyName, companyType, year, indicators, bp, dsp);
  return buildDocx(companyName, companyType, year, narrative, indicators);
}
