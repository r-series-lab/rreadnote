import { KeyboardDoubleArrowRightRounded } from "@mui/icons-material";
import { Card, CardContent } from "@mui/material";

import { formatPercent } from "../lib/markdown";
import type { ProjectDetail, ReadingProgress } from "../lib/rreadnote";

type InspectorPanelProps = {
  project: ProjectDetail | null;
  currentProgress: ReadingProgress | null;
  onCollapse: () => void;
  onJumpToHeading: (slug: string) => void;
};

export function InspectorPanel({
  project,
  currentProgress,
  onCollapse,
  onJumpToHeading,
}: InspectorPanelProps) {
  const activeDocument = project?.activeDocument ?? null;

  return (
    <Card className="panel-card panel-column inspector-panel">
      <button
        type="button"
        className="panel-collapse-handle panel-collapse-handle-left"
        onClick={onCollapse}
        title="收起目录栏"
      >
        <KeyboardDoubleArrowRightRounded fontSize="small" />
      </button>

      <CardContent className="panel-content inspector-content">
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">目录</h2>
            {project ? (
              <div className="panel-caption">
                {project.project.title} · {formatPercent(currentProgress?.percent ?? 0)}
              </div>
            ) : null}
          </div>
        </div>

        {project && activeDocument ? (
          <>
            <div className="inspector-section">
              <div className="section-title-row">
                <h3 className="section-title">结构导航</h3>
                <span className="section-meta">{activeDocument.toc.length}</span>
              </div>

              <div className="outline-list">
                {activeDocument.toc.length > 0 ? (
                  activeDocument.toc.map((item, index) => {
                    const isActive = currentProgress?.headingSlug === item.slug;
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        className={`outline-item ${isActive ? "outline-item-active" : ""}`}
                        style={{ ["--outline-depth" as string]: item.depth }}
                        onClick={() => onJumpToHeading(item.slug)}
                      >
                        <span className="outline-index" aria-hidden="true">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="outline-copy">
                          <span className="outline-leading" aria-hidden="true">
                            <span className="outline-rail" />
                            <span className="outline-dot" />
                          </span>
                          <span className="outline-text">
                            <span className="outline-kicker">
                              {item.depth <= 1 ? "Chapter" : "Section"}
                            </span>
                            <span className="outline-title">{item.title}</span>
                          </span>
                        </span>
                        <span className="outline-line">L{item.line}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="panel-empty panel-empty-compact">没有标题结构</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="panel-empty inspector-empty">打开内容后显示结构</div>
        )}
      </CardContent>
    </Card>
  );
}
