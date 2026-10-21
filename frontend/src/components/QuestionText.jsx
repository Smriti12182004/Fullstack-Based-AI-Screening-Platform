/**
 * Evalyn shared assessment-question renderer.
 *
 * Presents coding problems in a clean LeetCode-inspired format:
 * - readable problem statement paragraphs
 * - bold Example 1 / Example 2 headings
 * - one light-grey sample block with Input / Output / Explanation
 * - a separate constraints list
 * - preserved, language-labelled code snippets
 *
 * Also repairs legacy records where headings and example fields were saved as
 * one continuous line. Display formatting does not alter the stored DB value.
 */

function mapOutsideFencedCode(text, transform) {
  return String(text)
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => (index % 2 === 1 ? part : transform(part)))
    .join("");
}

function normalizeQuestionText(value) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return "";

  if (!text.includes("\n") && /\\n|\\t/.test(text)) {
    text = text.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  }

  // Ensure a fenced code marker starts on a separate line.
  text = text.replace(/```([A-Za-z0-9_+#.-]*)/g, "\n```$1\n");

  return mapOutsideFencedCode(text, (source) => {
    // Convert Markdown headings embedded in one long sentence into actual
    // structural lines. Example: "... maximum sum. ### Example 1: Input: ..."
    source = source.replace(
      /(^|\s)#{1,6}\s*(Problem Statement|Problem|Your Task|Function Signature|Example\s+\d+|Examples|Constraints|Code Snippet|Given Code|Note)\s*:?\s*/gim,
      (_match, boundary, label) =>
        `${boundary.trimEnd()}\n\n### ${label.replace(/\s+/g, " ").trim()}\n`
    );

    // Also support legacy headings without Markdown hashes, but require a colon
    // so ordinary prose containing the word "problem" is not split.
    source = source.replace(
      /(^|\s)(Example\s+\d+|Constraints|Problem Statement|Function Signature|Code Snippet|Given Code|Note)\s*:\s*/gim,
      (_match, boundary, label) =>
        `${boundary.trimEnd()}\n\n### ${label.replace(/\s+/g, " ").trim()}\n`
    );

    // Split flattened sample labels into their own rows.
    source = source.replace(
      /(^|[\t ]+)(Input|Output|Explanation)\s*:\s*/gim,
      (_match, _boundary, label) => `\n${label}: `
    );

    // Preserve the list marker and the negative sign for constraints such as
    // "- -1000 <= Node.val <= 1000".
    source = source.replace(
      /\s+-\s+(-\s*\d+\s*(?:<=|>=|==|<|>|!=))/g,
      "\n- $1"
    );
    source = source.replace(/([.!?\]])\s+-\s+(?=[A-Z])/g, "$1\n- ");

    return source
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }).trim();
}

function normalizeHeadingLabel(value) {
  return String(value || "")
    .replace(/^\s*#+\s*/, "")
    .replace(/\s*#+\s*$/, "")
    .replace(/:$/, "")
    .trim();
}

function parseQuestionBlocks(value) {
  const text = normalizeQuestionText(value);
  if (!text) return [];

  const lines = text.split("\n");
  const blocks = [];
  let index = 0;
  let activeExample = null;
  let currentSection = "";

  const fieldPattern = /^(Input|Output|Explanation|Note)\s*:\s*(.*)$/i;
  const headingPattern =
    /^(Problem Statement|Problem|Your Task|Function Signature|Examples|Example\s+\d+|Constraints|Code Snippet|Given Code|Note)\s*:?$/i;

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    // Keep source-code indentation and line breaks intact.
    const fenceMatch = trimmed.match(/^```([A-Za-z0-9_+#.-]*)\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] || "text";
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^\s*```+\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;

      while (codeLines.length && !codeLines[0].trim()) codeLines.shift();
      while (codeLines.length && !codeLines[codeLines.length - 1].trim()) {
        codeLines.pop();
      }

      blocks.push({ type: "code", language, value: codeLines.join("\n") });
      activeExample = null;
      continue;
    }

    const markdownHeading = trimmed.match(/^#{1,6}\s+(.+)$/);
    const plainHeading = trimmed.match(headingPattern);
    const rawHeading = markdownHeading?.[1] || plainHeading?.[1];

    if (rawHeading) {
      const title = normalizeHeadingLabel(rawHeading);
      currentSection = title;

      if (/^example\s+\d+$/i.test(title)) {
        activeExample = {
          type: "example",
          title,
          input: "",
          output: "",
          explanation: "",
          notes: [],
        };
        blocks.push(activeExample);
      } else {
        activeExample = null;
        blocks.push({
          type: "heading",
          level: markdownHeading ? trimmed.match(/^#+/)[0].length : 2,
          value: title,
        });
      }

      index += 1;
      continue;
    }

    const fieldMatch = trimmed.match(fieldPattern);
    if (fieldMatch) {
      const label = fieldMatch[1].toLowerCase();
      const fieldValue = fieldMatch[2].trim();

      if (activeExample && ["input", "output", "explanation"].includes(label)) {
        activeExample[label] = fieldValue;
      } else {
        blocks.push({ type: "field", label, value: fieldValue });
      }

      index += 1;
      continue;
    }

    const listMatch = trimmed.match(/^([-*+]\s+|\d+[.)]\s+)(.+)$/);
    const isConstraintExpression =
      /^constraints$/i.test(currentSection) &&
      /^-?\d+\s*(?:<=|>=|==|<|>|!=)/.test(trimmed);

    if (listMatch || isConstraintExpression) {
      const ordered = listMatch ? /^\d/.test(listMatch[1]) : false;
      const items = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const match = current.match(/^([-*+]\s+|\d+[.)]\s+)(.+)$/);
        const constraintExpression =
          /^constraints$/i.test(currentSection) &&
          /^-?\d+\s*(?:<=|>=|==|<|>|!=)/.test(current);

        if (match && /^\d/.test(match[1]) === ordered) {
          items.push(match[2].trim());
          index += 1;
          continue;
        }

        if (!ordered && constraintExpression) {
          items.push(current);
          index += 1;
          continue;
        }

        break;
      }

      if (items.length) {
        blocks.push({
          type: ordered ? "ordered-list" : "unordered-list",
          items,
        });
        continue;
      }
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim()) {
      const current = lines[index].trim();
      if (
        /^```/.test(current) ||
        /^#{1,6}\s+/.test(current) ||
        headingPattern.test(current) ||
        fieldPattern.test(current) ||
        /^([-*+]\s+|\d+[.)]\s+)/.test(current)
      ) {
        break;
      }

      paragraphLines.push(current);
      index += 1;
    }

    if (paragraphLines.length) {
      const paragraph = paragraphLines.join(" ");
      if (activeExample) activeExample.notes.push(paragraph);
      else blocks.push({ type: "paragraph", value: paragraph });
    } else {
      index += 1;
    }
  }

  return blocks;
}

function renderInlineMarkdown(value, keyPrefix) {
  const tokenPattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

  return String(value)
    .split(tokenPattern)
    .filter((part) => part !== "")
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;

      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={key}
            className="rounded bg-[#F0F2F6] px-1.5 py-0.5 font-mono text-[0.92em] text-[#30394A]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      if (
        (part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))
      ) {
        return (
          <strong key={key} className="font-semibold text-[#202938]">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (
        (part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))
      ) {
        return (
          <em key={key} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      return part;
    });
}

function ExampleBlock({ block, blockKey }) {
  const hasContent =
    Boolean(block.input) ||
    Boolean(block.output) ||
    Boolean(block.explanation) ||
    block.notes.length > 0;

  return (
    <section key={blockKey} className="my-4 min-w-0">
      <h4 className="mb-2 text-sm font-semibold text-[#273142]">
        {block.title}:
      </h4>

      <div className="space-y-1.5 overflow-x-auto rounded-md bg-[#F7F8FA] px-4 py-3.5 text-[13px] leading-6 text-[#303846]">
        {block.input && (
          <p className="whitespace-pre-wrap break-words font-mono">
            <strong className="font-bold">Input: </strong>
            {renderInlineMarkdown(block.input, `${blockKey}-input`)}
          </p>
        )}

        {block.output && (
          <p className="whitespace-pre-wrap break-words font-mono">
            <strong className="font-bold">Output: </strong>
            {renderInlineMarkdown(block.output, `${blockKey}-output`)}
          </p>
        )}

        {block.explanation && (
          <p className="whitespace-pre-wrap break-words font-mono">
            <strong className="font-bold">Explanation: </strong>
            {renderInlineMarkdown(
              block.explanation,
              `${blockKey}-explanation`
            )}
          </p>
        )}

        {block.notes.map((note, noteIndex) => (
          <p
            key={`${blockKey}-note-${noteIndex}`}
            className="whitespace-pre-wrap break-words"
          >
            {renderInlineMarkdown(note, `${blockKey}-note-${noteIndex}`)}
          </p>
        ))}

        {!hasContent && (
          <p className="text-[#7B8494]">Example details were not provided.</p>
        )}
      </div>
    </section>
  );
}

export default function QuestionText({ text, className = "" }) {
  const blocks = parseQuestionBlocks(text);
  if (!blocks.length) return null;

  return (
    <div className={`min-w-0 break-words ${className}`}>
      {blocks.map((block, index) => {
        const key = `question-text-${index}`;

        if (block.type === "code") {
          return (
            <section
              key={key}
              className="my-4 min-w-0 max-w-full overflow-hidden rounded-md border border-[#E3E6EC] bg-[#F7F8FA]"
            >
              <header className="flex items-center justify-between gap-3 border-b border-[#E3E6EC] px-4 py-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#697386]">
                  {block.language || "Code"}
                </span>
                <span className="text-[10px] text-[#8992A2]">Code snippet</span>
              </header>
              <pre className="max-w-full overflow-x-auto p-4 font-mono text-[12px] leading-6 text-[#263243] sm:text-[13px]">
                <code>{block.value}</code>
              </pre>
            </section>
          );
        }

        if (block.type === "example") {
          return <ExampleBlock key={key} block={block} blockKey={key} />;
        }

        if (block.type === "field") {
          return (
            <p key={key} className="my-2 text-sm leading-6 text-[#344054]">
              <strong className="font-semibold capitalize">{block.label}: </strong>
              {renderInlineMarkdown(block.value, key)}
            </p>
          );
        }

        if (block.type === "heading") {
          const isPrimaryHeading = /^(problem statement|problem|your task)$/i.test(
            block.value
          );
          const isNote = /^note$/i.test(block.value);

          return (
            <h3
              key={key}
              className={
                isPrimaryHeading
                  ? "mb-2 mt-1 text-base font-bold leading-7 text-[#202938] first:mt-0"
                  : isNote
                    ? "mb-1 mt-4 text-sm font-bold text-[#344054]"
                    : "mb-2 mt-5 text-sm font-bold text-[#344054] first:mt-0"
              }
            >
              {block.value}
            </h3>
          );
        }

        if (
          block.type === "unordered-list" ||
          block.type === "ordered-list"
        ) {
          const ListTag = block.type === "ordered-list" ? "ol" : "ul";
          return (
            <ListTag
              key={key}
              className={`my-2 space-y-1.5 pl-6 text-sm leading-6 text-[#4B5565] ${
                block.type === "ordered-list" ? "list-decimal" : "list-disc"
              }`}
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={`${key}-${itemIndex}`}
                  className="pl-1 marker:text-[#858D9B]"
                >
                  {renderInlineMarkdown(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p
            key={key}
            className="my-2 whitespace-pre-wrap break-words text-sm leading-7 text-inherit first:mt-0 last:mb-0"
          >
            {renderInlineMarkdown(block.value, key)}
          </p>
        );
      })}
    </div>
  );
}