import {
  cloneElement,
  createElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type ComponentPropsWithoutRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArticleRounded,
  CheckRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  ContentCopyRounded,
  EditRounded,
  FullscreenExitRounded,
  FullscreenRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
  MenuBookRounded,
  SearchRounded,
  SwapVertRounded,
  ViewColumnRounded,
} from "@mui/icons-material";
import { Button, Card, CardContent } from "@mui/material";
import mermaid from "mermaid";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import { InlineIllustration } from "./InlineIllustration";
import { PaginatedReader } from "./PaginatedReader";
import {
  createHeadingId,
  flattenText,
  formatPercent,
} from "../lib/markdown";
import {
  createDocumentLinkIndex,
  preprocessObsidianMarkdown,
  resolveMarkdownLink,
  type MarkdownLinkResolution,
} from "../lib/obsidian-markdown";
import type {
  ContentView,
  DocumentSummary,
  ProjectDetail,
  ProjectSummary,
  ReadingProgress,
  SearchHit,
} from "../lib/rreadnote";

type WorkspacePaneProps = {
  project: ProjectDetail | null;
  activeView: ContentView | null;
  documentDraft: string;
  documentDirty: boolean;
  currentProgress: ReadingProgress | null;
  contentSearchQuery: string;
  contentSearchHits: SearchHit[];
  activeSearchHit: SearchHit | null;
  requestedHeadingSlug: string | null;
  busy: boolean;
  workspaceProjects: ProjectSummary[];
  projectDocumentsByPath: Record<string, DocumentSummary[]>;
  onDraftChange: (value: string) => void;
  onProgressChange: (progress: ReadingProgress | null) => void;
  onRequestedHeadingConsumed: () => void;
  onEnsureProjectDocuments: (projectPath: string) => Promise<DocumentSummary[] | null> | void;
  onSelectDocument: (documentId: string, headingSlug?: string | null) => void;
  onSelectProjectDocument: (
    projectPath: string,
    documentId: string,
    headingSlug?: string | null,
  ) => void;
  onSaveDocument: () => void;
  onViewChange: (view: ContentView) => void;
  readerFocusMode: boolean;
  readerFlowMode: "paged" | "scroll";
  onToggleReaderFocus: () => void;
  onReaderFlowModeChange: (mode: "paged" | "scroll") => void;
};

type HeadingRendererProps = {
  children?: React.ReactNode;
};

type ImageRendererProps = {
  alt?: string;
  src?: string;
};

type MarkdownAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown;
};

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  node?: unknown;
};

type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & {
  node?: unknown;
};

type MarkdownBlockquoteProps = ComponentPropsWithoutRef<"blockquote"> & {
  node?: unknown;
};

type MermaidBlockProps = {
  code: string;
};

const CALLOUT_MARKER_RE = /^\s*\[!([a-z0-9_-]+)\][+-]?\s*/iu;

function escapeHeadingId(value: string) {
  if (typeof window !== "undefined" && window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9\u3400-\u9FFF_-]/g, "\\$&");
}

function viewLabel(view: ContentView) {
  switch (view) {
    case "reader":
      return "阅读";
    case "editor":
      return "编辑";
    default:
      return "分栏";
  }
}

function viewIcon(view: ContentView) {
  switch (view) {
    case "reader":
      return <MenuBookRounded fontSize="small" />;
    case "editor":
      return <EditRounded fontSize="small" />;
    default:
      return <ViewColumnRounded fontSize="small" />;
  }
}

function inferCodeLanguage(children: ReactNode) {
  if (!isValidElement<{ className?: string }>(children)) {
    return null;
  }

  const match = children.props.className?.match(/language-([a-z0-9_-]+)/iu);
  return match?.[1] ?? null;
}

function classifyLinkClassName(resolution: MarkdownLinkResolution) {
  switch (resolution.kind) {
    case "document":
      return "reader-link reader-link-note";
    case "heading":
      return "reader-link reader-link-heading";
    case "external":
      return "reader-link reader-link-external";
    default:
      return "reader-link reader-link-unresolved";
  }
}

function calloutLabel(type: string) {
  const labels: Record<string, string> = {
    abstract: "摘要",
    bug: "问题",
    caution: "注意",
    check: "完成",
    danger: "危险",
    error: "错误",
    example: "示例",
    failure: "失败",
    faq: "问答",
    help: "帮助",
    hint: "提示",
    important: "重要",
    info: "信息",
    note: "笔记",
    question: "问题",
    quote: "引用",
    success: "成功",
    summary: "摘要",
    tip: "提示",
    todo: "待办",
    warning: "警告",
  };

  return labels[type] ?? type;
}

function calloutTypeFromChildren(children: ReactNode) {
  const text = flattenText(children).trim();
  const match = text.match(CALLOUT_MARKER_RE);
  return match?.[1]?.toLocaleLowerCase("en-US") ?? null;
}

function stripCalloutMarkerFromChildren(children: ReactNode) {
  let stripped = false;

  const stripNode = (node: ReactNode): ReactNode => {
    if (stripped || node == null || typeof node === "boolean") {
      return node;
    }

    if (typeof node === "string" || typeof node === "number") {
      const value = String(node);
      const nextValue = value.replace(CALLOUT_MARKER_RE, "");
      if (nextValue !== value) {
        stripped = true;
      }
      return nextValue;
    }

    if (Array.isArray(node)) {
      return node.map(stripNode);
    }

    if (isValidElement<{ children?: ReactNode }>(node)) {
      const previousChildren = node.props.children;
      const nextChildren = stripNode(previousChildren);
      if (nextChildren !== previousChildren) {
        return cloneElement(node, undefined, nextChildren);
      }
    }

    return node;
  };

  return stripNode(children);
}

function resolveMermaidThemeMode() {
  if (typeof document === "undefined") {
    return "dark";
  }

  return document.querySelector(".app-shell")?.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function configureMermaid() {
  const themeMode = resolveMermaidThemeMode();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables:
      themeMode === "light"
        ? {
            background: "transparent",
            primaryColor: "#fff7ed",
            primaryTextColor: "#2b2f36",
            primaryBorderColor: "#d7c9b8",
            lineColor: "#9f8c78",
            secondaryColor: "#f4eadf",
            tertiaryColor: "#f9f4ee",
            fontFamily: "PingFang SC, Hiragino Sans GB, sans-serif",
          }
        : {
            background: "transparent",
            primaryColor: "#252a31",
            primaryTextColor: "#eef2f7",
            primaryBorderColor: "#4b525d",
            lineColor: "#a9b0ba",
            secondaryColor: "#1b1f25",
            tertiaryColor: "#111419",
            fontFamily: "PingFang SC, Hiragino Sans GB, sans-serif",
          },
  });
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function MermaidBlock({ code }: MermaidBlockProps) {
  const rawId = useId();
  const renderId = useMemo(
    () => `rreadnote-mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawId],
  );
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const source = code.trim();

    if (!source) {
      setSvg("");
      setError("Mermaid 图表内容为空");
      return;
    }

    setSvg("");
    setError(null);
    configureMermaid();

    mermaid
      .render(renderId, source)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setSvg(result.svg);
      })
      .catch((renderError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(renderError instanceof Error ? renderError.message : String(renderError));
      });

    return () => {
      cancelled = true;
    };
  }, [code, renderId]);

  return (
    <div className="reader-mermaid-frame">
      <div className="reader-mermaid-header">
        <span className="reader-mermaid-kicker">diagram</span>
        <span className="reader-mermaid-language">Mermaid</span>
      </div>
      {error ? (
        <div className="reader-mermaid-error">
          <strong>图表渲染失败</strong>
          <span>{error}</span>
        </div>
      ) : svg ? (
        <div
          className="reader-mermaid-canvas"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="reader-mermaid-loading">正在渲染图表…</div>
      )}
    </div>
  );
}

function markdownUrlTransform(value: string) {
  if (value.startsWith("rreadnote://note/") || value.startsWith("illustration:")) {
    return value;
  }

  return defaultUrlTransform(value);
}

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("zh-Hans-CN");
}

function stripPreviewEllipsis(value: string) {
  return value.replace(/…$/u, "").trim();
}

function unwrapSearchMark(mark: HTMLElement) {
  const parent = mark.parentNode;
  if (!parent) {
    return;
  }

  parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
}

function clearSearchMarks(root: HTMLElement | null) {
  if (!root) {
    return;
  }

  const marks = Array.from(root.querySelectorAll<HTMLElement>("mark.reader-search-mark"));
  for (const mark of marks) {
    unwrapSearchMark(mark);
  }
  root.normalize();
}

function highlightSearchMarks(root: HTMLElement, query: string) {
  clearSearchMarks(root);

  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [] as HTMLElement[];
  }

  const loweredQuery = normalizedQuery.toLocaleLowerCase("zh-Hans-CN");
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parentElement = node.parentElement;
      if (!parentElement || !node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parentElement.closest("mark.reader-search-mark")) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  const marks: HTMLElement[] = [];

  for (const textNode of textNodes) {
    const value = textNode.textContent ?? "";
    const loweredValue = value.toLocaleLowerCase("zh-Hans-CN");
    if (!loweredValue.includes(loweredQuery)) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    let searchStart = 0;

    while (searchStart < value.length) {
      const nextIndex = loweredValue.indexOf(loweredQuery, searchStart);
      if (nextIndex < 0) {
        fragment.append(document.createTextNode(value.slice(searchStart)));
        break;
      }

      if (nextIndex > searchStart) {
        fragment.append(document.createTextNode(value.slice(searchStart, nextIndex)));
      }

      const mark = document.createElement("mark");
      mark.className = "reader-search-mark";
      mark.textContent = value.slice(nextIndex, nextIndex + normalizedQuery.length);
      fragment.append(mark);
      marks.push(mark);

      searchStart = nextIndex + normalizedQuery.length;
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return marks;
}

function findSearchMarkIndex(
  marks: HTMLElement[],
  hit: SearchHit | null,
) {
  if (!hit) {
    return -1;
  }

  const previewNeedle = normalizeSearchText(stripPreviewEllipsis(hit.preview));
  if (!previewNeedle) {
    return -1;
  }

  const blockSelector = "p, li, blockquote, td, th, pre, h1, h2, h3, h4, h5, h6";
  return marks.findIndex((mark) => {
    const block = mark.closest<HTMLElement>(blockSelector);
    if (!block) {
      return false;
    }

    return normalizeSearchText(block.textContent ?? "").includes(previewNeedle);
  });
}

function cycleIndex(current: number, length: number, delta: number) {
  if (length <= 0) {
    return 0;
  }

  return (current + delta + length) % length;
}

function sameSearchHit(left: SearchHit | null | undefined, right: SearchHit | null | undefined) {
  if (!left || !right) {
    return false;
  }

  return (
    left.projectPath === right.projectPath &&
    left.documentId === right.documentId &&
    left.line === right.line &&
    left.preview === right.preview
  );
}

export function WorkspacePane({
  project,
  activeView,
  documentDraft,
  documentDirty,
  currentProgress,
  contentSearchQuery,
  contentSearchHits,
  activeSearchHit,
  requestedHeadingSlug,
  busy,
  workspaceProjects,
  projectDocumentsByPath,
  onDraftChange,
  onProgressChange,
  onRequestedHeadingConsumed,
  onEnsureProjectDocuments,
  onSelectDocument,
  onSelectProjectDocument,
  onSaveDocument,
  onViewChange,
  readerFocusMode,
  readerFlowMode,
  onToggleReaderFocus,
  onReaderFlowModeChange,
}: WorkspacePaneProps) {
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const previewArticleRef = useRef<HTMLElement | null>(null);
  const searchMarksRef = useRef<HTMLElement[]>([]);
  const restoredScrollKeyRef = useRef<string | null>(null);
  const deferredDraft = useDeferredValue(documentDraft);
  const [searchCursorIndex, setSearchCursorIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const activeDocument = project?.activeDocument ?? null;
  const previewContent = activeDocument
    ? documentDirty
      ? deferredDraft
      : activeDocument.content
    : "";
  const markdownPreviewContent = useMemo(
    () => preprocessObsidianMarkdown(previewContent),
    [previewContent],
  );
  const savedProgress = activeDocument
    ? project?.state.documentProgress[activeDocument.summary.id] ??
      null
    : null;
  const fallbackView =
    project?.project.defaultView ??
    ((project?.documents.length ?? 0) > 1 ? "reader" : "editor");
  const resolvedView = activeView ?? fallbackView;
  const viewOptions = ["reader", "editor", "split"] as const;
  const currentDocumentIndex = project?.documents.findIndex(
    (document) => document.id === activeDocument?.summary.id,
  ) ?? -1;
  const hasChapterSwitch =
    resolvedView === "reader" &&
    (project?.documents.length ?? 0) > 1 &&
    currentDocumentIndex >= 0;
  const showReadingMeta = resolvedView === "reader";
  const isScrollReader = resolvedView === "reader" && readerFlowMode === "scroll";
  const isFloatingReaderHud = showReadingMeta && readerFocusMode;
  const showFloatingTitle = !(isFloatingReaderHud && isScrollReader);
  const previousDocument =
    hasChapterSwitch && project ? project.documents[currentDocumentIndex - 1] ?? null : null;
  const nextDocument =
    hasChapterSwitch && project ? project.documents[currentDocumentIndex + 1] ?? null : null;
  const documentLinkIndex = useMemo(
    () => createDocumentLinkIndex(project?.documents ?? []),
    [project?.documents],
  );
  const normalizedSearchQuery = contentSearchQuery.trim();
  const hasContentSearch = normalizedSearchQuery.length >= 2;
  const activeDocumentSearchHits = useMemo(() => {
    if (!activeDocument || !project) {
      return [] as SearchHit[];
    }

    return contentSearchHits.filter(
      (hit) =>
        hit.projectPath === project.project.path &&
        hit.documentId === activeDocument.summary.id,
    );
  }, [activeDocument, contentSearchHits, project]);
  const usesInlineSearchNavigation = resolvedView === "split" || isScrollReader;
  const activeSearchCount = usesInlineSearchNavigation
    ? searchMatchCount
    : activeDocumentSearchHits.length;
  const showSearchNavigation =
    showReadingMeta && hasContentSearch && activeSearchCount > 0;

  const handleMarkdownLinkClick = useCallback(
    async (
      event: ReactMouseEvent<HTMLAnchorElement>,
      href: string | null | undefined,
      resolution: MarkdownLinkResolution,
    ) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      if (resolution.kind === "external") {
        event.preventDefault();
        window.open(resolution.href, "_blank", "noopener,noreferrer");
        return;
      }

      if (resolution.kind === "heading") {
        event.preventDefault();
        onSelectDocument(activeDocument?.summary.id ?? "", resolution.headingSlug);
        return;
      }

      if (resolution.kind === "document") {
        event.preventDefault();
        onSelectDocument(resolution.documentId, resolution.headingSlug ?? null);
        return;
      }

      if (resolution.kind === "unresolved") {
        event.preventDefault();
        if (!href || !activeDocument || !project) {
          return;
        }

        for (const workspaceProject of workspaceProjects) {
          if (workspaceProject.path === project.project.path) {
            continue;
          }

          const documents =
            projectDocumentsByPath[workspaceProject.path] ??
            (await onEnsureProjectDocuments(workspaceProject.path)) ??
            [];
          if (!documents.length) {
            continue;
          }

          const crossProjectResolution = resolveMarkdownLink({
            href,
            currentDocument: activeDocument.summary,
            currentToc: [],
            documentIndex: createDocumentLinkIndex(documents),
          });

          if (crossProjectResolution.kind === "document") {
            onSelectProjectDocument(
              workspaceProject.path,
              crossProjectResolution.documentId,
              crossProjectResolution.headingSlug ?? null,
            );
            return;
          }
        }
      }
    },
    [
      activeDocument,
      onEnsureProjectDocuments,
      onSelectDocument,
      onSelectProjectDocument,
      project,
      projectDocumentsByPath,
      workspaceProjects,
    ],
  );

  const handleCopyCode = useCallback(async (code: string, codeKey: string) => {
    try {
      await copyTextToClipboard(code);
      setCopiedCodeKey(codeKey);
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setCopiedCodeKey(null);
        copyFeedbackTimeoutRef.current = null;
      }, 1400);
    } catch {
      setCopiedCodeKey(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const markdownComponents = useMemo(() => {
    const slugCounts = new Map<string, number>();
    const createHeading = (tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
      function HeadingRenderer({ children }: HeadingRendererProps) {
        const text = flattenText(children);
        const id = createHeadingId(text, slugCounts);
        return createElement(
          tag,
          {
            id,
            "data-rreadnote-heading": "true",
            "data-heading-title": text,
          },
          children,
        );
      };

    return {
      h1: createHeading("h1"),
      h2: createHeading("h2"),
      h3: createHeading("h3"),
      h4: createHeading("h4"),
      h5: createHeading("h5"),
      h6: createHeading("h6"),
      img: function IllustrationImageRenderer({ alt, src }: ImageRendererProps) {
        if (!src?.startsWith("illustration:")) {
          return <img src={src} alt={alt ?? ""} />;
        }

        return (
          <InlineIllustration
            caption={alt?.trim() || "插图"}
            variant={src.replace(/^illustration:/, "")}
            compact
          />
        );
      },
      a: function MarkdownLinkRenderer({
        href,
        children,
        node: _node,
        className,
        ...props
      }: MarkdownAnchorProps) {
        const resolution = resolveMarkdownLink({
          href,
          currentDocument: activeDocument?.summary ?? null,
          currentToc: activeDocument?.toc ?? [],
          documentIndex: documentLinkIndex,
        });
        const targetProps =
          resolution.kind === "external"
            ? { target: "_blank", rel: "noreferrer" }
            : {};

        return (
          <a
            {...props}
            {...targetProps}
            href={href}
            className={`${className ?? ""} ${classifyLinkClassName(resolution)}`.trim()}
            data-link-kind={resolution.kind}
            title={resolution.title}
            onClick={(event) => void handleMarkdownLinkClick(event, href, resolution)}
          >
            {children}
          </a>
        );
      },
      table: function MarkdownTableRenderer({
        children,
        node: _node,
        ...props
      }: ComponentPropsWithoutRef<"table"> & { node?: unknown }) {
        return (
          <div className="reader-table-wrap">
            <table {...props}>{children}</table>
          </div>
        );
      },
      pre: function MarkdownPreRenderer({
        children,
        node: _node,
        ...props
      }: MarkdownPreProps) {
        const language = inferCodeLanguage(children);
        const codeText = flattenText(children).replace(/\n$/u, "");
        const normalizedLanguage = language?.toLocaleLowerCase("en-US") ?? "text";

        if (normalizedLanguage === "mermaid") {
          return <MermaidBlock code={codeText} />;
        }

        const codeKey = `${normalizedLanguage}:${codeText}`;
        const copied = copiedCodeKey === codeKey;
        return (
          <div className="reader-code-frame" data-language={language ?? undefined}>
            <div className="reader-code-header">
              <span className="reader-code-meta">
                <span className="reader-code-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="reader-code-language">{language ?? "text"}</span>
              </span>
              <button
                type="button"
                className="reader-code-copy"
                data-copied={copied ? "true" : undefined}
                onClick={() => void handleCopyCode(codeText, codeKey)}
                aria-label={copied ? "代码已复制" : "复制代码"}
              >
                {copied ? <CheckRounded fontSize="inherit" /> : <ContentCopyRounded fontSize="inherit" />}
                <span>{copied ? "已复制" : "复制"}</span>
              </button>
            </div>
            <pre {...props}>{children}</pre>
          </div>
        );
      },
      code: function MarkdownCodeRenderer({
        inline,
        node: _node,
        className,
        children,
        ...props
      }: MarkdownCodeProps) {
        const language = className?.match(/language-([a-z0-9_-]+)/iu)?.[1] ?? null;
        return (
          <code
            {...props}
            className={`${className ?? ""} ${inline ? "reader-inline-code" : "reader-code-content"}`.trim()}
            data-language={language ?? undefined}
          >
            {children}
          </code>
        );
      },
      blockquote: function MarkdownBlockquoteRenderer({
        children,
        node: _node,
        className,
        ...props
      }: MarkdownBlockquoteProps) {
        const calloutType = calloutTypeFromChildren(children);
        return (
          <blockquote
            {...props}
            className={`${className ?? ""} ${calloutType ? "reader-callout" : ""}`.trim()}
            data-callout={calloutType ?? undefined}
          >
            {calloutType ? (
              <>
                <div className="reader-callout-heading">
                  <span className="reader-callout-icon" aria-hidden="true" />
                  <span>{calloutLabel(calloutType)}</span>
                </div>
                {stripCalloutMarkerFromChildren(children)}
              </>
            ) : (
              children
            )}
          </blockquote>
        );
      },
    };
  }, [
    activeDocument?.summary,
    activeDocument?.toc,
    documentLinkIndex,
    handleMarkdownLinkClick,
    handleCopyCode,
    previewContent,
    copiedCodeKey,
  ]);

  const reportReaderProgress = useCallback(
    (container: HTMLDivElement) => {
      if (!activeDocument) {
        onProgressChange(null);
        return;
      }

      const maxScroll = Math.max(container.scrollHeight - container.clientHeight, 0);
      const percent =
        maxScroll === 0
          ? 0
          : Number(((container.scrollTop / maxScroll) * 100).toFixed(2));
      const headings = Array.from(
        container.querySelectorAll<HTMLElement>('[data-rreadnote-heading="true"]'),
      );

      let activeHeading = headings[0];
      for (const heading of headings) {
        if (heading.offsetTop - 24 <= container.scrollTop) {
          activeHeading = heading;
        } else {
          break;
        }
      }

      const tocItem = activeHeading
        ? activeDocument.toc.find((item) => item.slug === activeHeading.id)
        : undefined;

      onProgressChange({
        percent,
        anchorId: activeHeading?.id ?? undefined,
        headingSlug: tocItem?.slug ?? activeHeading?.id ?? undefined,
        headingTitle:
          tocItem?.title ??
          activeHeading?.dataset.headingTitle ??
          activeDocument.summary.title,
        line: tocItem?.line ?? undefined,
        updatedAt: currentProgress?.updatedAt ?? savedProgress?.updatedAt ?? "",
      });
    },
    [activeDocument, currentProgress?.updatedAt, onProgressChange, savedProgress?.updatedAt],
  );

  useEffect(() => {
    if (!activeDocument || (resolvedView !== "split" && !isScrollReader)) {
      return;
    }

    const restoreKey = `${activeDocument.summary.id}:${resolvedView}:${isScrollReader ? "scroll" : "split"}`;
    if (restoredScrollKeyRef.current === restoreKey) {
      return;
    }
    restoredScrollKeyRef.current = restoreKey;

    const frame = window.requestAnimationFrame(() => {
      const container = previewScrollRef.current;
      if (!container) {
        return;
      }

      if (savedProgress?.headingSlug) {
        const target = container.querySelector<HTMLElement>(
          `#${escapeHeadingId(savedProgress.headingSlug)}`,
        );
        target?.scrollIntoView({ block: "start" });
      } else if (savedProgress?.percent) {
        const maxScroll = Math.max(container.scrollHeight - container.clientHeight, 0);
        container.scrollTop = (savedProgress.percent / 100) * maxScroll;
      } else {
        container.scrollTop = 0;
      }

      reportReaderProgress(container);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    activeDocument?.summary.id,
    isScrollReader,
    resolvedView,
    savedProgress?.headingSlug,
    savedProgress?.percent,
  ]);

  useEffect(() => {
    if (!requestedHeadingSlug || !previewScrollRef.current || (resolvedView !== "split" && !isScrollReader)) {
      return;
    }

    const target = previewScrollRef.current.querySelector<HTMLElement>(
      `#${escapeHeadingId(requestedHeadingSlug)}`,
    );
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
    onRequestedHeadingConsumed();
  }, [isScrollReader, resolvedView, onRequestedHeadingConsumed, requestedHeadingSlug]);

  useEffect(() => {
    const container = previewScrollRef.current;
    if (!container || !activeDocument || (resolvedView !== "split" && !isScrollReader)) {
      return;
    }

    let animationFrame = 0;
    const handleScroll = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        reportReaderProgress(container);
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(animationFrame);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [activeDocument, isScrollReader, reportReaderProgress, resolvedView]);

  useEffect(() => {
    const root = previewArticleRef.current;
    if (!root || !usesInlineSearchNavigation) {
      searchMarksRef.current = [];
      setSearchMatchCount(0);
      return;
    }

    const marks = hasContentSearch ? highlightSearchMarks(root, normalizedSearchQuery) : [];
    searchMarksRef.current = marks;
    setSearchMatchCount(marks.length);

    if (!marks.length) {
      setSearchCursorIndex(0);
      return;
    }

    const matchedSearchIndex =
      activeSearchHit && activeDocument && project
        ? activeSearchHit.projectPath === project.project.path &&
          activeSearchHit.documentId === activeDocument.summary.id
          ? findSearchMarkIndex(marks, activeSearchHit)
          : -1
        : -1;

    setSearchCursorIndex((previous) => {
      if (matchedSearchIndex >= 0) {
        return matchedSearchIndex;
      }

      return Math.min(previous, marks.length - 1);
    });

    return () => {
      clearSearchMarks(root);
      searchMarksRef.current = [];
    };
  }, [
    activeDocument,
    activeSearchHit,
    hasContentSearch,
    markdownPreviewContent,
    normalizedSearchQuery,
    project,
    usesInlineSearchNavigation,
  ]);

  useEffect(() => {
    if (usesInlineSearchNavigation) {
      return;
    }

    if (!activeDocumentSearchHits.length) {
      setSearchCursorIndex(0);
      return;
    }

    const selectedHitIndex = activeDocumentSearchHits.findIndex((hit) =>
      sameSearchHit(hit, activeSearchHit),
    );

    setSearchCursorIndex((previous) => {
      if (selectedHitIndex >= 0) {
        return selectedHitIndex;
      }

      return Math.min(previous, activeDocumentSearchHits.length - 1);
    });
  }, [activeDocumentSearchHits, activeSearchHit, usesInlineSearchNavigation]);

  useEffect(() => {
    if (!usesInlineSearchNavigation) {
      return;
    }

    const marks = searchMarksRef.current;
    for (const [index, mark] of marks.entries()) {
      mark.classList.toggle("reader-search-mark-active", index === searchCursorIndex);
    }

    const target = marks[searchCursorIndex];
    if (!target) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [searchCursorIndex, searchMatchCount, usesInlineSearchNavigation]);

  const moveSearchCursor = useCallback(
    (delta: number) => {
      if (usesInlineSearchNavigation) {
        setSearchCursorIndex((previous) =>
          cycleIndex(previous, searchMarksRef.current.length, delta),
        );
        return;
      }

      setSearchCursorIndex((previous) => {
        const nextIndex = cycleIndex(previous, activeDocumentSearchHits.length, delta);
        const nextHit = activeDocumentSearchHits[nextIndex];
        if (nextHit?.headingSlug && activeDocument) {
          onSelectDocument(activeDocument.summary.id, nextHit.headingSlug);
        }
        return nextIndex;
      });
    },
    [activeDocument, activeDocumentSearchHits, onSelectDocument, usesInlineSearchNavigation],
  );

  return (
    <Card className={`panel-card panel-column workspace-panel ${showReadingMeta ? "workspace-panel-reader" : ""} ${readerFocusMode ? "workspace-panel-focus" : ""}`}>
      <CardContent className={`panel-content workspace-panel-content ${isFloatingReaderHud ? "workspace-panel-content-reader-focus" : ""}`}>
        {isFloatingReaderHud ? <div className="workspace-hud-reveal-zone" aria-hidden="true" /> : null}
        <div className={`workspace-header ${showReadingMeta ? "workspace-header-reader" : ""} ${readerFocusMode ? "workspace-header-focus" : ""} ${isFloatingReaderHud ? "workspace-header-overlay" : ""}`}>
          {showFloatingTitle ? (
            <div className={`workspace-title-row ${readerFocusMode ? "workspace-title-row-focus" : ""} ${isFloatingReaderHud ? "workspace-title-row-floating" : ""}`}>
              <h2 className="panel-title">
                {activeDocument?.summary.title ?? "主工作区"}
              </h2>
              {activeDocument ? (
                <div className="panel-caption">{activeDocument.summary.relativePath}</div>
              ) : (
                <div className="panel-caption">阅读、编辑、分栏统一工作区</div>
              )}
            </div>
          ) : null}

          {activeDocument && resolvedView ? (
            <div className={`workspace-toolbar-row ${showReadingMeta ? "workspace-toolbar-row-reader" : ""} ${readerFocusMode ? "workspace-toolbar-row-focus" : ""} ${isFloatingReaderHud ? "workspace-toolbar-row-floating" : ""}`}>
              <div className={`workspace-toolbar ${showReadingMeta ? "workspace-toolbar-hud" : ""} ${readerFocusMode ? "workspace-toolbar-hud-focus" : ""} ${isFloatingReaderHud ? "workspace-toolbar-hud-floating" : ""}`}>
                <div className="view-switch">
                  {viewOptions.map((view) => (
                    <button
                      key={view}
                      type="button"
                      className={`view-button ${resolvedView === view ? "view-button-active" : ""}`}
                      onClick={() => onViewChange(view)}
                      aria-label={viewLabel(view)}
                      title={viewLabel(view)}
                    >
                      {viewIcon(view)}
                      <span className="toolbar-label">{viewLabel(view)}</span>
                    </button>
                  ))}
                </div>

                {showReadingMeta ? (
                  <span className="progress-label">
                    {formatPercent(currentProgress?.percent ?? savedProgress?.percent ?? 0)}
                  </span>
                ) : null}

                {showSearchNavigation ? (
                  <div className="search-navigation" role="group" aria-label="搜索命中导航">
                    <span className="search-navigation-icon" aria-hidden="true">
                      <SearchRounded fontSize="small" />
                    </span>
                    <span className="search-navigation-count">
                      {Math.min(searchCursorIndex + 1, activeSearchCount)}/{activeSearchCount}
                    </span>
                    <button
                      type="button"
                      className="search-navigation-button"
                      onClick={() => moveSearchCursor(-1)}
                      title="上一个命中"
                      aria-label="上一个命中"
                    >
                      <KeyboardArrowUpRounded fontSize="small" />
                    </button>
                    <button
                      type="button"
                      className="search-navigation-button"
                      onClick={() => moveSearchCursor(1)}
                      title="下一个命中"
                      aria-label="下一个命中"
                    >
                      <KeyboardArrowDownRounded fontSize="small" />
                    </button>
                  </div>
                ) : null}

                {showReadingMeta ? (
                  <div className="reader-mode-switch" role="tablist" aria-label="阅读模式">
                    <button
                      type="button"
                      className={`reader-mode-button ${readerFlowMode === "paged" ? "reader-mode-button-active" : ""}`}
                      onClick={() => onReaderFlowModeChange("paged")}
                      title="分页阅读"
                    >
                      <ArticleRounded fontSize="small" />
                      <span className="toolbar-label">分页</span>
                    </button>
                    <button
                      type="button"
                      className={`reader-mode-button ${readerFlowMode === "scroll" ? "reader-mode-button-active" : ""}`}
                      onClick={() => onReaderFlowModeChange("scroll")}
                      title="滚动阅读"
                    >
                      <SwapVertRounded fontSize="small" />
                      <span className="toolbar-label">滚动</span>
                    </button>
                  </div>
                ) : null}

                {showReadingMeta ? (
                  <div className="layout-switch">
                    <button
                      type="button"
                      className={`layout-toggle layout-toggle-emphasis ${readerFocusMode ? "layout-toggle-active" : ""}`}
                      onClick={onToggleReaderFocus}
                      title={readerFocusMode ? "退出沉浸阅读" : "进入沉浸阅读"}
                    >
                      {readerFocusMode ? (
                        <FullscreenExitRounded fontSize="small" />
                      ) : (
                        <FullscreenRounded fontSize="small" />
                      )}
                    </button>
                  </div>
                ) : null}

                {hasChapterSwitch && project ? (
                  <div className="chapter-switch">
                    <button
                      type="button"
                      className="chapter-button"
                      onClick={() => previousDocument && onSelectDocument(previousDocument.id)}
                      disabled={!previousDocument}
                      title="上一章"
                    >
                      <ChevronLeftRounded fontSize="small" />
                      <span className="chapter-button-label">上一章</span>
                    </button>

                    <span className="chapter-index">
                      <span className="chapter-index-full">
                        第 {currentDocumentIndex + 1} / {project.documents.length} 章
                      </span>
                      <span className="chapter-index-compact">
                        {currentDocumentIndex + 1}/{project.documents.length}
                      </span>
                    </span>

                    <button
                      type="button"
                      className="chapter-button"
                      onClick={() => nextDocument && onSelectDocument(nextDocument.id)}
                      disabled={!nextDocument}
                      title="下一章"
                    >
                      <span className="chapter-button-label">下一章</span>
                      <ChevronRightRounded fontSize="small" />
                    </button>
                  </div>
                ) : null}

                <div className="workspace-actions">
                  {resolvedView !== "reader" ? (
                    <Button
                      variant="contained"
                      onClick={onSaveDocument}
                      disabled={!documentDirty || busy}
                    >
                      保存
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {activeDocument ? (
          <div className={`workspace-stage ${showReadingMeta ? "workspace-stage-reader" : ""} ${isFloatingReaderHud ? "workspace-stage-reader-focus" : ""}`}>
            {resolvedView === "editor" ? (
              <div className="editor-shell">
                <textarea
                  className="editor-surface"
                  value={documentDraft}
                  onChange={(event) => onDraftChange(event.currentTarget.value)}
                  spellCheck={false}
                />
              </div>
            ) : null}

            {resolvedView === "reader" && readerFlowMode === "paged" ? (
              <PaginatedReader
                documentId={activeDocument.summary.id}
                title={activeDocument.summary.title}
                markdown={previewContent}
                progress={currentProgress ?? savedProgress ?? null}
                requestedHeadingSlug={requestedHeadingSlug}
                focusMode={readerFocusMode}
                onProgressChange={onProgressChange}
                onRequestedHeadingConsumed={onRequestedHeadingConsumed}
              />
            ) : null}

            {resolvedView === "reader" && readerFlowMode === "scroll" ? (
              <div
                ref={previewScrollRef}
                className={`preview-scroll preview-scroll-single reader-scroll-shell ${readerFocusMode ? "reader-scroll-shell-focus" : ""} ${isFloatingReaderHud ? "reader-scroll-shell-hud-offset" : ""}`}
              >
                <article ref={previewArticleRef} className="reader-article reader-article-scroll">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                    urlTransform={markdownUrlTransform}
                  >
                    {markdownPreviewContent}
                  </ReactMarkdown>
                </article>
              </div>
            ) : null}

            {resolvedView === "split" ? (
              <div className="workspace-split">
                <div className="split-pane editor-shell">
                  <textarea
                    className="editor-surface"
                    value={documentDraft}
                    onChange={(event) => onDraftChange(event.currentTarget.value)}
                    spellCheck={false}
                  />
                </div>

                <div
                  ref={previewScrollRef}
                  className="split-pane preview-scroll"
                >
                  <article ref={previewArticleRef} className="reader-article">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                      urlTransform={markdownUrlTransform}
                    >
                      {markdownPreviewContent}
                    </ReactMarkdown>
                  </article>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="panel-empty workspace-empty">先打开一个内容项目</div>
        )}
      </CardContent>
    </Card>
  );
}
