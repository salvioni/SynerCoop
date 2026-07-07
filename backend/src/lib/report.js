// Port do report_generator.py — usa pacote docx (npm) para gerar .docx.

import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  convertInchesToTwip, ImageRun, Footer, PageNumber
} from 'docx';
import { imageSize } from 'image-size';
import { generateText, parseJsonFromLLM } from './llm.js';

const LOGO_MIME_TO_DOCX_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/bmp': 'bmp' };
const LOGO_MAX_WIDTH = 160;
const LOGO_MAX_HEIGHT = 90;

// SQLite CURRENT_TIMESTAMP grava 'YYYY-MM-DD HH:MM:SS' em UTC, sem indicação
// de fuso — sem o 'Z', new Date(...) interpretaria como horário local e
// mostraria uma hora errada pro assinante.
function formatSignedAt(raw) {
  if (!raw) return '';
  const d = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Decodifica o data URL (data:<mime>;base64,<...>) salvo em tenants.logo e
// monta um ImageRun já escalado (mantendo proporção) pra caber na capa do
// relatório. Qualquer falha aqui (formato inesperado, base64 corrompido)
// apenas omite o logo — nunca deve travar a geração do relatório.
function buildLogoImage(logoDataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(logoDataUrl || '');
  if (!match) return null;
  const docxType = LOGO_MIME_TO_DOCX_TYPE[match[1]];
  if (!docxType) return null;

  let buffer, dims;
  try {
    buffer = Buffer.from(match[2], 'base64');
    dims = imageSize(buffer);
  } catch { return null; }
  if (!dims?.width || !dims?.height) return null;

  const scale = Math.min(LOGO_MAX_WIDTH / dims.width, LOGO_MAX_HEIGHT / dims.height, 1);
  return new ImageRun({
    type: docxType,
    data: buffer,
    transformation: { width: Math.round(dims.width * scale), height: Math.round(dims.height * scale) },
  });
}

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

  const raw = await generateText(prompt);
  return parseJsonFromLLM(raw);
}

const NAVY = '0D1E3B';
const GRAY = '5C646F';
const BODY_COLOR = '2A3442';
const MUTED = '8A929D';
const GREEN_BG = 'E8F5E9';
const GREEN_T = '14874E';
const YELLOW_BG = 'FFF8E1';
const YELLOW_T = 'EB881F';
const RED_BG = 'FFEBEE';
const RED_T = 'D01D21';
const BLUE_LABEL = '0D1E3B';
const BORDER = 'DADEE5';

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

async function buildDocx(companyName, companyType, year, narrative, logo, signature) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const logoImage = buildLogoImage(logo);

  const children = [
    // Logo do escritório (marca branca), se configurado em Ajustes
    ...(logoImage ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImage], spacing: { after: 200 } })] : []),

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
      // O prompt pede "Recomendação N com título curto: descrição", mas na
      // prática a IA quase sempre devolve só "Recomendação N: descrição"
      // (um único ':'), sem um título curto separado — extrair um título daí
      // dava vazio silenciosamente e derrubava junto o selo de prioridade.
      // Por isso o selo agora é sempre mostrado (vem do índice, não do
      // texto), e só limpamos o prefixo "Recomendação N:" da descrição.
      const desc = rec.replace(/^Recomendação\s*\d*\s*:\s*/i, '').trim() || rec;
      const priority = i < 2 ? 'ALTA' : 'MÉDIA';
      const prColor = i < 2 ? RED_T : YELLOW_T;

      const runs = [
        new TextRun({ text: `${String(i + 1).padStart(2, '0')}  `, size: 28, color: MUTED, font: 'Georgia' }),
        new TextRun({ text: `PRIORIDADE ${priority}`, size: 16, bold: true, color: prColor }),
      ];

      return [
        new Paragraph({ children: runs, spacing: { before: 200, after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: desc, size: 22, color: BODY_COLOR })], spacing: { after: 120 }, indent: { left: 560 } }),
      ];
    }).flat(),

    new Paragraph({ spacing: { after: 320 } }),

    // Bloco de assinatura — só aparece quando a análise foi assinada (ver
    // POST /analyses/:id/sign). Sem assinatura, o relatório segue como
    // rascunho revisável, sem essa marca de aprovação formal.
    ...(signature?.name ? [
      new Paragraph({ spacing: { before: 200 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 4 },
        children: [new TextRun({ text: '_______________________________', size: 22, color: BORDER })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: signature.name, size: 22, bold: true, color: NAVY })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: `Assinado eletronicamente em ${formatSignedAt(signature.at)}`, size: 16, italics: true, color: MUTED })],
      }),
    ] : []),

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
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 16, color: MUTED })],
            }),
          ],
        }),
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function generateReport(companyName, companyType, year, indicators, bp, dsp, existingNarrative, logo, signature) {
  const narrative = existingNarrative || await generateNarrative(companyName, companyType, year, indicators, bp, dsp);
  return buildDocx(companyName, companyType, year, narrative, logo, signature);
}
