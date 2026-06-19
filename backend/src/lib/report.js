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

function makeHeading(text, level) {
  return new Paragraph({
    text,
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });
}

function makeBody(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 160 },
  });
}

function makeSwotRow(label, text, bgHex, labelColorHex) {
  const { r: lr, g: lg, b: lb } = hexToRgb(labelColorHex);
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true, color: labelColorHex, size: 20 })],
        })],
        shading: { fill: bgHex, type: ShadingType.CLEAR, color: 'auto' },
        width: { size: 15, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text, size: 20 })],
        })],
        width: { size: 85, type: WidthType.PERCENTAGE },
      }),
    ],
  });
}

async function buildDocx(companyName, companyType, year, narrative, indicators) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');

  const children = [
    // Título
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: 'Relatório de Análise de Desempenho Financeiro',
        bold: true, size: 36, color: '1e3a5f',
      })],
      spacing: { after: 120 },
    }),
    // Subtítulo
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `${companyName}  •  Exercício ${year}`,
        size: 26, color: '4f6ef7',
      })],
      spacing: { after: 80 },
    }),
    // Data
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `Emitido em ${dateStr}`,
        size: 20, color: '6b7280', italics: true,
      })],
      spacing: { after: 320 },
    }),

    // Seção 1
    makeHeading('1. Sumário Executivo', 1),
    makeBody(narrative.sumario_executivo || ''),
    new Paragraph({ spacing: { after: 200 } }),

    // Seção 2
    makeHeading('2. Análise por Pilares', 1),
    makeHeading('A. Liquidez e Eficiência Econômica', 2),
    makeBody(narrative.liquidez || ''),
    makeHeading('B. Rentabilidade', 2),
    makeBody(narrative.rentabilidade || ''),
    makeHeading('C. Endividamento', 2),
    makeBody(narrative.endividamento || ''),
    makeHeading('D. Capacidade Operacional', 2),
    makeBody(narrative.capacidade_operacional || ''),
    makeHeading('E. Tesouraria e Capital de Giro', 2),
    makeBody(narrative.tesouraria || ''),
    new Paragraph({ spacing: { after: 200 } }),

    // Seção 3 — SWOT
    makeHeading('3. Diagnóstico — SWOT Financeiro', 1),
    new Table({
      rows: [
        makeSwotRow('Forças', narrative.forcas || '', 'D4EDDA', '155724'),
        makeSwotRow('Fraquezas', narrative.fraquezas || '', 'FFF3CD', '856404'),
        makeSwotRow('Riscos', narrative.riscos || '', 'F8D7DA', '721C24'),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    new Paragraph({ spacing: { after: 200 } }),

    // Seção 4 — Recomendações
    makeHeading('4. Recomendações Estratégicas', 1),
    ...(narrative.recomendacoes || []).map((rec, i) => {
      const parts = rec.includes(':') ? rec.split(':', 2) : [null, rec];
      const runs = [];
      if (parts[0]) {
        runs.push(new TextRun({ text: parts[0] + ':', bold: true, size: 22 }));
        runs.push(new TextRun({ text: parts[1], size: 22 }));
      } else {
        runs.push(new TextRun({ text: rec, size: 22 }));
      }
      return new Paragraph({
        children: runs,
        numbering: { reference: 'default', level: 0 },
        spacing: { after: 120 },
      });
    }),
    new Paragraph({ spacing: { after: 240 } }),

    // Rodapé
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: 'Relatório gerado automaticamente pelo FinAnalyze · Uso exclusivo do escritório contratante',
        size: 16, italics: true, color: '9ca3af',
      })],
    }),
  ];

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default',
        levels: [{
          level: 0,
          format: 'decimal',
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.8),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(1.0),
            right: convertInchesToTwip(1.0),
          },
        },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function generateReport(companyName, companyType, year, indicators, bp, dsp) {
  const narrative = await generateNarrative(companyName, companyType, year, indicators, bp, dsp);
  return buildDocx(companyName, companyType, year, narrative, indicators);
}
