"use client";

import { createRoot } from "react-dom/client";
import type { SessionInfo } from "./api";
import SessionPdfDocument from "../components/SessionPdfDocument";

type PdfMode = "download" | "open";

async function waitForRender(container: HTMLElement) {
  if ("fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font-loading issues in export mode.
    }
  }

  await new Promise((resolve) => window.setTimeout(resolve, 900));

  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.onload = () => resolve();
          image.onerror = () => resolve();
        })
    )
  );

  await new Promise((resolve) => window.setTimeout(resolve, 300));
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

export async function exportSessionPdf(
  session: SessionInfo,
  mode: PdfMode = "download",
  previewWindow?: Window | null
) {
  const [{ jsPDF }] = await Promise.all([import("jspdf")]);

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: "794px",
    background: "#ffffff",
    zIndex: "-1",
    pointerEvents: "none"
  });
  container.className = "pdf-export-root";
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<SessionPdfDocument session={session} />);

  try {
    await waitForRender(container);
    const [logoDataUrl, watermarkDataUrl] = await Promise.all([
      getImageDataUrl("/Logo.jpeg", 1),
      getImageDataUrl("/Logo.jpeg", 0.05)
    ]);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true
    });

    await new Promise<void>((resolve) => {
      doc.html(container, {
        x: 42,
        y: 74,
        width: 512,
        windowWidth: 794,
        autoPaging: "text",
        html2canvas: {
          scale: 0.78,
          useCORS: true,
          backgroundColor: "#ffffff"
        },
        callback: () => resolve()
      });
    });

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
  } finally {
    root.unmount();
    container.remove();
  }
}
