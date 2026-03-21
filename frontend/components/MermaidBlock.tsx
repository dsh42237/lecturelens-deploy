"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

interface MermaidBlockProps {
  code: string;
}

let mermaidReady = false;

function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "default"
  });
  mermaidReady = true;
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const id = useId().replace(/[:]/g, "-");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    ensureMermaid();
    mermaid
      .render(`mermaid-${id}`, code)
      .then((result) => {
        if (!active) return;
        setSvg(result.svg);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      });

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
