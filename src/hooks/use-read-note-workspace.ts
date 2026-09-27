import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import {
  addHighlight,
  type AppInfo,
  type CapabilityReport,
  type ContentView,
  createProject,
  type DocumentEnvelope,
  type DocumentSummary,
  getAppInfo,
  getCapabilities,
  type HighlightRecord,
  listHighlights,
  openDocument,
  openProject,
  type ProjectDetail,
  type ProjectStateEnvelope,
  type ProjectSummary,
  type ReadingProgress,
  type SearchHit,
  saveDocument,
  saveProjectState,
  scanWorkspace,
  searchWorkspace,
  type WorkspaceCollection,
} from "../lib/rreadnote";
import { buildDemoBookMarkdown, DEMO_BOOK_TITLE } from "../lib/demo-book";

const ROOT_STORAGE_KEY = "rreadnote:workspace-root";
const PROJECT_STORAGE_KEY = "rreadnote:project-path";
const LEGACY_FILTER_STORAGE_KEY = "rreadnote:project-filter";

export type FeedbackState = {
  severity: "info" | "success" | "error";
  message: string;
};

function readStorage(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (value == null) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function mergeProjectSummary(projects: ProjectSummary[], nextProject: ProjectSummary) {
  return projects.map((project) => (project.path === nextProject.path ? nextProject : project));
}

function normalizeProjectSummary(
  nextProject: ProjectSummary,
  cachedProjects: ProjectSummary[],
  fallbackProject?: ProjectSummary | null,
) {
  const cachedProject =
    cachedProjects.find((project) => project.path === nextProject.path) ?? fallbackProject;

  if (!cachedProject) {
    return nextProject;
  }

  return {
    ...nextProject,
    relativePath: cachedProject.relativePath,
    collectionId: cachedProject.collectionId,
    collectionName: cachedProject.collectionName,
    kind: cachedProject.kind,
    defaultView: cachedProject.defaultView,
  };
}

function replaceDocumentSummary(documents: DocumentSummary[], nextSummary: DocumentSummary) {
  return documents.map((document) =>
    document.id === nextSummary.id ? nextSummary : document,
  );
}

function resolveDocumentProgress(project: ProjectDetail | null) {
  if (!project) {
    return null;
  }

  const documentId = project.activeDocument.summary.id;
  return project.state.documentProgress[documentId] ?? null;
}

function progressSignature(progress?: ReadingProgress | null) {
  if (!progress) {
    return "none";
  }

  return JSON.stringify({
    percent: Number(progress.percent.toFixed(2)),
    anchorId: progress.anchorId ?? null,
    headingSlug: progress.headingSlug ?? null,
    headingTitle: progress.headingTitle ?? null,
    line: progress.line ?? null,
  });
}

function hasDemoBookProject(projects: ProjectSummary[]) {
  return projects.some(
    (project) => project.kind === "book" && project.title === DEMO_BOOK_TITLE,
  );
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

function mergeDocumentEnvelope(
  previous: ProjectDetail | null,
  envelope: DocumentEnvelope,
) {
  if (!previous) {
    return previous;
  }

  return {
    ...previous,
    project: envelope.project,
    documents: replaceDocumentSummary(previous.documents, envelope.document.summary),
    activeDocument: envelope.document,
    state: envelope.state,
  };
}

function mergeStateEnvelope(
  previous: ProjectDetail | null,
  envelope: ProjectStateEnvelope,
) {
  if (!previous) {
    return previous;
  }

  return {
    ...previous,
    project: envelope.project,
    state: envelope.state,
  };
}

export function useReadNoteWorkspace() {
  const bootstrappedRef = useRef(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(
    readStorage(ROOT_STORAGE_KEY),
  );
  const [collections, setCollections] = useState<WorkspaceCollection[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectDetail | null>(null);
  const [projectDocumentsByPath, setProjectDocumentsByPath] = useState<Record<string, DocumentSummary[]>>({});
  const [documentDraft, setDocumentDraft] = useState("");
  const [readerProgress, setReaderProgress] = useState<ReadingProgress | null>(null);
  const [activeHighlights, setActiveHighlights] = useState<HighlightRecord[]>([]);
  const [requestedHeadingSlug, setRequestedHeadingSlug] = useState<string | null>(null);
  const [contentSearchQuery, setContentSearchQuery] = useState("");
  const [contentSearchHits, setContentSearchHits] = useState<SearchHit[]>([]);
  const [contentSearchBusy, setContentSearchBusy] = useState(false);
  const [activeSearchHit, setActiveSearchHit] = useState<SearchHit | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>({
    severity: "info",
    message: "选择一个本地内容目录。",
  });
  const searchRequestRef = useRef(0);

  const isBusy = busyMessage !== null;
  const activeProjectPath = activeProject?.project.path ?? null;
  const activeDocument = activeProject?.activeDocument ?? null;
  const persistedProgress = resolveDocumentProgress(activeProject);
  const currentProgress = readerProgress ?? persistedProgress;
  const currentProgressKey = progressSignature(currentProgress);
  const persistedProgressKey = progressSignature(persistedProgress);
  const documentDirty =
    activeDocument != null && documentDraft !== activeDocument.content;
  const activeView =
    activeProject?.state.activeView ?? activeProject?.project.defaultView ?? null;
  const roadmap = useMemo(() => appInfo?.roadmap ?? [], [appInfo]);

  const openProjectByPath = useCallback(async (projectPath: string, busyText: string | null = null) => {
    if (busyText) {
      setBusyMessage(busyText);
    }
    try {
      const [detail, highlightsEnvelope] = await Promise.all([
        openProject(projectPath),
        listHighlights(projectPath),
      ]);
      const normalizedProject = normalizeProjectSummary(detail.project, projects);
      const normalizedDetail = {
        ...detail,
        project: normalizedProject,
      };
      startTransition(() => {
        setActiveProject(normalizedDetail);
        setActiveHighlights(highlightsEnvelope.items);
        setProjects((previous) => mergeProjectSummary(previous, normalizedProject));
        setProjectDocumentsByPath((previous) => ({
          ...previous,
          [normalizedProject.path]: normalizedDetail.documents,
        }));
        setDocumentDraft(normalizedDetail.activeDocument.content);
        setReaderProgress(resolveDocumentProgress(normalizedDetail));
        setRequestedHeadingSlug(null);
      });
      writeStorage(PROJECT_STORAGE_KEY, normalizedProject.path);
      setFeedback({
        severity: "success",
        message: `已打开 ${normalizedProject.title}`,
      });
    } catch (error) {
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
    } finally {
      if (busyText) {
        setBusyMessage(null);
      }
    }
  }, [projects]);

  const ensureDemoBookProject = useCallback(async (root: string, projectsToCheck: ProjectSummary[]) => {
    if (hasDemoBookProject(projectsToCheck)) {
      return false;
    }

    const detail = await createProject({
      workspaceRoot: root,
      title: DEMO_BOOK_TITLE,
      kind: "book",
    });

    await saveDocument({
      projectPath: detail.project.path,
      documentId: detail.activeDocument.summary.id,
      content: buildDemoBookMarkdown(),
    });

    return true;
  }, []);

  const rescanWorkspace = useCallback(
    async (rootOverride?: string | null) => {
      const nextRoot = rootOverride ?? workspaceRoot;
      if (!nextRoot) {
        setFeedback({
          severity: "error",
          message: "请先选择内容目录。",
        });
        return;
      }

      setBusyMessage("扫描内容目录…");
      try {
        let result = await scanWorkspace(nextRoot);
        const seededDemoBook = await ensureDemoBookProject(nextRoot, result.projects);
        if (seededDemoBook) {
          result = await scanWorkspace(nextRoot);
        }
        setWorkspaceRoot(result.root);
        setCollections(result.collections);
        setProjects(result.projects);
        setProjectDocumentsByPath((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(([path]) =>
              result.projects.some((project) => project.path === path),
            ),
          ),
        );
        writeStorage(ROOT_STORAGE_KEY, result.root);

        const storedProjectPath = activeProjectPath ?? readStorage(PROJECT_STORAGE_KEY);
        const nextProjectPath =
          result.projects.find((project) => project.path === storedProjectPath)?.path ??
          result.projects[0]?.path;

        if (!nextProjectPath) {
          startTransition(() => {
            setActiveProject(null);
            setActiveHighlights([]);
            setProjectDocumentsByPath({});
            setDocumentDraft("");
            setReaderProgress(null);
            setRequestedHeadingSlug(null);
          });
          writeStorage(PROJECT_STORAGE_KEY, null);
          setFeedback({
            severity: "info",
            message: "目录已扫描，但还没有发现 Markdown 项目。",
          });
          return;
        }

        await openProjectByPath(nextProjectPath, "载入最近项目…");
      } catch (error) {
        setFeedback({
          severity: "error",
          message: normalizeError(error),
        });
      } finally {
        setBusyMessage(null);
      }
    },
    [activeProjectPath, ensureDemoBookProject, openProjectByPath, workspaceRoot],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!("__TAURI_INTERNALS__" in window)) {
        return;
      }

      try {
        const [nextInfo, nextCapabilities] = await Promise.all([
          getAppInfo(),
          getCapabilities(),
        ]);
        if (cancelled) {
          return;
        }
        setAppInfo(nextInfo);
        setCapabilities(nextCapabilities);
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            severity: "error",
            message: normalizeError(error),
          });
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeStorage(LEGACY_FILTER_STORAGE_KEY, null);
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    const storedRoot = readStorage(ROOT_STORAGE_KEY);
    if (!storedRoot) {
      return;
    }

    void rescanWorkspace(storedRoot);
  }, [rescanWorkspace]);

  const chooseWorkspace = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 rReadNote 内容目录",
    });

    const nextRoot = typeof selected === "string" ? selected : selected?.[0];
    if (!nextRoot) {
      return;
    }

    await rescanWorkspace(nextRoot);
  }, [rescanWorkspace]);

  const saveCurrentDocument = useCallback(async () => {
    if (!activeProject || !activeDocument) {
      return;
    }

    setBusyMessage("保存文档…");
    try {
      const envelope = await saveDocument({
        projectPath: activeProject.project.path,
        documentId: activeDocument.summary.id,
        content: documentDraft,
      });
      const normalizedProject = normalizeProjectSummary(
        envelope.project,
        projects,
        activeProject.project,
      );
      const normalizedEnvelope = {
        ...envelope,
        project: normalizedProject,
      };

      startTransition(() => {
        setActiveProject((previous) => mergeDocumentEnvelope(previous, normalizedEnvelope));
        setProjects((previous) => mergeProjectSummary(previous, normalizedProject));
        setProjectDocumentsByPath((previous) => ({
          ...previous,
          [normalizedProject.path]: activeProject.documents,
        }));
        setDocumentDraft(normalizedEnvelope.document.content);
      });
      setFeedback({
        severity: "success",
        message: "文档已保存到本地文件。",
      });
    } catch (error) {
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
    } finally {
      setBusyMessage(null);
    }
  }, [activeDocument, activeProject, documentDraft, projects]);

  const persistProjectState = useCallback(
    async (
      input: {
        activeDocumentId?: string | null;
        activeView?: ContentView | null;
        progress?: ReadingProgress | null;
      },
      options?: {
        busyText?: string | null;
        successMessage?: string | null;
        revertView?: ContentView | null;
        syncProgress?: boolean;
      },
    ) => {
      if (!activeProject) {
        return false;
      }

      if (options?.busyText) {
        setBusyMessage(options.busyText);
      }

      try {
        const envelope = await saveProjectState({
          projectPath: activeProject.project.path,
          activeDocumentId: input.activeDocumentId,
          activeView: input.activeView,
          progress: input.progress
            ? {
                percent: input.progress.percent,
                anchorId: input.progress.anchorId ?? null,
                headingSlug: input.progress.headingSlug ?? null,
                headingTitle: input.progress.headingTitle ?? null,
                line: input.progress.line ?? null,
              }
            : null,
        });
        const normalizedProject = normalizeProjectSummary(
          envelope.project,
          projects,
          activeProject.project,
        );
        const normalizedEnvelope = {
          ...envelope,
          project: normalizedProject,
        };

        startTransition(() => {
          setActiveProject((previous) => mergeStateEnvelope(previous, normalizedEnvelope));
          setProjects((previous) => mergeProjectSummary(previous, normalizedProject));
          if (input.progress && activeDocument && options?.syncProgress !== false) {
            setReaderProgress(
              normalizedEnvelope.state.documentProgress[activeDocument.summary.id] ??
                input.progress,
            );
          }
        });

        if (options?.successMessage) {
          setFeedback({
            severity: "success",
            message: options.successMessage,
          });
        }

        return true;
      } catch (error) {
        if (options?.revertView) {
          startTransition(() => {
            setActiveProject((previous) =>
              previous
                ? {
                    ...previous,
                    state: {
                      ...previous.state,
                      activeView: options.revertView ?? previous.state.activeView,
                    },
                  }
                : previous,
            );
          });
        }

        setFeedback({
          severity: "error",
          message: normalizeError(error),
        });
        return false;
      } finally {
        if (options?.busyText) {
          setBusyMessage(null);
        }
      }
    },
    [activeDocument, activeProject, projects],
  );

  const syncCurrentReadingState = useCallback(async () => {
    if (!activeProject || !activeDocument || !currentProgress) {
      return true;
    }

    if (currentProgressKey === persistedProgressKey) {
      return true;
    }

    return persistProjectState(
      {
        progress: currentProgress,
      },
      {
        syncProgress: false,
      },
    );
  }, [
    activeDocument,
    activeProject,
    currentProgress,
    currentProgressKey,
    persistedProgressKey,
    persistProjectState,
  ]);

  const openDocumentById = useCallback(async (documentId: string, headingSlug: string | null = null) => {
    if (!activeProject) {
      return;
    }

    if (activeProject.activeDocument.summary.id === documentId) {
      if (headingSlug) {
        setRequestedHeadingSlug(headingSlug);
      }
      return;
    }

    await syncCurrentReadingState();
    try {
      const envelope = await openDocument(activeProject.project.path, documentId);
      const normalizedProject = normalizeProjectSummary(
        envelope.project,
        projects,
        activeProject.project,
      );
      const normalizedEnvelope = {
        ...envelope,
        project: normalizedProject,
      };
      startTransition(() => {
        setActiveProject((previous) => mergeDocumentEnvelope(previous, normalizedEnvelope));
        setProjects((previous) => mergeProjectSummary(previous, normalizedProject));
        setProjectDocumentsByPath((previous) => ({
          ...previous,
          [normalizedProject.path]: activeProject.documents,
        }));
        setDocumentDraft(normalizedEnvelope.document.content);
        setReaderProgress(
          normalizedEnvelope.state.documentProgress[normalizedEnvelope.document.summary.id] ??
            null,
        );
        setRequestedHeadingSlug(headingSlug);
      });
    } catch (error) {
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
    }
  }, [activeProject, projects, syncCurrentReadingState]);

  const ensureProjectDocuments = useCallback(async (projectPath: string) => {
    if (activeProject?.project.path === projectPath) {
      if (activeProject.documents.length > 0) {
        setProjectDocumentsByPath((previous) => ({
          ...previous,
          [projectPath]: activeProject.documents,
        }));
      }

      return activeProject.documents;
    }

    const cachedDocuments = projectDocumentsByPath[projectPath];
    if (cachedDocuments?.length) {
      return cachedDocuments;
    }

    try {
      const detail = await openProject(projectPath);
      const normalizedProject = normalizeProjectSummary(detail.project, projects);
      startTransition(() => {
        setProjects((previous) => mergeProjectSummary(previous, normalizedProject));
        setProjectDocumentsByPath((previous) => ({
          ...previous,
          [normalizedProject.path]: detail.documents,
        }));
      });
      return detail.documents;
    } catch (error) {
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
      return null;
    }
  }, [activeProject, projectDocumentsByPath, projects]);

  const openProjectDocument = useCallback(async (
    projectPath: string,
    documentId: string,
    headingSlug: string | null = null,
  ) => {
    if (activeProject?.project.path === projectPath) {
      await openDocumentById(documentId, headingSlug);
      return;
    }

    await syncCurrentReadingState();

    const cachedDocuments =
      projectDocumentsByPath[projectPath] ?? (await ensureProjectDocuments(projectPath)) ?? [];

    try {
      const [envelope, highlightsEnvelope] = await Promise.all([
        openDocument(projectPath, documentId),
        listHighlights(projectPath),
      ]);
      const normalizedProject = normalizeProjectSummary(envelope.project, projects);
      const normalizedDocuments =
        cachedDocuments.length > 0 ? cachedDocuments : [envelope.document.summary];

      startTransition(() => {
        setActiveProject({
          project: normalizedProject,
          documents: normalizedDocuments,
          activeDocument: envelope.document,
          state: envelope.state,
        });
        setActiveHighlights(highlightsEnvelope.items);
        setProjects((previous) => mergeProjectSummary(previous, normalizedProject));
        setProjectDocumentsByPath((previous) => ({
          ...previous,
          [normalizedProject.path]: normalizedDocuments,
        }));
        setDocumentDraft(envelope.document.content);
        setReaderProgress(
          envelope.state.documentProgress[envelope.document.summary.id] ??
            null,
        );
        setRequestedHeadingSlug(headingSlug);
      });
      writeStorage(PROJECT_STORAGE_KEY, normalizedProject.path);
      setFeedback({
        severity: "success",
        message: `已打开 ${normalizedProject.title}`,
      });
    } catch (error) {
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
    }
  }, [
    activeProject,
    ensureProjectDocuments,
    openDocumentById,
    projectDocumentsByPath,
    projects,
    syncCurrentReadingState,
  ]);

  const saveCurrentProgress = useCallback(async () => {
    if (!activeProject || !activeDocument || !currentProgress) {
      return;
    }

    await persistProjectState(
      {
        activeDocumentId: activeDocument.summary.id,
        progress: currentProgress,
      },
      {
        busyText: "保存阅读位置…",
        successMessage: "阅读位置已写回状态文件。",
      },
    );
  }, [activeDocument, activeProject, currentProgress, persistProjectState]);

  const setActiveView = useCallback(async (nextView: ContentView) => {
    if (!activeProject || activeView === nextView) {
      return;
    }

    const previousView = activeView;
    startTransition(() => {
      setActiveProject((previous) =>
        previous
          ? {
              ...previous,
              state: {
                ...previous.state,
                activeView: nextView,
              },
            }
          : previous,
      );
    });

    await persistProjectState(
      {
        activeDocumentId: activeDocument?.summary.id ?? null,
        activeView: nextView,
        progress: currentProgress,
      },
      {
        revertView: previousView,
      },
    );
  }, [
    activeDocument?.summary.id,
    activeProject,
    activeView,
    currentProgress,
    persistProjectState,
  ]);

  useEffect(() => {
    if (!activeProject || !activeDocument) {
      return;
    }

    if (activeView === "editor" || isBusy || !currentProgress) {
      return;
    }

    if (currentProgressKey === persistedProgressKey) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistProjectState(
        {
          progress: currentProgress,
        },
        {
          syncProgress: false,
        },
      );
    }, 900);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activeDocument,
    activeProject,
    activeView,
    currentProgress,
    currentProgressKey,
    isBusy,
    persistedProgressKey,
    persistProjectState,
  ]);

  const createContentProject = useCallback(async (title: string) => {
    if (!workspaceRoot) {
      setFeedback({
        severity: "error",
        message: "请先选择内容目录。",
      });
      return false;
    }

    setBusyMessage("新建项目…");
    try {
      const detail = await createProject({
        workspaceRoot,
        title,
        kind: "note",
      });
      const result = await scanWorkspace(workspaceRoot);
      const normalizedProject = normalizeProjectSummary(
        detail.project,
        result.projects,
        detail.project,
      );
      const normalizedDetail = {
        ...detail,
        project: normalizedProject,
      };

      startTransition(() => {
        setWorkspaceRoot(result.root);
        setCollections(result.collections);
        setProjects(result.projects);
        setActiveProject(normalizedDetail);
        setActiveHighlights([]);
        setProjectDocumentsByPath({
          [normalizedProject.path]: normalizedDetail.documents,
        });
        setDocumentDraft(normalizedDetail.activeDocument.content);
        setReaderProgress(resolveDocumentProgress(normalizedDetail));
        setRequestedHeadingSlug(null);
      });
      writeStorage(ROOT_STORAGE_KEY, result.root);
      writeStorage(PROJECT_STORAGE_KEY, normalizedProject.path);
      setFeedback({
        severity: "success",
        message: `已新建项目 ${normalizedProject.title}`,
      });
      return true;
    } catch (error) {
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
      return false;
    } finally {
      setBusyMessage(null);
    }
  }, [workspaceRoot]);

  const createHighlightRecord = useCallback(async (quote: string, anchorId?: string | null) => {
    if (!activeProject || !activeDocument) {
      return false;
    }

    setBusyMessage("写入摘录…");
    try {
      const envelope = await addHighlight({
        projectPath: activeProject.project.path,
        documentId: activeDocument.summary.id,
        anchorId: anchorId ?? null,
        quote,
      });
      const normalizedProject = normalizeProjectSummary(
        envelope.project,
        projects,
        activeProject.project,
      );

      startTransition(() => {
        setActiveHighlights(envelope.items);
        setProjects((previous) => mergeProjectSummary(previous, normalizedProject));
        setActiveProject((previous) =>
          previous
            ? {
                ...previous,
                project: normalizedProject,
                state: envelope.state,
              }
            : previous,
        );
      });
      setFeedback({
        severity: "success",
        message: "摘录已写入本地。",
      });
      return true;
    } catch (error) {
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
      return false;
    } finally {
      setBusyMessage(null);
    }
  }, [activeDocument, activeProject, projects]);

  const searchWorkspaceContent = useCallback(async (query: string) => {
    const normalizedQuery = query.trim();
    setContentSearchQuery(query);

    if (!workspaceRoot || normalizedQuery.length < 2) {
      searchRequestRef.current += 1;
      setContentSearchBusy(false);
      setContentSearchHits([]);
      setActiveSearchHit(null);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setContentSearchBusy(true);

    try {
      const result = await searchWorkspace(workspaceRoot, normalizedQuery, 120);
      if (searchRequestRef.current !== requestId) {
        return;
      }
      setContentSearchHits(result.hits);
      setActiveSearchHit((previous) =>
        result.hits.find((hit) => sameSearchHit(hit, previous)) ?? previous,
      );
    } catch (error) {
      if (searchRequestRef.current !== requestId) {
        return;
      }
      setContentSearchHits([]);
      setActiveSearchHit(null);
      setFeedback({
        severity: "error",
        message: normalizeError(error),
      });
    } finally {
      if (searchRequestRef.current === requestId) {
        setContentSearchBusy(false);
      }
    }
  }, [workspaceRoot]);

  const openSearchHit = useCallback(async (hit: SearchHit) => {
    setActiveSearchHit(hit);

    if (activeProject?.project.path === hit.projectPath) {
      await openDocumentById(hit.documentId, hit.headingSlug ?? null);
      return;
    }

    await openProjectDocument(hit.projectPath, hit.documentId, hit.headingSlug ?? null);
  }, [activeProject?.project.path, openDocumentById, openProjectDocument]);

  return {
    appInfo,
    capabilities,
    roadmap,
    workspaceRoot,
    collections,
    projects,
    activeProject,
    projectDocumentsByPath,
    activeHighlights,
    activeProjectPath,
    activeDocument,
    activeView,
    currentProgress,
    contentSearchQuery,
    contentSearchHits,
    contentSearchBusy,
    activeSearchHit,
    documentDraft,
    documentDirty,
    feedback,
    busyMessage,
    isBusy,
    chooseWorkspace,
    rescanWorkspace: () => void rescanWorkspace(),
    openProjectByPath,
    ensureProjectDocuments,
    openDocumentById,
    openProjectDocument,
    saveCurrentDocument,
    saveCurrentProgress,
    createContentProject,
    createHighlightRecord,
    openSearchHit,
    searchWorkspaceContent,
    setActiveView,
    setDocumentDraft,
    setReaderProgress,
    requestHeadingJump: setRequestedHeadingSlug,
    requestedHeadingSlug,
    clearRequestedHeading: () => setRequestedHeadingSlug(null),
  };
}
