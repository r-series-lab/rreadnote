import {
  layoutWithLines,
  prepareWithSegments,
  setLocale,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

import { createHeadingId } from "./markdown";

setLocale("zh-CN");

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UNORDERED_LIST_RE = /^([-*+])\s+(.*)$/;
const ORDERED_LIST_RE = /^(\d+)[.)]\s+(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const CODE_FENCE_RE = /^```/;
const RULE_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ILLUSTRATION_RE = /^!\[(.*?)\]\((illustration:[^)]+)\)\s*$/;

const BODY_FONT = '400 19px "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif';
const MONO_FONT =
  '500 15px "SF Mono", "JetBrains Mono", "Fira Code", Menlo, Monaco, monospace';

export const PRETEXT_PAGE_PADDING_X = 42;
export const PRETEXT_PAGE_PADDING_Y = 24;

type BlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "code"
  | "rule"
  | "illustration";

type BlockMetrics = {
  font: string;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
  continuationTop: number;
  continuationBottom: number;
  inset: number;
};

type BaseBlock = {
  id: string;
  kind: BlockKind;
  line: number;
  metrics: BlockMetrics;
};

type TextBlock = BaseBlock & {
  kind: "heading" | "paragraph" | "list" | "quote" | "code";
  text: string;
  prepared: PreparedTextWithSegments;
  level?: number;
  markerText?: string;
  headingSlug?: string;
  headingTitle?: string;
};

type RuleBlock = BaseBlock & {
  kind: "rule";
  height: number;
};

type IllustrationBlock = BaseBlock & {
  kind: "illustration";
  height: number;
  caption: string;
  variant: string;
};

export type PreparedPaginationBlock = TextBlock | RuleBlock | IllustrationBlock;

export type PreparedPaginationDocument = {
  blocks: PreparedPaginationBlock[];
};

export type PaginatedPageItem = {
  id: string;
  kind: BlockKind;
  textLines: string[];
  lineHeight: number;
  line: number;
  marginTop: number;
  marginBottom: number;
  level?: number;
  markerText?: string;
  headingSlug?: string;
  headingTitle?: string;
  continuation: boolean;
  illustrationCaption?: string;
  illustrationVariant?: string;
  height?: number;
};

export type PaginatedPage = {
  index: number;
  items: PaginatedPageItem[];
  headingSlug?: string;
  headingTitle?: string;
  line?: number;
  headingSlugs: string[];
};

export type PaginatedLayout = {
  pageCount: number;
  pages: PaginatedPage[];
};

const DEFAULT_BODY_METRICS: BlockMetrics = {
  font: BODY_FONT,
  lineHeight: 34,
  marginTop: 0,
  marginBottom: 16,
  continuationTop: 4,
  continuationBottom: 10,
  inset: 0,
};

const LIST_METRICS: BlockMetrics = {
  font: BODY_FONT,
  lineHeight: 34,
  marginTop: 0,
  marginBottom: 12,
  continuationTop: 4,
  continuationBottom: 8,
  inset: 28,
};

const QUOTE_METRICS: BlockMetrics = {
  font: BODY_FONT,
  lineHeight: 34,
  marginTop: 0,
  marginBottom: 14,
  continuationTop: 4,
  continuationBottom: 8,
  inset: 18,
};

const CODE_METRICS: BlockMetrics = {
  font: MONO_FONT,
  lineHeight: 26,
  marginTop: 0,
  marginBottom: 16,
  continuationTop: 4,
  continuationBottom: 8,
  inset: 18,
};

function headingMetrics(level: number): BlockMetrics {
  const fontSize = Math.max(20, 34 - (level - 1) * 3);
  const lineHeight = Math.max(32, 44 - (level - 1) * 3);
  return {
    font: `700 ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`,
    lineHeight,
    marginTop: level === 1 ? 2 : 6,
    marginBottom: 14,
    continuationTop: 4,
    continuationBottom: 10,
    inset: 0,
  };
}

function joinFlowLines(lines: string[]) {
  let text = "";

  for (const line of lines.map((value) => value.trim()).filter(Boolean)) {
    if (!text) {
      text = line;
      continue;
    }

    const previous = text[text.length - 1] ?? "";
    const next = line[0] ?? "";
    const shouldSpace =
      /[A-Za-z0-9]/.test(previous) && /[A-Za-z0-9]/.test(next);

    text += shouldSpace ? ` ${line}` : line;
  }

  return text;
}

function isSpecialBlockStart(trimmedLine: string) {
  return (
    HEADING_RE.test(trimmedLine) ||
    RULE_RE.test(trimmedLine) ||
      CODE_FENCE_RE.test(trimmedLine) ||
    ILLUSTRATION_RE.test(trimmedLine) ||
    BLOCKQUOTE_RE.test(trimmedLine) ||
    UNORDERED_LIST_RE.test(trimmedLine) ||
    ORDERED_LIST_RE.test(trimmedLine)
  );
}

function createTextBlock(input: {
  id: string;
  kind: TextBlock["kind"];
  text: string;
  line: number;
  metrics: BlockMetrics;
  level?: number;
  markerText?: string;
  headingSlug?: string;
  headingTitle?: string;
  whiteSpace?: "normal" | "pre-wrap";
  wordBreak?: "normal" | "keep-all";
}): TextBlock {
  return {
    id: input.id,
    kind: input.kind,
    text: input.text,
    line: input.line,
    metrics: input.metrics,
    level: input.level,
    markerText: input.markerText,
    headingSlug: input.headingSlug,
    headingTitle: input.headingTitle,
    prepared: prepareWithSegments(input.text, input.metrics.font, {
      whiteSpace: input.whiteSpace ?? "normal",
      wordBreak: input.wordBreak ?? "keep-all",
    }),
  };
}

export function preparePaginatedDocument(markdown: string): PreparedPaginationDocument {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: PreparedPaginationBlock[] = [];
  const slugCounts = new Map<string, number>();
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const trimmed = rawLine.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      const slug = createHeadingId(title, slugCounts);
      blocks.push(
        createTextBlock({
          id: `heading-${blocks.length}`,
          kind: "heading",
          text: title,
          line: index + 1,
          level,
          headingSlug: slug,
          headingTitle: title,
          metrics: headingMetrics(level),
        }),
      );
      index += 1;
      continue;
    }

    if (RULE_RE.test(trimmed)) {
      blocks.push({
        id: `rule-${blocks.length}`,
        kind: "rule",
        line: index + 1,
        height: 18,
        metrics: {
          ...DEFAULT_BODY_METRICS,
          lineHeight: 18,
          marginBottom: 10,
          continuationBottom: 10,
        },
      });
      index += 1;
      continue;
    }

    const illustrationMatch = trimmed.match(ILLUSTRATION_RE);
    if (illustrationMatch) {
      const caption = illustrationMatch[1].trim() || "插图";
      const variant = illustrationMatch[2].replace(/^illustration:/, "").trim() || "editorial";
      blocks.push({
        id: `illustration-${blocks.length}`,
        kind: "illustration",
        line: index + 1,
        caption,
        variant,
        height: 228,
        metrics: {
          ...DEFAULT_BODY_METRICS,
          lineHeight: 228,
          marginTop: 6,
          marginBottom: 20,
          continuationBottom: 20,
        },
      });
      index += 1;
      continue;
    }

    if (CODE_FENCE_RE.test(trimmed)) {
      const startLine = index + 1;
      index += 1;
      const contentLines: string[] = [];
      while (index < lines.length && !CODE_FENCE_RE.test(lines[index].trim())) {
        contentLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(
        createTextBlock({
          id: `code-${blocks.length}`,
          kind: "code",
          text: contentLines.join("\n"),
          line: startLine,
          metrics: CODE_METRICS,
          whiteSpace: "pre-wrap",
          wordBreak: "normal",
        }),
      );
      continue;
    }

    if (BLOCKQUOTE_RE.test(trimmed)) {
      const startLine = index + 1;
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const current = (lines[index] ?? "").trim();
        const match = current.match(BLOCKQUOTE_RE);
        if (!match) {
          break;
        }
        quoteLines.push(match[1]);
        index += 1;
      }
      blocks.push(
        createTextBlock({
          id: `quote-${blocks.length}`,
          kind: "quote",
          text: joinFlowLines(quoteLines),
          line: startLine,
          metrics: QUOTE_METRICS,
        }),
      );
      continue;
    }

    const unorderedMatch = trimmed.match(UNORDERED_LIST_RE);
    const orderedMatch = trimmed.match(ORDERED_LIST_RE);
    if (unorderedMatch || orderedMatch) {
      while (index < lines.length) {
        const currentTrimmed = (lines[index] ?? "").trim();
        const currentUnordered = currentTrimmed.match(UNORDERED_LIST_RE);
        const currentOrdered = currentTrimmed.match(ORDERED_LIST_RE);
        if (!currentUnordered && !currentOrdered) {
          break;
        }

        const startLine = index + 1;
        const markerText = currentOrdered
          ? `${currentOrdered[1]}.`
          : currentUnordered?.[1] ?? "•";
        const contentLines = [
          currentOrdered?.[2] ?? currentUnordered?.[2] ?? "",
        ];
        index += 1;

        while (index < lines.length) {
          const nextRaw = lines[index] ?? "";
          const nextTrimmed = nextRaw.trim();
          if (!nextTrimmed || isSpecialBlockStart(nextTrimmed)) {
            break;
          }
          contentLines.push(nextTrimmed);
          index += 1;
        }

        blocks.push(
          createTextBlock({
            id: `list-${blocks.length}`,
            kind: "list",
            text: joinFlowLines(contentLines),
            line: startLine,
            markerText,
            metrics: LIST_METRICS,
          }),
        );
      }
      continue;
    }

    const startLine = index + 1;
    const paragraphLines = [rawLine];
    index += 1;
    while (index < lines.length) {
      const nextTrimmed = (lines[index] ?? "").trim();
      if (!nextTrimmed || isSpecialBlockStart(nextTrimmed)) {
        break;
      }
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }

    blocks.push(
      createTextBlock({
        id: `paragraph-${blocks.length}`,
        kind: "paragraph",
        text: joinFlowLines(paragraphLines),
        line: startLine,
        metrics: DEFAULT_BODY_METRICS,
      }),
    );
  }

  return { blocks };
}

function createPage(index: number): PaginatedPage {
  return {
    index,
    items: [],
    headingSlugs: [],
  };
}

function resolvePagePercent(pageIndex: number, pageCount: number) {
  if (pageCount <= 1) {
    return 100;
  }

  return Number(((pageIndex / (pageCount - 1)) * 100).toFixed(2));
}

export function resolvePageIndex(
  pages: PaginatedPage[],
  progress?: {
    headingSlug?: string | null;
    percent?: number | null;
  } | null,
) {
  if (pages.length === 0) {
    return 0;
  }

  const percent = progress?.percent ?? null;
  if (percent != null && Number.isNaN(percent) === false) {
    const bounded = Math.max(0, Math.min(100, percent));
    return Math.round((bounded / 100) * (pages.length - 1));
  }

  const headingSlug = progress?.headingSlug ?? null;
  if (headingSlug) {
    const matchIndex = pages.findIndex((page) =>
      page.headingSlugs.includes(headingSlug),
    );
    if (matchIndex >= 0) {
      return matchIndex;
    }
  }
  return 0;
}

export function resolveReadingProgress(
  pages: PaginatedPage[],
  pageIndex: number,
  fallbackTitle: string,
) {
  if (pages.length === 0) {
    return {
      percent: 0,
      headingSlug: null,
      headingTitle: fallbackTitle,
      line: null,
      anchorId: null,
    };
  }

  const safePageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
  const page = pages[safePageIndex];
  return {
    percent: resolvePagePercent(safePageIndex, pages.length),
    headingSlug: page.headingSlug ?? null,
    headingTitle: page.headingTitle ?? fallbackTitle,
    line: page.line ?? null,
    anchorId: page.headingSlug ?? null,
  };
}

export function layoutPaginatedDocument(
  preparedDocument: PreparedPaginationDocument,
  width: number,
  height: number,
): PaginatedLayout {
  const contentWidth = Math.max(140, Math.floor(width));
  const pageHeight = Math.max(180, Math.floor(height));
  const pages: PaginatedPage[] = [];
  let page = createPage(0);
  let pageCursor = 0;
  let currentHeadingSlug: string | undefined;
  let currentHeadingTitle: string | undefined;
  let currentHeadingLine: number | undefined;

  const pushPage = () => {
    pages.push(page);
    page = createPage(pages.length);
    pageCursor = 0;
    page.headingSlug = currentHeadingSlug;
    page.headingTitle = currentHeadingTitle;
    page.line = currentHeadingLine;
    if (currentHeadingSlug) {
      page.headingSlugs.push(currentHeadingSlug);
    }
  };

  const addItem = (item: PaginatedPageItem, consumedHeight: number) => {
    page.items.push(item);
    pageCursor += consumedHeight;
    if (page.line == null) {
      page.line = item.line;
    }
    if (item.headingSlug && !page.headingSlugs.includes(item.headingSlug)) {
      page.headingSlugs.push(item.headingSlug);
    }
    if (page.headingSlug == null) {
      page.headingSlug = currentHeadingSlug;
      page.headingTitle = currentHeadingTitle;
    }
  };

  for (const block of preparedDocument.blocks) {
    if (block.kind === "rule") {
      const topGap = page.items.length === 0 ? 0 : block.metrics.marginTop;
      const totalHeight = topGap + block.height + block.metrics.marginBottom;
      if (page.items.length > 0 && pageCursor + totalHeight > pageHeight) {
        pushPage();
      }

      addItem(
        {
          id: block.id,
          kind: block.kind,
          textLines: [],
          lineHeight: block.metrics.lineHeight,
          line: block.line,
          marginTop: topGap,
          marginBottom: block.metrics.marginBottom,
          continuation: false,
        },
        topGap + block.height + block.metrics.marginBottom,
      );
      continue;
    }

    if (block.kind === "illustration") {
      const topGap = page.items.length === 0 ? 0 : block.metrics.marginTop;
      const totalHeight = topGap + block.height + block.metrics.marginBottom;
      if (page.items.length > 0 && pageCursor + totalHeight > pageHeight) {
        pushPage();
      }

      addItem(
        {
          id: block.id,
          kind: block.kind,
          textLines: [],
          lineHeight: block.metrics.lineHeight,
          line: block.line,
          marginTop: topGap,
          marginBottom: block.metrics.marginBottom,
          continuation: false,
          illustrationCaption: block.caption,
          illustrationVariant: block.variant,
          height: block.height,
        },
        topGap + block.height + block.metrics.marginBottom,
      );
      continue;
    }

    const layoutWidth = Math.max(84, contentWidth - block.metrics.inset);
    const lines = layoutWithLines(
      block.prepared,
      layoutWidth,
      block.metrics.lineHeight,
    ).lines.map((line) => line.text);

    if (block.headingSlug) {
      currentHeadingSlug = block.headingSlug;
      currentHeadingTitle = block.headingTitle;
      currentHeadingLine = block.line;
      if (page.items.length === 0) {
        page.headingSlug = block.headingSlug;
        page.headingTitle = block.headingTitle;
        page.line = block.line;
      }
    }

    let offset = 0;
    let continuation = false;
    while (offset < lines.length) {
      const topGap =
        page.items.length === 0
          ? 0
          : continuation
            ? block.metrics.continuationTop
            : block.metrics.marginTop;

      let chunkSize = lines.length - offset;
      let fitted = false;

      while (chunkSize > 0) {
        const isLastChunk = offset + chunkSize >= lines.length;
        const bottomGap = isLastChunk
          ? block.metrics.marginBottom
          : block.metrics.continuationBottom;
        const totalHeight =
          topGap + chunkSize * block.metrics.lineHeight + bottomGap;

        if (pageCursor + totalHeight <= pageHeight || page.items.length === 0) {
          addItem(
            {
              id: `${block.id}-${offset}`,
              kind: block.kind,
              textLines: lines.slice(offset, offset + chunkSize),
              lineHeight: block.metrics.lineHeight,
              line: block.line,
              marginTop: topGap,
              marginBottom: bottomGap,
              level: block.level,
              markerText: continuation ? undefined : block.markerText,
              headingSlug: block.headingSlug,
              headingTitle: block.headingTitle,
              continuation,
            },
            totalHeight,
          );
          offset += chunkSize;
          continuation = offset < lines.length;
          fitted = true;
          break;
        }

        chunkSize -= 1;
      }

      if (!fitted) {
        pushPage();
        continue;
      }

      if (offset < lines.length) {
        pushPage();
      }
    }
  }

  if (page.items.length > 0 || pages.length === 0) {
    pages.push(page);
  }

  return {
    pageCount: pages.length,
    pages,
  };
}
