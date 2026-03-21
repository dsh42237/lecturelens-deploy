"use client";

import MarkdownNotes from "./MarkdownNotes";
import { enrichNoteMath } from "../lib/notesRichText";

interface RichNoteTextProps {
  text: string;
  className?: string;
}

export default function RichNoteText({ text, className }: RichNoteTextProps) {
  return <MarkdownNotes content={enrichNoteMath(text)} className={className ?? "markdown-notes--compact"} />;
}
