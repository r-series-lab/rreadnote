import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftRounded,
  ChevronRightRounded,
} from "@mui/icons-material";

import { InlineIllustration } from "./InlineIllustration";
import type { ReadingProgress } from "../lib/rreadnote";
import {
  PRETEXT_PAGE_PADDING_X,
  PRETEXT_PAGE_PADDING_Y,
  layoutPaginatedDocument,
  preparePaginatedDocument,
  resolvePageIndex,
  resolveReadingProgress,
} from "../lib/pretext-pagination";

type PaginatedReaderProps = {
  documentId: string;
  title: string;
  markdown: string;
  progress: ReadingProgress | null;
  requestedHeadingSlug: string | null;
  focusMode?: boolean;
  onProgressChange: (progress: ReadingProgress | null) => void;
  onRequestedHeadingConsumed: () => void;
};

type ViewportSize = {
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function progressSignature(progress: ReadingProgress | null | undefined) {
  if (!progress) {
    return "none";
  }

  return JSON.stringify({
    percent: Number(progress.percent.toFixed(2)),
    headingSlug: progress.headingSlug ?? null,
    headingTitle: progress.headingTitle ?? null,
    line: progress.line ?? null,
    anchorId: progress.anchorId ?? null,
  });
}

export function PaginatedReader({
  documentId,
  title,
  markdown,
  progress,
  requestedHeadingSlug,
  focusMode = false,
  onProgressChange,
  onRequestedHeadingConsumed,
}: PaginatedReaderProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastReportedProgressRef = useRef("none");
  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    width: 0,
    height: 0,
  });
  const [pageIndex, setPageIndex] = useState(0);

  const preparedDocument = useMemo(() => preparePaginatedDocument(markdown), [markdown]);
  const paginatedLayout = useMemo(() => {
    if (viewportSize.width <= PRETEXT_PAGE_PADDING_X * 2 || viewportSize.height <= PRETEXT_PAGE_PADDING_Y * 2) {
      return {
        pageCount: 0,
        pages: [],
      };
    }

    return layoutPaginatedDocument(
      preparedDocument,
      viewportSize.width - PRETEXT_PAGE_PADDING_X * 2,
      viewportSize.height - PRETEXT_PAGE_PADDING_Y * 2,
    );
  }, [preparedDocument, viewportSize.height, viewportSize.width]);

  const currentPage = paginatedLayout.pages[pageIndex] ?? null;
  const currentReadingProgress = useMemo(
    () => resolveReadingProgress(paginatedLayout.pages, pageIndex, title),
    [pageIndex, paginatedLayout.pages, title],
  );

  useEffect(() => {
    lastReportedProgressRef.current = "none";
  }, [documentId]);

  useEffect(() => {
    let frame = 0;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      const element = stageRef.current;
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const nextWidth = Math.round(rect.width);
      const nextHeight = Math.round(rect.height);
      setViewportSize((previous) => {
        if (previous.width === nextWidth && previous.height === nextHeight) {
          return previous;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    void document.fonts?.ready.then(() => {
      scheduleMeasure();
    });

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        scheduleMeasure();
      });

      if (stageRef.current) {
        observer.observe(stageRef.current);
      }
    }

    window.addEventListener("resize", scheduleMeasure);

    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [documentId, markdown]);

  useEffect(() => {
    const nextSignature = progressSignature(progress);
    if (nextSignature === lastReportedProgressRef.current) {
      return;
    }

    if (paginatedLayout.pageCount === 0) {
      setPageIndex(0);
      return;
    }

    const nextIndex = resolvePageIndex(paginatedLayout.pages, progress);
    setPageIndex((previous) =>
      previous === nextIndex ? previous : clamp(nextIndex, 0, paginatedLayout.pageCount - 1),
    );
  }, [
    documentId,
    paginatedLayout.pageCount,
    paginatedLayout.pages,
    progress?.headingSlug,
    progress?.percent,
  ]);

  useEffect(() => {
    if (!requestedHeadingSlug || paginatedLayout.pageCount === 0) {
      return;
    }

    const nextIndex = resolvePageIndex(paginatedLayout.pages, {
      headingSlug: requestedHeadingSlug,
    });
    setPageIndex((previous) =>
      previous === nextIndex ? previous : clamp(nextIndex, 0, paginatedLayout.pageCount - 1),
    );
    onRequestedHeadingConsumed();
  }, [
    onRequestedHeadingConsumed,
    paginatedLayout.pageCount,
    paginatedLayout.pages,
    requestedHeadingSlug,
  ]);

  useEffect(() => {
    if (paginatedLayout.pageCount === 0) {
      return;
    }

    const nextProgress = {
      percent: currentReadingProgress.percent,
      anchorId: currentReadingProgress.anchorId,
      headingSlug: currentReadingProgress.headingSlug,
      headingTitle: currentReadingProgress.headingTitle,
      line: currentReadingProgress.line,
      updatedAt: progress?.updatedAt ?? "",
    };
    lastReportedProgressRef.current = progressSignature(nextProgress);
    onProgressChange(nextProgress);
  }, [
    currentReadingProgress.anchorId,
    currentReadingProgress.headingSlug,
    currentReadingProgress.headingTitle,
    currentReadingProgress.line,
    currentReadingProgress.percent,
    onProgressChange,
    paginatedLayout.pageCount,
    progress?.updatedAt,
  ]);

  const goToPage = (nextIndex: number) => {
    setPageIndex(clamp(nextIndex, 0, Math.max(paginatedLayout.pageCount - 1, 0)));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      goToPage(pageIndex + 1);
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToPage(pageIndex - 1);
    }
  };

  return (
    <div className={`pretext-reader-shell ${focusMode ? "pretext-reader-shell-focus" : ""}`}>
      <div
        ref={stageRef}
        className={`pretext-reader-stage ${focusMode ? "pretext-reader-stage-focus" : ""}`}
      >
        <button
          type="button"
          className={`pretext-edge-zone pretext-edge-zone-left ${focusMode ? "pretext-edge-zone-focus" : ""}`}
          onClick={() => goToPage(pageIndex - 1)}
          disabled={pageIndex <= 0}
          aria-label="上一页"
        >
          <span className="pretext-edge-hint">
            <ChevronLeftRounded fontSize="small" />
          </span>
        </button>

        <div
          ref={viewportRef}
          className={`pretext-reader-viewport ${focusMode ? "pretext-reader-viewport-focus" : ""}`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div
            className={`pretext-page-status pretext-page-status-floating ${focusMode ? "pretext-page-status-focus" : ""}`}
          >
            {paginatedLayout.pageCount > 0
              ? `${pageIndex + 1} / ${paginatedLayout.pageCount}`
              : "排版中"}
          </div>
          <article className={`pretext-page-sheet ${focusMode ? "pretext-page-sheet-focus" : ""}`}>
            {currentPage ? (
              currentPage.items.map((item) => {
                if (item.kind === "rule") {
                  return (
                    <div
                      key={item.id}
                      className="pretext-rule"
                      style={{
                        marginTop: `${item.marginTop}px`,
                        marginBottom: `${item.marginBottom}px`,
                      }}
                    />
                  );
                }

                if (item.kind === "list") {
                  return (
                    <div
                      key={item.id}
                      className={`pretext-block pretext-block-list ${item.continuation ? "pretext-block-continuation" : ""}`}
                      style={{
                        marginTop: `${item.marginTop}px`,
                        marginBottom: `${item.marginBottom}px`,
                      }}
                    >
                      <div className="pretext-list-marker">
                        {item.markerText ?? ""}
                      </div>
                      <div className="pretext-line-stack">
                        {item.textLines.map((line, lineIndex) => (
                          <div
                            key={`${item.id}-${lineIndex}`}
                            className="pretext-line"
                            style={{ lineHeight: `${item.lineHeight}px` }}
                          >
                            {line || "\u00A0"}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (item.kind === "quote") {
                  return (
                    <div
                      key={item.id}
                      className={`pretext-block pretext-block-quote ${item.continuation ? "pretext-block-continuation" : ""}`}
                      style={{
                        marginTop: `${item.marginTop}px`,
                        marginBottom: `${item.marginBottom}px`,
                      }}
                    >
                      <div className="pretext-quote-rail" />
                      <div className="pretext-line-stack">
                        {item.textLines.map((line, lineIndex) => (
                          <div
                            key={`${item.id}-${lineIndex}`}
                            className="pretext-line"
                            style={{ lineHeight: `${item.lineHeight}px` }}
                          >
                            {line || "\u00A0"}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (item.kind === "illustration") {
                  return (
                    <div
                      key={item.id}
                      className="pretext-block pretext-block-illustration"
                      style={{
                        marginTop: `${item.marginTop}px`,
                        marginBottom: `${item.marginBottom}px`,
                      }}
                    >
                      <InlineIllustration
                        caption={item.illustrationCaption ?? "插图"}
                        variant={item.illustrationVariant}
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className={`pretext-block pretext-block-${item.kind} ${item.kind === "heading" ? `pretext-heading-level-${item.level ?? 1}` : ""} ${item.continuation ? "pretext-block-continuation" : ""}`}
                    style={{
                      marginTop: `${item.marginTop}px`,
                      marginBottom: `${item.marginBottom}px`,
                    }}
                  >
                    <div className="pretext-line-stack">
                      {item.textLines.map((line, lineIndex) => (
                        <div
                          key={`${item.id}-${lineIndex}`}
                          className="pretext-line"
                          style={{ lineHeight: `${item.lineHeight}px` }}
                        >
                          {line || "\u00A0"}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="pretext-reader-empty">正在排版当前内容…</div>
            )}
          </article>
        </div>

        <button
          type="button"
          className={`pretext-edge-zone pretext-edge-zone-right ${focusMode ? "pretext-edge-zone-focus" : ""}`}
          onClick={() => goToPage(pageIndex + 1)}
          disabled={pageIndex >= paginatedLayout.pageCount - 1}
          aria-label="下一页"
        >
          <span className="pretext-edge-hint">
            <ChevronRightRounded fontSize="small" />
          </span>
        </button>
      </div>
    </div>
  );
}
