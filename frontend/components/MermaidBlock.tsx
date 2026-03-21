"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

interface MermaidBlockProps {
  code: string;
}

let mermaidReady = false;
const MERMAID_TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\n/g, " / "],
  [/!=/g, " not equal "],
  [/∑/g, "Sigma"],
  [/Σ/g, "Sigma"],
  [/Δ/g, "delta"],
  [/≠/g, "!="],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/→/g, "->"],
  [/←/g, "<-"],
  [/↔/g, "<->"],
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
      if (!line.trim()) {
        return "";
      }
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

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const id = useId().replace(/[:]/g, "-");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    ensureMermaid();
    const sanitized = sanitizeMermaidCode(code);
    const attempts = sanitized && sanitized !== code ? [code, sanitized] : [code];

    async function renderDiagram() {
      for (const [index, attempt] of attempts.entries()) {
        try {
          const result = await mermaid.render(`mermaid-${id}-${index}`, attempt);
          if (!active) return;
          setSvg(result.svg);
          setError(null);
          return;
        } catch (err) {
          if (index === attempts.length - 1 && active) {
            setError(err instanceof Error ? err.message : "Failed to render diagram");
          }
        }
      }
    }

    void renderDiagram();

    return () => {
      active = false;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="mermaid-fallback">
        <strong>Diagram unavailable</strong>
        <pre>{code}</pre>
      </div>
    );
  }

  return <div className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />;
}
