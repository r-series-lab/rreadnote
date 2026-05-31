import { type MouseEvent, useEffect, useMemo, useState } from "react";
import {
  AddRounded,
  ArticleOutlined,
  ChevronRightRounded,
  DarkModeRounded,
  DescriptionOutlined,
  ExpandMoreRounded,
  FolderRounded,
  FolderOpenRounded,
  KeyboardDoubleArrowLeftRounded,
  LightModeRounded,
  RefreshRounded,
  SearchRounded,
} from "@mui/icons-material";
import {
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Button,
} from "@mui/material";

import { basename } from "../lib/markdown";
import type {
  DocumentSummary,
  ProjectDetail,
  ProjectSummary,
  SearchHit,
  WorkspaceCollection,
} from "../lib/rreadnote";
import { RMark } from "./RMark";

type ExplorerFolderNode = {
  id: string;
  name: string;
  folders: ExplorerFolderNode[];
  documents: DocumentSummary[];
};

type LibraryPanelProps = {
  workspaceRoot: string | null;
  collections: WorkspaceCollection[];
  projects: ProjectSummary[];
  activeProject: ProjectDetail | null;
  projectDocumentsByPath: Record<string, DocumentSummary[]>;
  contentSearchHits: SearchHit[];
  contentSearchBusy: boolean;
  busyMessage: string | null;
  feedback: {
    severity: "info" | "success" | "error";
    message: string;
  };
  themeMode: "dark" | "light";
  themeSwitchLabel: string;
  onCollapse: () => void;
  onToggleTheme: () => void;
  onChooseWorkspace: () => void;
  onRescan: () => void;
  onSearchQueryChange: (query: string) => void;
  onCreateProject: (title: string) => Promise<boolean>;
  onExpandProject: (projectPath: string) => Promise<DocumentSummary[] | null> | void;
  onOpenSearchHit: (hit: SearchHit) => void;
  onSelectProject: (projectPath: string) => void;
  onSelectDocument: (documentId: string, headingSlug?: string | null) => void;
  onSelectProjectDocument: (
    projectPath: string,
    documentId: string,
    headingSlug?: string | null,
  ) => void;
};

function buildGroups(collections: WorkspaceCollection[], projects: ProjectSummary[]) {
  const groups = new Map<string, { name: string; projects: ProjectSummary[] }>();

  for (const collection of collections) {
    groups.set(collection.id, { name: collection.name, projects: [] });
  }

  for (const project of projects) {
    const group = groups.get(project.collectionId);
    if (group) {
      group.projects.push(project);
      continue;
    }

    groups.set(project.collectionId, {
      name: project.collectionName,
      projects: [project],
    });
  }

  return Array.from(groups.entries())
    .map(([id, value]) => ({ id, ...value }))
    .filter((group) => group.projects.length > 0);
}

function projectIcon(project: ProjectSummary) {
  if (project.isDirectoryProject) {
    return <FolderRounded fontSize="small" />;
  }

  return <DescriptionOutlined fontSize="small" />;
}

function documentIcon() {
  return <ArticleOutlined fontSize="small" />;
}

function compareExplorerLabels(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function normalizeExplorerPath(path: string) {
  return path
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function stripFileExtension(name: string) {
  return name.replace(/\.[^.]+$/u, "");
}

function documentLabel(document: DocumentSummary) {
  const fileName = basename(document.relativePath || document.path || document.title);
  const normalizedName = stripFileExtension(fileName);
  return normalizedName || document.title;
}

function projectTrailing(project: ProjectSummary) {
  if (project.documentCount > 1) {
    return project.documentCount;
  }

  return null;
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLocaleLowerCase("zh-Hans-CN");
}

function projectMatchesSearch(
  project: ProjectSummary,
  documents: DocumentSummary[] | undefined,
  searchTerm: string,
) {
  if (!searchTerm) {
    return true;
  }

  const projectFields = [
    project.title,
    project.relativePath,
    project.collectionName,
  ];
  const documentFields =
    documents?.flatMap((document) => [
      document.title,
      document.relativePath,
      document.path,
    ]) ?? [];

  return [...projectFields, ...documentFields].some((value) =>
    value.toLocaleLowerCase("zh-Hans-CN").includes(searchTerm),
  );
}

function createExplorerFolderNode(id: string, name: string): ExplorerFolderNode {
  return {
    id,
    name,
    folders: [],
    documents: [],
  };
}

function sortExplorerFolderTree(node: ExplorerFolderNode) {
  node.folders.sort((left, right) => compareExplorerLabels(left.name, right.name));
  node.documents.sort((left, right) =>
    compareExplorerLabels(documentLabel(left), documentLabel(right)),
  );
  node.folders.forEach(sortExplorerFolderTree);
}

function buildExplorerFolderTree(
  projectPath: string,
  documents: DocumentSummary[],
) {
  const root = createExplorerFolderNode(projectPath, "");
  const foldersById = new Map<string, ExplorerFolderNode>([[projectPath, root]]);

  for (const document of documents) {
    const segments = normalizeExplorerPath(document.relativePath || document.title);
    const parentSegments = segments.length > 1 ? segments.slice(0, -1) : [];
    let currentFolder = root;
    let currentFolderId = projectPath;

    for (const segment of parentSegments) {
      currentFolderId = `${currentFolderId}/${segment}`;
      let nextFolder = foldersById.get(currentFolderId);
      if (!nextFolder) {
        nextFolder = createExplorerFolderNode(currentFolderId, segment);
        currentFolder.folders.push(nextFolder);
        foldersById.set(currentFolderId, nextFolder);
      }
      currentFolder = nextFolder;
    }

    currentFolder.documents.push(document);
  }

  sortExplorerFolderTree(root);
  return root;
}

function collectRootFolderIds(projectPath: string, documents: DocumentSummary[]) {
  const ids = new Set<string>();

  for (const document of documents) {
    const segments = normalizeExplorerPath(document.relativePath || document.title);
    if (segments.length > 1) {
      ids.add(`${projectPath}/${segments[0]}`);
    }
  }

  return ids;
}

function collectAncestorFolderIds(projectPath: string, relativePath: string) {
  const ids: string[] = [];
  const segments = normalizeExplorerPath(relativePath);
  let currentFolderId = projectPath;

  for (const segment of segments.slice(0, -1)) {
    currentFolderId = `${currentFolderId}/${segment}`;
    ids.push(currentFolderId);
  }

  return ids;
}

export function LibraryPanel({
  workspaceRoot,
  collections,
  projects,
  activeProject,
  projectDocumentsByPath,
  contentSearchHits,
  contentSearchBusy,
  busyMessage,
  feedback,
  themeMode,
  themeSwitchLabel,
  onCollapse,
  onToggleTheme,
  onChooseWorkspace,
  onRescan,
  onSearchQueryChange,
  onCreateProject,
  onExpandProject,
  onOpenSearchHit,
  onSelectProject,
  onSelectDocument,
  onSelectProjectDocument,
}: LibraryPanelProps) {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState("未命名项目");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProjectPaths, setExpandedProjectPaths] = useState<Set<string>>(new Set());
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(new Set());
  const groups = buildGroups(collections, projects);
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchTerm(searchQuery),
    [searchQuery],
  );
  const activeDocumentId = activeProject?.activeDocument.summary.id ?? null;
  const showCollectionHeader = groups.length > 1;
  const statusMessage =
    feedback.severity === "error"
      ? feedback.message
      : busyMessage === "扫描内容目录…" || busyMessage === "新建项目…"
        ? busyMessage
        : null;
  const visibleGroups = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        projects: group.projects.filter((project) =>
          projectMatchesSearch(
            project,
            projectDocumentsByPath[project.path],
            normalizedSearchQuery,
          ),
        ),
      }))
      .filter((group) => group.projects.length > 0);
  }, [groups, normalizedSearchQuery, projectDocumentsByPath]);
  const groupedSearchHits = useMemo(() => {
    const grouped = new Map<string, { projectTitle: string; hits: SearchHit[] }>();

    for (const hit of contentSearchHits) {
      const current = grouped.get(hit.projectPath);
      if (current) {
        current.hits.push(hit);
        continue;
      }

      grouped.set(hit.projectPath, {
        projectTitle: hit.projectTitle,
        hits: [hit],
      });
    }

    return Array.from(grouped.entries()).map(([projectPath, value]) => ({
      projectPath,
      projectTitle: value.projectTitle,
      hits: value.hits,
    }));
  }, [contentSearchHits]);

  async function handleCreateProject() {
    const ok = await onCreateProject(projectTitleDraft.trim());
    if (ok) {
      setCreateProjectOpen(false);
      setProjectTitleDraft("未命名项目");
    }
  }

  useEffect(() => {
    if (!activeProject) {
      return;
    }

    if (activeProject.documents.length > 1) {
      setExpandedProjectPaths((previous) => {
        if (previous.has(activeProject.project.path)) {
          return previous;
        }

        const next = new Set(previous);
        next.add(activeProject.project.path);
        return next;
      });
    }
  }, [activeProject]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onSearchQueryChange(searchQuery);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [onSearchQueryChange, searchQuery]);

  useEffect(() => {
    if (!activeProject) {
      return;
    }

    const folderIds = collectAncestorFolderIds(
      activeProject.project.path,
      activeProject.activeDocument.summary.relativePath,
    );

    if (folderIds.length === 0) {
      return;
    }

    setExpandedFolderPaths((previous) => {
      let changed = false;
      const next = new Set(previous);

      for (const folderId of folderIds) {
        if (!next.has(folderId)) {
          next.add(folderId);
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [activeProject]);

  async function handleProjectToggle(event: MouseEvent<HTMLButtonElement>, project: ProjectSummary) {
    event.stopPropagation();

    if (expandedProjectPaths.has(project.path)) {
      setExpandedProjectPaths((previous) => {
        const next = new Set(previous);
        next.delete(project.path);
        return next;
      });
      return;
    }

    const loadedDocuments = await onExpandProject(project.path);
    if (loadedDocuments === null) {
      return;
    }

    setExpandedFolderPaths((previous) => {
      const next = new Set(previous);
      for (const folderId of collectRootFolderIds(project.path, loadedDocuments ?? [])) {
        next.add(folderId);
      }
      return next;
    });

    setExpandedProjectPaths((previous) => {
      const next = new Set(previous);
      next.add(project.path);
      return next;
    });
  }

  function handleProjectSelect(project: ProjectSummary) {
    if (project.documentCount > 1) {
      setExpandedProjectPaths((previous) => {
        const next = new Set(previous);
        next.add(project.path);
        return next;
      });
    }

    onSelectProject(project.path);
  }

  function handleFolderToggle(folderId: string) {
    setExpandedFolderPaths((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function renderDocumentNode(project: ProjectSummary, isProjectActive: boolean, document: DocumentSummary) {
    const isDocumentActive = activeDocumentId === document.id;
    return (
      <button
        key={document.id}
        type="button"
        className={`explorer-item explorer-item-document ${isDocumentActive ? "explorer-item-active" : ""}`}
        onClick={() =>
          isProjectActive
            ? onSelectDocument(document.id)
            : onSelectProjectDocument(project.path, document.id)
        }
      >
        <span className="explorer-leading explorer-leading-document">
          <span
            className="explorer-node-icon explorer-node-icon-document"
            aria-hidden="true"
          >
            {documentIcon()}
          </span>
        </span>

        <span className="explorer-copy">
          <span className="explorer-title explorer-title-document">
            {documentLabel(document)}
          </span>
        </span>

        <span className="explorer-trailing explorer-trailing-document">
          <DescriptionOutlined fontSize="small" />
        </span>
      </button>
    );
  }

  function renderFolderNodes(
    project: ProjectSummary,
    isProjectActive: boolean,
    folders: ExplorerFolderNode[],
    documents: DocumentSummary[],
  ) {
    return (
      <>
        {folders.map((folder) => {
          const isExpanded = expandedFolderPaths.has(folder.id);
          return (
            <div
              key={folder.id}
              className={`explorer-node explorer-node-folder ${isExpanded ? "explorer-node-folder-open" : ""}`}
            >
              <button
                type="button"
                className={`explorer-item explorer-item-folder ${isExpanded ? "explorer-item-folder-open" : ""}`}
                onClick={() => handleFolderToggle(folder.id)}
                aria-expanded={isExpanded}
              >
                <span className="explorer-leading">
                  <span className="explorer-folder-caret" aria-hidden="true">
                    {isExpanded ? (
                      <ExpandMoreRounded className="explorer-caret" fontSize="small" />
                    ) : (
                      <ChevronRightRounded className="explorer-caret" fontSize="small" />
                    )}
                  </span>
                  <span className="explorer-node-icon" aria-hidden="true">
                    {isExpanded ? (
                      <FolderOpenRounded fontSize="small" />
                    ) : (
                      <FolderRounded fontSize="small" />
                    )}
                  </span>
                </span>

                <span className="explorer-copy">
                  <span className="explorer-title explorer-title-folder">{folder.name}</span>
                </span>
              </button>

              {isExpanded ? (
                <div className="explorer-folder-children">
                  {renderFolderNodes(project, isProjectActive, folder.folders, folder.documents)}
                </div>
              ) : null}
            </div>
          );
        })}

        {documents.map((document) => renderDocumentNode(project, isProjectActive, document))}
      </>
    );
  }

  function renderSearchHit(hit: SearchHit) {
    const isProjectActive = activeProject?.project.path === hit.projectPath;
    const isActive =
      isProjectActive && activeDocumentId === hit.documentId;

    return (
      <button
        key={`${hit.projectPath}:${hit.documentId}:${hit.line}:${hit.preview}`}
        type="button"
        className={`explorer-item explorer-item-document explorer-item-search-hit ${isActive ? "explorer-item-active" : ""}`}
        onClick={() => onOpenSearchHit(hit)}
      >
        <span className="explorer-leading explorer-leading-document">
          <span
            className="explorer-node-icon explorer-node-icon-document"
            aria-hidden="true"
          >
            {documentIcon()}
          </span>
        </span>

        <span className="explorer-copy">
          <span className="explorer-title explorer-title-document">
            {hit.documentTitle}
          </span>
          <span className="explorer-search-snippet">{hit.preview}</span>
          <span className="explorer-search-meta">
            {hit.documentRelativePath} · L{hit.line}
            {hit.headingTitle ? ` · ${hit.headingTitle}` : ""}
          </span>
        </span>
      </button>
    );
  }

  return (
    <>
      <Card className="panel-card panel-column library-panel">
        <CardContent
          className="panel-content library-content library-content-tree"
        >
          <div className="panel-heading panel-heading-library">
            <div className="panel-heading-copy">
              <div className="panel-title-line">
                <RMark className="library-panel-mark" />
                <h2 className="sr-only">内容</h2>
              </div>
              {workspaceRoot ? (
                <div className="panel-caption">{basename(workspaceRoot)}</div>
              ) : (
                <div className="panel-caption">先选择一个目录</div>
              )}
              {statusMessage ? (
                <div className={`panel-caption panel-caption-status panel-caption-status-${busyMessage ? "info" : feedback.severity}`}>
                  {statusMessage}
                </div>
              ) : null}
            </div>

            <div className="panel-toolbar panel-toolbar-compact">
              <Tooltip title={themeSwitchLabel}>
                <span>
                  <IconButton
                    className="panel-icon-button theme-mode-button"
                    onClick={onToggleTheme}
                    size="small"
                    aria-label={themeSwitchLabel}
                  >
                    {themeMode === "dark" ? (
                      <LightModeRounded fontSize="small" />
                    ) : (
                      <DarkModeRounded fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="选择目录">
                <span>
                  <IconButton
                    className="panel-icon-button"
                    onClick={onChooseWorkspace}
                    size="small"
                  >
                    <FolderOpenRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="新建项目">
                <span>
                  <IconButton
                    className="panel-icon-button panel-icon-button-primary"
                    onClick={() => setCreateProjectOpen(true)}
                    size="small"
                    disabled={!workspaceRoot}
                  >
                    <AddRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="刷新">
                <span>
                  <IconButton
                    className="panel-icon-button"
                    onClick={onRescan}
                    size="small"
                    disabled={!workspaceRoot}
                  >
                    <RefreshRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="收起内容栏">
                <span>
                  <IconButton
                    className="panel-icon-button"
                    onClick={onCollapse}
                    size="small"
                  >
                    <KeyboardDoubleArrowLeftRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </div>
          </div>

          <label className="library-search-shell">
            <span className="library-search-icon" aria-hidden="true">
              <SearchRounded fontSize="small" />
            </span>
            <input
              className="library-search-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="检索标题、路径或正文"
              aria-label="检索标题、路径或正文"
            />
          </label>

          <div className="explorer-tree">
            {normalizedSearchQuery ? (
              <>
                <section className="explorer-section">
                  <div className="explorer-section-header">
                    <span className="explorer-section-title">正文命中</span>
                    <span className="explorer-section-count">
                      {contentSearchBusy ? "…" : contentSearchHits.length}
                    </span>
                  </div>

                  {contentSearchBusy ? (
                    <div className="panel-empty panel-empty-compact">
                      正在检索正文…
                    </div>
                  ) : groupedSearchHits.length > 0 ? (
                    <div className="explorer-list explorer-list-search">
                      {groupedSearchHits.map((group) => (
                        <section key={group.projectPath} className="explorer-search-group">
                          <div className="explorer-section-header explorer-section-header-search">
                            <span className="explorer-section-title">{group.projectTitle}</span>
                            <span className="explorer-section-count">{group.hits.length}</span>
                          </div>
                          <div className="explorer-list">
                            {group.hits.map((hit) => renderSearchHit(hit))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty panel-empty-compact">
                      没有正文命中
                    </div>
                  )}
                </section>

                {visibleGroups.length > 0 ? (
                  <section className="explorer-section">
                    <div className="explorer-section-header">
                      <span className="explorer-section-title">标题与路径</span>
                      <span className="explorer-section-count">
                        {visibleGroups.reduce((total, group) => total + group.projects.length, 0)}
                      </span>
                    </div>

                    {visibleGroups.map((group) => (
                      <div key={group.id} className="explorer-list">
                        {group.projects.map((project) => {
                          const isActive = activeProject?.project.path === project.path;
                          const canExpand = project.documentCount > 1;
                          const projectDocuments =
                            projectDocumentsByPath[project.path] ??
                            (isActive ? activeProject?.documents ?? [] : []);
                          const isExpanded =
                            expandedProjectPaths.has(project.path) &&
                            projectDocuments.length > 1;
                          const documentTree = buildExplorerFolderTree(project.path, projectDocuments);
                          return (
                            <div
                              key={project.path}
                              className={`explorer-node explorer-node-project ${isExpanded ? "explorer-node-project-open" : ""}`}
                            >
                              <div
                                className={`explorer-item explorer-item-project ${isActive ? "explorer-item-active" : ""} ${isExpanded ? "explorer-item-open" : ""}`}
                              >
                                {canExpand ? (
                                  <button
                                    type="button"
                                    className="explorer-toggle"
                                    onClick={(event) => handleProjectToggle(event, project)}
                                    aria-label={isExpanded ? "收起项目" : "展开项目"}
                                    aria-expanded={isExpanded}
                                  >
                                    {isExpanded ? (
                                      <ExpandMoreRounded className="explorer-caret" fontSize="small" />
                                    ) : (
                                      <ChevronRightRounded className="explorer-caret" fontSize="small" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="explorer-toggle-placeholder" />
                                )}

                                <button
                                  type="button"
                                  className="explorer-item-select"
                                  onClick={() => handleProjectSelect(project)}
                                >
                                  <span className="explorer-leading">
                                    <span className="explorer-node-icon" aria-hidden="true">
                                      {projectIcon(project)}
                                    </span>
                                  </span>

                                  <span className="explorer-copy">
                                    <span className="explorer-title">{project.title}</span>
                                    <span className="explorer-meta">{project.relativePath}</span>
                                  </span>
                                </button>

                                <span className="explorer-trailing">{projectTrailing(project)}</span>
                              </div>

                              {isExpanded ? (
                                <div className="explorer-children">
                                  {renderFolderNodes(
                                    project,
                                    isActive,
                                    documentTree.folders,
                                    documentTree.documents,
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </section>
                ) : null}
              </>
            ) : visibleGroups.length > 0 ? (
              visibleGroups.map((group) => (
                <section key={group.id} className="explorer-section">
                  {showCollectionHeader ? (
                    <div className="explorer-section-header">
                      <span className="explorer-section-title">{group.name}</span>
                      <span className="explorer-section-count">{group.projects.length}</span>
                    </div>
                  ) : null}

                  <div className="explorer-list">
                    {group.projects.map((project) => {
                      const isActive = activeProject?.project.path === project.path;
                      const canExpand = project.documentCount > 1;
                      const projectDocuments =
                        projectDocumentsByPath[project.path] ??
                        (isActive ? activeProject?.documents ?? [] : []);
                      const isExpanded =
                        expandedProjectPaths.has(project.path) &&
                        projectDocuments.length > 1;
                      const documentTree = buildExplorerFolderTree(project.path, projectDocuments);
                      return (
                        <div
                          key={project.path}
                          className={`explorer-node explorer-node-project ${isExpanded ? "explorer-node-project-open" : ""}`}
                        >
                          <div
                            className={`explorer-item explorer-item-project ${isActive ? "explorer-item-active" : ""} ${isExpanded ? "explorer-item-open" : ""}`}
                          >
                            {canExpand ? (
                              <button
                                type="button"
                                className="explorer-toggle"
                                onClick={(event) => handleProjectToggle(event, project)}
                                aria-label={isExpanded ? "收起项目" : "展开项目"}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? (
                                  <ExpandMoreRounded
                                    className="explorer-caret"
                                    fontSize="small"
                                  />
                                ) : (
                                  <ChevronRightRounded
                                    className="explorer-caret"
                                    fontSize="small"
                                  />
                                )}
                              </button>
                            ) : (
                              <span className="explorer-toggle-placeholder" />
                            )}

                            <button
                              type="button"
                              className="explorer-item-select"
                              onClick={() => handleProjectSelect(project)}
                            >
                              <span className="explorer-leading">
                                <span className="explorer-node-icon" aria-hidden="true">
                                  {projectIcon(project)}
                                </span>
                              </span>

                              <span className="explorer-copy">
                                <span className="explorer-title">{project.title}</span>
                                <span className="explorer-meta">
                                  {project.relativePath}
                                </span>
                              </span>
                            </button>

                            <span className="explorer-trailing">
                              {projectTrailing(project)}
                            </span>
                          </div>

                          {isExpanded ? (
                            <div className="explorer-children">
                              {renderFolderNodes(
                                project,
                                isActive,
                                documentTree.folders,
                                documentTree.documents,
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="panel-empty panel-empty-compact">
                {normalizedSearchQuery ? "没有匹配的内容项目" : "还没有内容项目"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>新建内容项目</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="标题"
            margin="dense"
            value={projectTitleDraft}
            onChange={(event) => setProjectTitleDraft(event.currentTarget.value)}
            placeholder="例如：产品想法"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateProjectOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateProject()}
            disabled={!workspaceRoot || !projectTitleDraft.trim()}
          >
            创建
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
