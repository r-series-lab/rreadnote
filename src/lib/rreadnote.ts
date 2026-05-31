import { invoke } from "@tauri-apps/api/core";

export type ContentKind = "book" | "note";
export type ContentView = "reader" | "editor" | "split";
export type DocumentRole = "entry" | "chapter" | "page" | "note" | "document";
export type AnchorKind = "heading" | "paragraph" | "list" | "quote" | "code";

export type StorageDetails = {
  projectManifestFile: string;
  stateFile: string;
  highlightsFile: string;
  strategy: string;
};

export type RoadmapStep = {
  version: string;
  summary: string;
};

export type AppInfo = {
  app: string;
  binary: string;
  version: string;
  architecture: string;
  storage: StorageDetails;
  roadmap: RoadmapStep[];
};

export type CapabilityReport = {
  workspaceScan: boolean;
  unifiedProjectModel: boolean;
  multiDocumentProjects: boolean;
  markdownEditing: boolean;
  tocExtraction: boolean;
  projectState: boolean;
  highlightAnchorReady: boolean;
  paginationUpgradeReady: boolean;
};

export type ReadingProgress = {
  percent: number;
  anchorId?: string | null;
  headingSlug?: string | null;
  headingTitle?: string | null;
  line?: number | null;
  updatedAt: string;
};

export type ReadingProgressInput = {
  percent: number;
  anchorId?: string | null;
  headingSlug?: string | null;
  headingTitle?: string | null;
  line?: number | null;
};

export type TocItem = {
  depth: number;
  title: string;
  slug: string;
  line: number;
};

export type DocumentAnchor = {
  id: string;
  kind: AnchorKind;
  lineStart: number;
  lineEnd: number;
  preview: string;
  headingSlug?: string | null;
};

export type WorkspaceCollection = {
  id: string;
  name: string;
  path: string;
  projectCount: number;
};

export type ProjectSummary = {
  id: string;
  title: string;
  kind: ContentKind;
  defaultView: ContentView;
  path: string;
  relativePath: string;
  collectionId: string;
  collectionName: string;
  documentCount: number;
  entryDocumentId: string;
  isDirectoryProject: boolean;
  progress?: ReadingProgress | null;
};

export type WorkspaceScanResult = {
  root: string;
  collections: WorkspaceCollection[];
  projects: ProjectSummary[];
  scannedAt: string;
};

export type SearchHit = {
  projectPath: string;
  projectTitle: string;
  documentId: string;
  documentTitle: string;
  documentRelativePath: string;
  line: number;
  preview: string;
  headingSlug?: string | null;
  headingTitle?: string | null;
};

export type SearchWorkspaceResult = {
  root: string;
  query: string;
  hits: SearchHit[];
  projectCount: number;
  documentCount: number;
  limit: number;
  truncated: boolean;
};

export type DocumentSummary = {
  id: string;
  title: string;
  path: string;
  relativePath: string;
  role: DocumentRole;
  characterCount: number;
  headingCount: number;
};

export type ProjectDocument = {
  summary: DocumentSummary;
  content: string;
  toc: TocItem[];
  anchors: DocumentAnchor[];
};

export type MachinePaths = {
  appDirPath: string;
  manifestPath: string;
  statePath: string;
  highlightsPath: string;
};

export type ProjectStatePublic = {
  paths: MachinePaths;
  activeDocumentId: string;
  activeView: ContentView;
  lastOpenedAt?: string | null;
  documentProgress: Record<string, ReadingProgress>;
  highlightCount: number;
};

export type ProjectDetail = {
  project: ProjectSummary;
  documents: DocumentSummary[];
  activeDocument: ProjectDocument;
  state: ProjectStatePublic;
};

export type DocumentEnvelope = {
  project: ProjectSummary;
  document: ProjectDocument;
  state: ProjectStatePublic;
};

export type ProjectStateEnvelope = {
  project: ProjectSummary;
  state: ProjectStatePublic;
};

export type HighlightRecord = {
  id: string;
  documentId: string;
  anchorId?: string | null;
  quote: string;
  note?: string | null;
  createdAt: string;
};

export type HighlightsEnvelope = {
  project: ProjectSummary;
  items: HighlightRecord[];
  state: ProjectStatePublic;
};

export type SaveDocumentInput = {
  projectPath: string;
  documentId: string;
  content: string;
};

export type SaveProjectStateInput = {
  projectPath: string;
  activeDocumentId?: string | null;
  activeView?: ContentView | null;
  progress?: ReadingProgressInput | null;
};

export type CreateProjectInput = {
  workspaceRoot: string;
  title: string;
  kind: ContentKind;
};

export type CreateHighlightInput = {
  projectPath: string;
  documentId: string;
  anchorId?: string | null;
  quote: string;
  note?: string | null;
};

export async function getAppInfo() {
  return invoke<AppInfo>("app_info");
}

export async function getCapabilities() {
  return invoke<CapabilityReport>("capabilities");
}

export async function scanWorkspace(root: string) {
  return invoke<WorkspaceScanResult>("scan_workspace", { root });
}

export async function searchWorkspace(root: string, query: string, limit = 80) {
  return invoke<SearchWorkspaceResult>("search_workspace", { root, query, limit });
}

export async function openProject(projectPath: string) {
  return invoke<ProjectDetail>("open_project", { projectPath });
}

export async function openDocument(projectPath: string, documentId: string) {
  return invoke<DocumentEnvelope>("open_document", { projectPath, documentId });
}

export async function saveDocument(input: SaveDocumentInput) {
  return invoke<DocumentEnvelope>("save_document", { input });
}

export async function saveProjectState(input: SaveProjectStateInput) {
  return invoke<ProjectStateEnvelope>("save_project_state", { input });
}

export async function createProject(input: CreateProjectInput) {
  return invoke<ProjectDetail>("create_project", { input });
}

export async function listHighlights(projectPath: string) {
  return invoke<HighlightsEnvelope>("list_highlights", { projectPath });
}

export async function addHighlight(input: CreateHighlightInput) {
  return invoke<HighlightsEnvelope>("add_highlight", { input });
}
