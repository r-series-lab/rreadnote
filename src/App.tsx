import { useEffect, useMemo, useState } from "react";
import {
  KeyboardDoubleArrowRightRounded,
} from "@mui/icons-material";
import { CssBaseline, ThemeProvider } from "@mui/material";

import { LibraryPanel } from "./components/LibraryPanel";
import { WorkspacePane } from "./components/ReaderPane";
import { useReadNoteWorkspace } from "./hooks/use-read-note-workspace";
import { createAppTheme, type AppThemeMode } from "./lib/theme";
import "./App.css";

const THEME_STORAGE_KEY = "rreadnote:theme-mode";

function AppAtmosphere() {
  return (
    <svg
      className="app-atmosphere"
      viewBox="0 0 1200 760"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="atmosphereGlow" cx="50%" cy="18%" r="58%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="58%" stopColor="currentColor" stopOpacity="0.035" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="atmosphereLine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.04" />
          <stop offset="52%" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <ellipse cx="610" cy="126" rx="376" ry="118" fill="url(#atmosphereGlow)" />
      <path
        d="M122 650C282 512 338 276 530 228c152-38 238 72 372 38 92-24 130-96 176-172"
        fill="none"
        stroke="url(#atmosphereLine)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M42 392c116-96 210-112 314-70 128 52 184 174 342 164 128-8 192-100 318-80 56 9 102 38 142 74"
        fill="none"
        stroke="currentColor"
        strokeDasharray="3 18"
        strokeLinecap="round"
        strokeOpacity="0.06"
        strokeWidth="1.2"
      />
      <g fill="currentColor" opacity="0.12">
        <circle cx="248" cy="178" r="2.4" />
        <circle cx="944" cy="208" r="2" />
        <circle cx="796" cy="548" r="1.8" />
        <circle cx="412" cy="582" r="1.4" />
      </g>
    </svg>
  );
}

function readInitialThemeMode(): AppThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export default function App() {
  const workspace = useReadNoteWorkspace();
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [readerFocusMode, setReaderFocusMode] = useState(false);
  const [readerFlowMode, setReaderFlowMode] = useState<"paged" | "scroll">("scroll");
  const [themeMode, setThemeMode] = useState<AppThemeMode>(readInitialThemeMode);
  const theme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  useEffect(() => {
    const syncViewport = () => {
      if (window.innerWidth < 1120) {
        setLibraryCollapsed(true);
      }
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const showLibraryPanel = !readerFocusMode && !libraryCollapsed;
  const workspaceGridClassName = useMemo(() => {
    const classes = ["workspace-grid", "workspace-grid-compact"];

    if (!showLibraryPanel) {
      classes.push("workspace-grid-only-main");
    }

    if (readerFocusMode) {
      classes.push("workspace-grid-focus");
    }

    return classes.join(" ");
  }, [readerFocusMode, showLibraryPanel]);
  const nextThemeLabel = themeMode === "dark" ? "切换到浅色风格" : "切换到暗色风格";
  const toggleThemeMode = () => {
    setThemeMode((value) => (value === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div
        className={`app-shell ${readerFocusMode ? "app-shell-focus" : ""}`}
        data-theme={themeMode}
      >
        <AppAtmosphere />
        <div className={workspaceGridClassName}>
          {showLibraryPanel ? (
            <LibraryPanel
              workspaceRoot={workspace.workspaceRoot}
              collections={workspace.collections}
              projects={workspace.projects}
              activeProject={workspace.activeProject}
              projectDocumentsByPath={workspace.projectDocumentsByPath}
              contentSearchHits={workspace.contentSearchHits}
              contentSearchBusy={workspace.contentSearchBusy}
              busyMessage={workspace.busyMessage}
              feedback={workspace.feedback}
              themeMode={themeMode}
              themeSwitchLabel={nextThemeLabel}
              onCollapse={() => setLibraryCollapsed(true)}
              onToggleTheme={toggleThemeMode}
              onChooseWorkspace={workspace.chooseWorkspace}
              onRescan={workspace.rescanWorkspace}
              onSearchQueryChange={workspace.searchWorkspaceContent}
              onCreateProject={(title) => workspace.createContentProject(title)}
              onExpandProject={workspace.ensureProjectDocuments}
              onOpenSearchHit={(hit) => void workspace.openSearchHit(hit)}
              onSelectProject={(projectPath) => void workspace.openProjectByPath(projectPath)}
              onSelectDocument={(documentId, headingSlug) =>
                void workspace.openDocumentById(documentId, headingSlug ?? null)
              }
              onSelectProjectDocument={(projectPath, documentId, headingSlug) =>
                void workspace.openProjectDocument(projectPath, documentId, headingSlug ?? null)
              }
            />
          ) : null}

          <WorkspacePane
            project={workspace.activeProject}
            activeView={workspace.activeView}
            documentDraft={workspace.documentDraft}
            documentDirty={workspace.documentDirty}
            currentProgress={workspace.currentProgress}
            contentSearchQuery={workspace.contentSearchQuery}
            contentSearchHits={workspace.contentSearchHits}
            activeSearchHit={workspace.activeSearchHit}
            requestedHeadingSlug={workspace.requestedHeadingSlug}
            busy={workspace.isBusy}
            workspaceProjects={workspace.projects}
            projectDocumentsByPath={workspace.projectDocumentsByPath}
            onProgressChange={workspace.setReaderProgress}
            onDraftChange={workspace.setDocumentDraft}
            onRequestedHeadingConsumed={workspace.clearRequestedHeading}
            onEnsureProjectDocuments={workspace.ensureProjectDocuments}
            onSelectDocument={(documentId, headingSlug) =>
              void workspace.openDocumentById(documentId, headingSlug ?? null)
            }
            onSelectProjectDocument={(projectPath, documentId, headingSlug) =>
              void workspace.openProjectDocument(projectPath, documentId, headingSlug ?? null)
            }
            onSaveDocument={() => void workspace.saveCurrentDocument()}
            onViewChange={(view) => void workspace.setActiveView(view)}
            readerFocusMode={readerFocusMode}
            readerFlowMode={readerFlowMode}
            onToggleReaderFocus={() => setReaderFocusMode((value) => !value)}
            onReaderFlowModeChange={setReaderFlowMode}
          />
        </div>

        {!readerFocusMode && libraryCollapsed ? (
          <button
            type="button"
            className="panel-reveal panel-reveal-app-left"
            onClick={() => setLibraryCollapsed(false)}
            title="展开内容栏"
            aria-label="展开内容栏"
          >
            <KeyboardDoubleArrowRightRounded fontSize="small" />
          </button>
        ) : null}
      </div>
    </ThemeProvider>
  );
}
