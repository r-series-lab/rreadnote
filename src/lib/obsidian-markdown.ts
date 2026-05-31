import { basename, createHeadingId } from "./markdown";
import type { DocumentSummary, TocItem } from "./rreadnote";

const WIKI_LINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g;
const FENCED_BLOCK_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const INTERNAL_NOTE_SCHEME = "rreadnote://note/";

export type MarkdownLinkResolution =
  | {
      kind: "heading";
      headingSlug: string;
      title: string;
    }
  | {
      kind: "document";
      documentId: string;
      headingSlug?: string | null;
      title: string;
    }
  | {
      kind: "external";
      href: string;
      title: string;
    }
  | {
      kind: "unresolved";
      title: string;
    };

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitWikiPayload(payload: string) {
  const separatorIndex = payload.indexOf("|");
  if (separatorIndex < 0) {
    return {
      target: payload.trim(),
      label: payload.trim(),
    };
  }

  const target = payload.slice(0, separatorIndex).trim();
  const label = payload.slice(separatorIndex + 1).trim();
  return {
    target,
    label: label || target,
  };
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function encodeInternalNoteHref(target: string) {
  return `${INTERNAL_NOTE_SCHEME}${encodeURIComponent(target)}`;
}

function transformWikiLinks(segment: string) {
  return segment.replace(WIKI_LINK_RE, (match, embedPrefix: string, payload: string) => {
    if (embedPrefix) {
      return match;
    }

    const { target, label } = splitWikiPayload(payload);
    if (!target) {
      return match;
    }

    return `[${escapeMarkdownLabel(label)}](${encodeInternalNoteHref(target)})`;
  });
}

export function preprocessObsidianMarkdown(markdown: string) {
  return markdown
    .split(FENCED_BLOCK_RE)
    .map((segment) => {
      if (segment.startsWith("```") || segment.startsWith("~~~")) {
        return segment;
      }

      return transformWikiLinks(segment);
    })
    .join("");
}

function stripMarkdownExtension(value: string) {
  return value.replace(/\.md$/iu, "");
}

function normalizePathSlashes(value: string) {
  return value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function normalizeDocumentKey(value: string) {
  return stripMarkdownExtension(normalizePathSlashes(safeDecode(value)))
    .replace(/^\.?\//u, "")
    .replace(/^\/+/u, "")
    .trim()
    .toLocaleLowerCase("zh-Hans-CN");
}

function dirname(path: string) {
  const normalized = normalizePathSlashes(path);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : "";
}

function joinRelativePath(basePath: string, targetPath: string) {
  const segments = normalizePathSlashes(`${dirname(basePath)}/${targetPath}`).split("/");
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      resolved.pop();
      continue;
    }

    resolved.push(segment);
  }

  return resolved.join("/");
}

function addDocumentKey(
  index: Map<string, DocumentSummary>,
  key: string | null | undefined,
  document: DocumentSummary,
) {
  const normalizedKey = normalizeDocumentKey(key ?? "");
  if (!normalizedKey || index.has(normalizedKey)) {
    return;
  }

  index.set(normalizedKey, document);
}

export function createDocumentLinkIndex(documents: DocumentSummary[]) {
  const index = new Map<string, DocumentSummary>();

  for (const document of documents) {
    const fileName = basename(document.relativePath || document.path || document.title);

    addDocumentKey(index, document.id, document);
    addDocumentKey(index, document.title, document);
    addDocumentKey(index, document.relativePath, document);
    addDocumentKey(index, document.path, document);
    addDocumentKey(index, fileName, document);
    addDocumentKey(index, stripMarkdownExtension(fileName), document);
    addDocumentKey(index, stripMarkdownExtension(document.relativePath), document);
  }

  return index;
}

function splitHrefTarget(value: string) {
  const hashIndex = value.indexOf("#");
  if (hashIndex < 0) {
    return {
      documentTarget: value,
      headingTarget: null,
    };
  }

  return {
    documentTarget: value.slice(0, hashIndex),
    headingTarget: value.slice(hashIndex + 1),
  };
}

function isExternalHref(href: string) {
  return /^[a-z][a-z0-9+.-]*:/iu.test(href) && !href.startsWith(INTERNAL_NOTE_SCHEME);
}

function resolveHeadingSlug(toc: TocItem[], headingTarget: string | null | undefined) {
  const decodedHeading = safeDecode(headingTarget ?? "").replace(/^#+/u, "").trim();
  if (!decodedHeading) {
    return null;
  }

  const directMatch = toc.find(
    (item) =>
      item.slug === decodedHeading ||
      item.title === decodedHeading ||
      item.title.toLocaleLowerCase("zh-Hans-CN") === decodedHeading.toLocaleLowerCase("zh-Hans-CN"),
  );
  if (directMatch) {
    return directMatch.slug;
  }

  return createHeadingId(decodedHeading, new Map());
}

function resolveDocumentTarget(input: {
  documentTarget: string;
  currentDocument: DocumentSummary;
  documentIndex: Map<string, DocumentSummary>;
}) {
  const { documentTarget, currentDocument, documentIndex } = input;
  const decodedTarget = safeDecode(documentTarget).trim();
  if (!decodedTarget) {
    return currentDocument;
  }

  const candidateKeys = [
    decodedTarget,
    stripMarkdownExtension(decodedTarget),
    joinRelativePath(currentDocument.relativePath, decodedTarget),
    stripMarkdownExtension(joinRelativePath(currentDocument.relativePath, decodedTarget)),
    basename(decodedTarget),
    stripMarkdownExtension(basename(decodedTarget)),
  ];

  for (const candidateKey of candidateKeys) {
    const match = documentIndex.get(normalizeDocumentKey(candidateKey));
    if (match) {
      return match;
    }
  }

  return null;
}

export function resolveMarkdownLink(input: {
  href: string | null | undefined;
  currentDocument: DocumentSummary | null;
  currentToc: TocItem[];
  documentIndex: Map<string, DocumentSummary>;
}): MarkdownLinkResolution {
  const href = (input.href ?? "").trim();
  if (!href) {
    return { kind: "unresolved", title: "空链接" };
  }

  if (href.startsWith("#")) {
    const headingSlug = resolveHeadingSlug(input.currentToc, href.slice(1));
    return headingSlug
      ? { kind: "heading", headingSlug, title: `跳转到 ${safeDecode(href.slice(1))}` }
      : { kind: "unresolved", title: "找不到标题锚点" };
  }

  if (isExternalHref(href)) {
    return {
      kind: "external",
      href,
      title: href,
    };
  }

  if (!input.currentDocument) {
    return { kind: "unresolved", title: "还没有打开文档" };
  }

  const rawTarget = href.startsWith(INTERNAL_NOTE_SCHEME)
    ? safeDecode(href.slice(INTERNAL_NOTE_SCHEME.length))
    : safeDecode(href);
  const { documentTarget, headingTarget } = splitHrefTarget(rawTarget);
  const document = resolveDocumentTarget({
    documentTarget,
    currentDocument: input.currentDocument,
    documentIndex: input.documentIndex,
  });

  if (!document) {
    return {
      kind: "unresolved",
      title: `找不到 ${documentTarget || rawTarget}`,
    };
  }

  const headingSlug =
    document.id === input.currentDocument.id
      ? resolveHeadingSlug(input.currentToc, headingTarget)
      : resolveHeadingSlug([], headingTarget);

  if (document.id === input.currentDocument.id && headingTarget) {
    return headingSlug
      ? { kind: "heading", headingSlug, title: `跳转到 ${safeDecode(headingTarget)}` }
      : { kind: "unresolved", title: "找不到标题锚点" };
  }

  return {
    kind: "document",
    documentId: document.id,
    headingSlug,
    title: headingTarget
      ? `打开 ${document.title} / ${safeDecode(headingTarget)}`
      : `打开 ${document.title}`,
  };
}
