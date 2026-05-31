import type { ReactNode } from "react";

export function flattenText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(flattenText).join("");
  }

  if (node && typeof node === "object" && "props" in node) {
    return flattenText((node as { props?: { children?: ReactNode } }).props?.children);
  }

  return "";
}

export function createHeadingId(
  value: string,
  slugCounts: Map<string, number>,
) {
  let slug = "";
  let lastWasDash = false;

  for (const character of value) {
    const code = character.charCodeAt(0);
    const isCjk =
      (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff);
    let nextCharacter: string | null = null;

    if (/[a-z0-9]/i.test(character)) {
      nextCharacter = character.toLowerCase();
    } else if (isCjk) {
      nextCharacter = character;
    } else if (/\s|[-_/|.]/.test(character)) {
      nextCharacter = "-";
    }

    if (!nextCharacter) {
      continue;
    }

    if (nextCharacter === "-") {
      if (!lastWasDash && slug.length > 0) {
        slug += "-";
        lastWasDash = true;
      }
      continue;
    }

    slug += nextCharacter;
    lastWasDash = false;
  }

  const baseSlug = slug.replace(/^-+|-+$/g, "") || "section";
  const count = slugCounts.get(baseSlug) ?? 0;
  slugCounts.set(baseSlug, count + 1);

  return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
}

export function basename(path: string) {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

export function formatPercent(percent?: number | null) {
  if (percent == null || Number.isNaN(percent)) {
    return "0.0%";
  }

  return `${percent.toFixed(1)}%`;
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return "未保存";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeSelection(text: string) {
  return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
