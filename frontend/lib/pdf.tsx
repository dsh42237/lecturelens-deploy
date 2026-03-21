"use client";

import mermaid from "mermaid";
import type { SessionInfo } from "./api";

type PdfMode = "download" | "open";
type MarkdownBlock =
  | { type: "subtitle"; text: string }
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "mermaid"; code: string };

let mermaidReady = false;
let mermaidCounter = 0;

const MERMAID_TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\n/g, " / "],
  [/!=/g, " not equal "],
  [/∑/g, "Sigma"],
  [/Σ/g, "Sigma"],
  [/Δ/g, "delta"],
  [/≠/g, "not equal"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/→/g, "to"],
  [/←/g, "from"],
  [/↔/g, "with"],
  [/×/g, "x"],
  [/÷/g, "/"],
  [/·/g, "-"]
];

function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "default"
  });
  mermaidReady = true;
}

function sanitizeLabel(label: string) {
  let sanitized = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  for (const [pattern, replacement] of MERMAID_TOKEN_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  sanitized = sanitized.replace(/[^\x20-\x7E]/g, " ");
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized;
}

function sanitizeMermaidCode(source: string) {
  let sanitized = source.trim();
  for (const [pattern, replacement] of MERMAID_TOKEN_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  sanitized = sanitized
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "";
      return line.replace(
        /(\[[^\]]*\]|\([^\)]*\)|\{[^}]*\}|\"[^\"]*\"|\|[^|]*\|)/g,
        (segment) => {
          const start = segment[0];
          const end = segment[segment.length - 1];
          return `${start}${sanitizeLabel(segment.slice(1, -1))}${end}`;
        }
      );
    })
    .join("\n");

  sanitized = sanitized.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
  sanitized = sanitized.replace(/[ ]{2,}/g, " ");
  return sanitized.trim();
}

function drawTextToken(
  doc: import("jspdf").jsPDF,
  token: { text: string; isMath: boolean },
  x: number,
  y: number
) {
  doc.setFont(token.isMath ? "times" : "helvetica", token.isMath ? "italic" : "normal");
  doc.text(token.text, x, y);
}

function measureTextToken(
  doc: import("jspdf").jsPDF,
  token: { text: string; isMath: boolean }
) {
  doc.setFont(token.isMath ? "times" : "helvetica", token.isMath ? "italic" : "normal");
  return doc.getTextWidth(token.text);
}

function normalizeMathText(text: string) {
  let normalized = text;
  for (let i = 0; i < 6; i += 1) {
    normalized = normalized.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)");
    normalized = normalized.replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)");
  }
  return normalized
    .replace(/\\pm/g, "±")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\neq/g, "≠")
    .replace(/\\geq/g, "≥")
    .replace(/\\leq/g, "≤")
    .replace(/\\to/g, "→")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\text\{([^{}]+)\}/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMixedText(text: string) {
  const tokens: { text: string; isMath: boolean }[] = [];
  const pattern = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain.trim()) {
        tokens.push({ text: plain, isMath: false });
      }
    }
    const mathExpr = match[1] ?? match[2];
    const normalized = normalizeMathText(mathExpr);
    if (normalized) {
      tokens.push({ text: normalized, isMath: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const plain = text.slice(lastIndex);
    if (plain.trim()) {
      tokens.push({ text: plain, isMath: false });
    }
  }

  if (tokens.length === 0) {
    tokens.push({ text, isMath: false });
  }

  return tokens;
}

function normalizeInlineMath(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function parseMarkdownBlocks(content: string): { subtitle: string | null; blocks: MarkdownBlock[] } {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let subtitle: string | null = null;
  let inMermaid = false;
  let mermaidLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("```")) {
      if (line === "```mermaid") {
        inMermaid = true;
        mermaidLines = [];
        continue;
      }
      if (inMermaid) {
        blocks.push({ type: "mermaid", code: mermaidLines.join("\n").trim() });
        inMermaid = false;
        mermaidLines = [];
      }
      continue;
    }

    if (inMermaid) {
      mermaidLines.push(rawLine);
      continue;
    }

    if (line === "# Lecture Notes") {
      continue;
    }

    if (line.startsWith("> ")) {
      const text = normalizeInlineMath(line.slice(2));
      if (!subtitle) {
        subtitle = text;
      } else {
        blocks.push({ type: "subtitle", text });
      }
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "heading", text: normalizeInlineMath(line.slice(3)) });
      continue;
    }

    if (line.startsWith("- ")) {
      blocks.push({ type: "bullet", text: normalizeInlineMath(line.slice(2)) });
      continue;
    }

    blocks.push({ type: "paragraph", text: normalizeInlineMath(line) });
  }

  return { subtitle, blocks };
}

async function getImageDataUrl(src: string, alpha = 1) {
  const response = await fetch(src);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context unavailable for PDF export");
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = alpha;
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderMermaidToDataUrl(code: string) {
  ensureMermaid();
  const sanitized = sanitizeMermaidCode(code);
  if (!sanitized) {
    return null;
  }

  try {
    const result = await mermaid.render(`pdf-mermaid-${mermaidCounter++}`, sanitized);
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(result.svg, "image/svg+xml");
    const svgElement = svgDoc.documentElement;
    const width = Number.parseFloat(svgElement.getAttribute("width") || "1200") || 1200;
    const height = Number.parseFloat(svgElement.getAttribute("height") || "700") || 700;

    const svgBlob = new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("Failed to load Mermaid SVG"));
        element.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return {
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function buildFileName(session: SessionInfo) {
  const course = (session.course_code ?? "lecture").replace(/[^a-z0-9_-]+/gi, "-");
  const date = new Date(session.started_at).toISOString().slice(0, 10);
  return `LectureLens-${course}-${date}.pdf`;
}

function drawChrome(
  doc: import("jspdf").jsPDF,
  session: SessionInfo,
  logoDataUrl: string,
  watermarkDataUrl: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);

    doc.addImage(watermarkDataUrl, "PNG", pageWidth / 2 - 120, pageHeight / 2 - 120, 240, 240);

    doc.setDrawColor(219, 228, 240);
    doc.line(36, 58, pageWidth - 36, 58);
    doc.line(36, pageHeight - 42, pageWidth - 36, pageHeight - 42);

    doc.addImage(logoDataUrl, "PNG", 38, 22, 24, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("LectureLens", 70, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(session.course_code ?? "Lecture session", 70, 44);
    doc.text(session.course_name ?? "Lecture Notes", pageWidth - 38, 30, { align: "right" });
    doc.text(new Date(session.started_at).toLocaleDateString(), pageWidth - 38, 44, {
      align: "right"
    });

    doc.setFontSize(9);
    doc.text("LectureLens Study Pack", 38, pageHeight - 26);
    doc.text(session.course_code ?? "Lecture session", pageWidth / 2, pageHeight - 26, {
      align: "center"
    });
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 38, pageHeight - 26, {
      align: "right"
    });
  }
}

function ensurePage(
  doc: import("jspdf").jsPDF,
  cursorY: number,
  neededHeight: number,
  top: number,
  bottom: number
) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight <= pageHeight - bottom) {
    return cursorY;
  }
  doc.addPage();
  return top;
}

function layoutTextLines(
  doc: import("jspdf").jsPDF,
  text: string,
  width: number,
  indent = 0
) {
  const tokens = tokenizeMixedText(text);
  const lines: { text: string; isMath: boolean }[][] = [[]];
  let lineWidth = indent;

  for (const token of tokens) {
    const pieces = token.text.replace(/\s+/g, " ").trim().split(" ");
    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
      const piece = pieces[pieceIndex];
      if (!piece) continue;
      const display = lineWidth === indent && lines[lines.length - 1].length === 0 ? piece : ` ${piece}`;
      const pieceToken = { text: display, isMath: token.isMath };
      const pieceWidth = measureTextToken(doc, pieceToken);

      if (lineWidth + pieceWidth > width && lines[lines.length - 1].length > 0) {
        lines.push([{ text: piece, isMath: token.isMath }]);
        lineWidth = indent + measureTextToken(doc, { text: piece, isMath: token.isMath });
      } else {
        lines[lines.length - 1].push(pieceToken);
        lineWidth += pieceWidth;
      }
    }
  }

  return lines;
}

function drawWrappedText(
  doc: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  indent = 0
) {
  const lines = layoutTextLines(doc, text, width, indent);
  let cursorY = y;
  for (const line of lines) {
    let cursorX = x;
    for (const token of line) {
      drawTextToken(doc, token, cursorX, cursorY);
      cursorX += measureTextToken(doc, token);
    }
    cursorY += lineHeight;
  }
  return cursorY;
}

export async function exportSessionPdf(
  session: SessionInfo,
  mode: PdfMode = "download",
  previewWindow?: Window | null
) {
  const [{ jsPDF }] = await Promise.all([import("jspdf")]);

  const [logoDataUrl, watermarkDataUrl] = await Promise.all([
    getImageDataUrl("/Logo.jpeg", 1),
    getImageDataUrl("/Logo.jpeg", 0.05)
  ]);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  const top = 78;
  const bottom = 54;
  const contentWidth = pageWidth - marginX * 2;
  const accentBlue: [number, number, number] = [29, 78, 216];
  const textColor: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [100, 116, 139];

  const { subtitle, blocks } = parseMarkdownBlocks(session.final_notes_text ?? "");

  let y = top;

  doc.setFillColor(248, 251, 255);
  doc.setDrawColor(219, 228, 240);
  doc.roundedRect(marginX, y, contentWidth, 118, 18, 18, "FD");
  doc.addImage(logoDataUrl, "PNG", marginX + 18, y + 18, 36, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...accentBlue);
  doc.text("LECTURELENS STUDY PACK", marginX + 68, y + 24);
  doc.setFontSize(24);
  doc.setTextColor(...textColor);
  doc.text(session.course_name ?? "Lecture Notes", marginX + 68, y + 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...muted);
  doc.text(session.course_code ?? "Lecture session", marginX + 68, y + 72);

  const rightX = marginX + contentWidth - 18;
  doc.setFontSize(11);
  doc.text(`Session ${session.id.slice(0, 8)}`, rightX, y + 26, { align: "right" });
  doc.text(`Started ${new Date(session.started_at).toLocaleString()}`, rightX, y + 46, {
    align: "right",
  });
  doc.text(
    `Ended ${session.ended_at ? new Date(session.ended_at).toLocaleString() : "In progress"}`,
    rightX,
    y + 66,
    { align: "right" }
  );

  y += 138;

  if (subtitle) {
    doc.setFontSize(14);
    doc.setTextColor(71, 85, 105);
    y = drawWrappedText(doc, subtitle, marginX, y, contentWidth, 18);
    y += 10;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(124, 109, 68);
  doc.text("FINAL NOTES", marginX, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...textColor);

  for (const block of blocks) {
    if (block.type === "subtitle") {
      y = ensurePage(doc, y, 34, top, bottom);
      doc.setFont("times", "italic");
      doc.setFontSize(13);
      doc.setTextColor(...muted);
      y = drawWrappedText(doc, block.text, marginX, y, contentWidth, 17);
      y += 6;
      continue;
    }

    if (block.type === "heading") {
      y = ensurePage(doc, y, 44, top, bottom);
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, y + 4, marginX + contentWidth, y + 4);
      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...textColor);
      doc.text(block.text, marginX, y);
      y += 16;
      continue;
    }

    if (block.type === "bullet") {
      y = ensurePage(doc, y, 30, top, bottom);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(...textColor);
      doc.text("•", marginX + 2, y);
      const nextY = drawWrappedText(doc, block.text, marginX + 16, y, contentWidth - 16, 16);
      y = nextY + 6;
      continue;
    }

    if (block.type === "paragraph") {
      y = ensurePage(doc, y, 28, top, bottom);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(...textColor);
      y = drawWrappedText(doc, block.text, marginX, y, contentWidth, 16);
      y += 8;
      continue;
    }

    if (block.type === "mermaid") {
      const rendered = await renderMermaidToDataUrl(block.code);
      if (!rendered) {
        continue;
      }
      const maxDiagramWidth = contentWidth - 16;
      const diagramHeight = (rendered.height / rendered.width) * maxDiagramWidth;
      y = ensurePage(doc, y, diagramHeight + 38, top, bottom);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(219, 228, 240);
      doc.roundedRect(marginX, y, contentWidth, diagramHeight + 20, 14, 14, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...muted);
      doc.text("Concept Diagram", marginX + 14, y + 16);
      doc.addImage(
        rendered.dataUrl,
        "PNG",
        marginX + 8,
        y + 24,
        maxDiagramWidth,
        diagramHeight,
        undefined,
        "FAST"
      );
      y += diagramHeight + 34;
    }
  }

  drawChrome(doc, session, logoDataUrl, watermarkDataUrl);

  if (mode === "open") {
    const url = String(doc.output("bloburl"));
    if (previewWindow && !previewWindow.closed) {
      previewWindow.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return;
  }

  doc.save(buildFileName(session));
}
