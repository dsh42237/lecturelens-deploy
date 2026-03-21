"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import MermaidBlock from "./MermaidBlock";

interface MarkdownNotesProps {
  content: string;
  className?: string;
}

export default function MarkdownNotes({ content, className }: MarkdownNotesProps) {
  return (
    <div className={className ? `markdown-notes ${className}` : "markdown-notes"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre(props) {
            const child = props.children;
            if (
              child &&
              typeof child === "object" &&
              "props" in child &&
              typeof child.props === "object" &&
              child.props &&
              child.props.className === "language-mermaid"
            ) {
              return <>{props.children}</>;
            }
            return <pre>{props.children}</pre>;
          },
          code(props) {
            const { className, children, ...rest } = props;
            const value = String(children).replace(/\n$/, "");
            if (className === "language-mermaid") {
              return <MermaidBlock code={value} />;
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
