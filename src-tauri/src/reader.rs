use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const APP_DIR_NAME: &str = ".rreadnote";
const PROJECT_FILE_NAME: &str = "project.json";
const STATE_FILE_NAME: &str = "state.json";
const HIGHLIGHTS_FILE_NAME: &str = "highlights.json";

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    pub exit_code: i32,
}

impl AppError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self {
            code: "invalid_arguments",
            message: message.into(),
            exit_code: 2,
        }
    }

    pub fn missing(message: impl Into<String>) -> Self {
        Self {
            code: "missing_resource",
            message: message.into(),
            exit_code: 3,
        }
    }

    pub fn blocked(message: impl Into<String>) -> Self {
        Self {
            code: "blocked_precondition",
            message: message.into(),
            exit_code: 4,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "internal_error",
            message: message.into(),
            exit_code: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContentKind {
    Book,
    Note,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContentView {
    Reader,
    Editor,
    Split,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentRole {
    Entry,
    Chapter,
    Page,
    Note,
    Document,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum AnchorKind {
    Heading,
    Paragraph,
    List,
    Quote,
    Code,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageDetails {
    pub project_manifest_file: String,
    pub state_file: String,
    pub highlights_file: String,
    pub strategy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoadmapStep {
    pub version: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app: String,
    pub binary: String,
    pub version: String,
    pub architecture: String,
    pub storage: StorageDetails,
    pub roadmap: Vec<RoadmapStep>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityReport {
    pub workspace_scan: bool,
    pub unified_project_model: bool,
    pub multi_document_projects: bool,
    pub markdown_editing: bool,
    pub toc_extraction: bool,
    pub project_state: bool,
    pub highlight_anchor_ready: bool,
    pub pagination_upgrade_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub percent: f32,
    pub anchor_id: Option<String>,
    pub heading_slug: Option<String>,
    pub heading_title: Option<String>,
    pub line: Option<usize>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgressInput {
    pub percent: f32,
    pub anchor_id: Option<String>,
    pub heading_slug: Option<String>,
    pub heading_title: Option<String>,
    pub line: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TocItem {
    pub depth: usize,
    pub title: String,
    pub slug: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnchor {
    pub id: String,
    pub kind: AnchorKind,
    pub line_start: usize,
    pub line_end: usize,
    pub preview: String,
    pub heading_slug: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCollection {
    pub id: String,
    pub name: String,
    pub path: String,
    pub project_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub title: String,
    pub kind: ContentKind,
    pub default_view: ContentView,
    pub path: String,
    pub relative_path: String,
    pub collection_id: String,
    pub collection_name: String,
    pub document_count: usize,
    pub entry_document_id: String,
    pub is_directory_project: bool,
    pub progress: Option<ReadingProgress>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceScanResult {
    pub root: String,
    pub collections: Vec<WorkspaceCollection>,
    pub projects: Vec<ProjectSummary>,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub project_path: String,
    pub project_title: String,
    pub document_id: String,
    pub document_title: String,
    pub document_relative_path: String,
    pub line: usize,
    pub preview: String,
    pub heading_slug: Option<String>,
    pub heading_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchWorkspaceResult {
    pub root: String,
    pub query: String,
    pub hits: Vec<SearchHit>,
    pub project_count: usize,
    pub document_count: usize,
    pub limit: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub path: String,
    pub relative_path: String,
    pub role: DocumentRole,
    pub character_count: usize,
    pub heading_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub summary: DocumentSummary,
    pub content: String,
    pub toc: Vec<TocItem>,
    pub anchors: Vec<DocumentAnchor>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MachinePaths {
    pub app_dir_path: String,
    pub manifest_path: String,
    pub state_path: String,
    pub highlights_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStatePublic {
    pub paths: MachinePaths,
    pub active_document_id: String,
    pub active_view: ContentView,
    pub last_opened_at: Option<String>,
    pub document_progress: HashMap<String, ReadingProgress>,
    pub highlight_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub project: ProjectSummary,
    pub documents: Vec<DocumentSummary>,
    pub active_document: ProjectDocument,
    pub state: ProjectStatePublic,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentEnvelope {
    pub project: ProjectSummary,
    pub document: ProjectDocument,
    pub state: ProjectStatePublic,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStateEnvelope {
    pub project: ProjectSummary,
    pub state: ProjectStatePublic,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightRecordPublic {
    pub id: String,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub quote: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightsEnvelope {
    pub project: ProjectSummary,
    pub items: Vec<HighlightRecordPublic>,
    pub state: ProjectStatePublic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentInput {
    pub project_path: String,
    pub document_id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectStateInput {
    pub project_path: String,
    pub active_document_id: Option<String>,
    pub active_view: Option<ContentView>,
    pub progress: Option<ReadingProgressInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub workspace_root: String,
    pub title: String,
    pub kind: ContentKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHighlightInput {
    pub project_path: String,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub quote: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectManifest {
    version: u8,
    title: String,
    kind: ContentKind,
    default_view: ContentView,
    entry_document: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DocumentState {
    progress: Option<ReadingProgress>,
    last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectState {
    version: u8,
    active_document: Option<String>,
    active_view: Option<ContentView>,
    last_opened_at: Option<String>,
    document_states: HashMap<String, DocumentState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HighlightRecord {
    id: String,
    document_id: String,
    anchor_id: Option<String>,
    quote: String,
    note: Option<String>,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HighlightsFile {
    version: u8,
    items: Vec<HighlightRecord>,
}

#[derive(Debug, Clone)]
struct ProjectPaths {
    root_path: PathBuf,
    app_dir_path: PathBuf,
    manifest_path: PathBuf,
    state_path: PathBuf,
    highlights_path: PathBuf,
    is_directory_project: bool,
}

#[derive(Debug, Clone)]
struct LoadedProject {
    summary: ProjectSummary,
    documents: Vec<LoadedDocument>,
    active_document_id: String,
    manifest: ProjectManifest,
    state: ProjectState,
    highlights: HighlightsFile,
    paths: ProjectPaths,
}

#[derive(Debug, Clone)]
struct LoadedDocument {
    summary: DocumentSummary,
    content: String,
    toc: Vec<TocItem>,
    anchors: Vec<DocumentAnchor>,
}

pub fn app_info() -> AppResult<AppInfo> {
    Ok(AppInfo {
        app: "rReadNote".to_string(),
        binary: "rreadnote".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        architecture: "simple-tool".to_string(),
        storage: StorageDetails {
            project_manifest_file: format!("{APP_DIR_NAME}/{PROJECT_FILE_NAME}"),
            state_file: format!("{APP_DIR_NAME}/{STATE_FILE_NAME}"),
            highlights_file: format!("{APP_DIR_NAME}/{HIGHLIGHTS_FILE_NAME}"),
            strategy: "content-projects".to_string(),
        },
        roadmap: vec![
            RoadmapStep {
                version: "v0.1".to_string(),
                summary: "统一内容项目、项目树、阅读/编辑/分栏视图、多文档 Markdown 工作区"
                    .to_string(),
            },
            RoadmapStep {
                version: "v0.2".to_string(),
                summary: "搜索、标签、项目创建、文档创建、工作区级最近打开与过滤".to_string(),
            },
            RoadmapStep {
                version: "v0.3".to_string(),
                summary: "Pretext 分页阅读、真正高亮定位、中文排版优化".to_string(),
            },
        ],
    })
}

pub fn capabilities_report() -> AppResult<CapabilityReport> {
    Ok(CapabilityReport {
        workspace_scan: true,
        unified_project_model: true,
        multi_document_projects: true,
        markdown_editing: true,
        toc_extraction: true,
        project_state: true,
        highlight_anchor_ready: true,
        pagination_upgrade_ready: true,
    })
}

pub fn scan_workspace_root(root: impl AsRef<Path>) -> AppResult<WorkspaceScanResult> {
    let root_path = canonicalize_existing_directory(root.as_ref())?;
    let mut collections = Vec::new();
    let mut projects = Vec::new();
    let mut workspace_project_count = 0usize;

    for entry in sorted_dir_entries(&root_path)? {
        let path = entry.path();

        if path.is_file() {
            if is_markdown_file(&path) {
                projects.push(load_project_summary(
                    &path,
                    Some(&root_path),
                    "workspace",
                    "工作区",
                )?);
                workspace_project_count += 1;
            }
            continue;
        }

        if !path.is_dir() || is_hidden_name(&entry.file_name().to_string_lossy()) {
            continue;
        }

        if is_project_root(&path)? {
            projects.push(load_project_summary(
                &path,
                Some(&root_path),
                "workspace",
                "工作区",
            )?);
            workspace_project_count += 1;
            continue;
        }

        let collection_name = entry.file_name().to_string_lossy().to_string();
        let collection_id = slugify_collection_name(&collection_name);
        let before_len = projects.len();

        for child in sorted_dir_entries(&path)? {
            let child_path = child.path();
            if child_path.is_file() && is_markdown_file(&child_path) {
                projects.push(load_project_summary(
                    &child_path,
                    Some(&root_path),
                    &collection_id,
                    &collection_name,
                )?);
                continue;
            }

            if child_path.is_dir() && !is_hidden_name(&child.file_name().to_string_lossy()) {
                if is_project_root(&child_path)? {
                    projects.push(load_project_summary(
                        &child_path,
                        Some(&root_path),
                        &collection_id,
                        &collection_name,
                    )?);
                }
            }
        }

        let project_count = projects.len() - before_len;
        if project_count > 0 {
            collections.push(WorkspaceCollection {
                id: collection_id,
                name: collection_name,
                path: display_path(&path),
                project_count,
            });
        }
    }

    if workspace_project_count > 0 {
        collections.insert(
            0,
            WorkspaceCollection {
                id: "workspace".to_string(),
                name: "工作区".to_string(),
                path: display_path(&root_path),
                project_count: workspace_project_count,
            },
        );
    }

    Ok(WorkspaceScanResult {
        root: display_path(&root_path),
        collections,
        projects,
        scanned_at: current_timestamp(),
    })
}

pub fn search_workspace_content(
    root: impl AsRef<Path>,
    query: impl AsRef<str>,
    limit: Option<usize>,
) -> AppResult<SearchWorkspaceResult> {
    let scan = scan_workspace_root(root.as_ref())?;
    let normalized_query = query.as_ref().trim();
    if normalized_query.is_empty() {
        return Err(AppError::invalid("search query cannot be empty"));
    }

    let normalized_query_lower = normalized_query.to_lowercase();
    let max_hits = limit.unwrap_or(80).clamp(1, 400);
    let mut hits = Vec::new();
    let mut document_count = 0usize;
    let mut truncated = false;

    for project in &scan.projects {
        let project_paths = resolve_project_paths(Path::new(&project.path))?;
        let documents = collect_project_documents(&project_paths)?;
        document_count += documents.len();

        for document in documents {
            let mut current_heading_slug: Option<String> = None;
            let mut current_heading_title: Option<String> = None;
            let mut toc_index = 0usize;

            for (line_index, line) in document.content.lines().enumerate() {
                let line_number = line_index + 1;

                while toc_index < document.toc.len() && document.toc[toc_index].line <= line_number
                {
                    current_heading_slug = Some(document.toc[toc_index].slug.clone());
                    current_heading_title = Some(document.toc[toc_index].title.clone());
                    toc_index += 1;
                }

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                if !trimmed.to_lowercase().contains(&normalized_query_lower) {
                    continue;
                }

                hits.push(SearchHit {
                    project_path: project.path.clone(),
                    project_title: project.title.clone(),
                    document_id: document.summary.id.clone(),
                    document_title: document.summary.title.clone(),
                    document_relative_path: document.summary.relative_path.clone(),
                    line: line_number,
                    preview: truncate_preview(trimmed),
                    heading_slug: current_heading_slug.clone(),
                    heading_title: current_heading_title.clone(),
                });

                if hits.len() >= max_hits {
                    truncated = true;
                    break;
                }
            }

            if truncated {
                break;
            }
        }

        if truncated {
            break;
        }
    }

    Ok(SearchWorkspaceResult {
        root: scan.root,
        query: normalized_query.to_string(),
        hits,
        project_count: scan.projects.len(),
        document_count,
        limit: max_hits,
        truncated,
    })
}

pub fn open_project(project_path: impl AsRef<Path>) -> AppResult<ProjectDetail> {
    let (collection_id, collection_name) = infer_collection_context(project_path.as_ref())?;
    open_project_with_context(project_path, &collection_id, &collection_name)
}

pub fn open_document_in_project(
    project_path: impl AsRef<Path>,
    document_id: &str,
) -> AppResult<DocumentEnvelope> {
    let (collection_id, collection_name) = infer_collection_context(project_path.as_ref())?;
    let mut loaded = load_project(
        project_path.as_ref(),
        true,
        Some(document_id),
        &collection_id,
        &collection_name,
    )?;
    touch_loaded_project(&mut loaded, Some(document_id))?;
    let document = loaded
        .documents
        .iter()
        .find(|document| document.summary.id == loaded.active_document_id)
        .cloned()
        .ok_or_else(|| AppError::missing(format!("document not found: {document_id}")))?;

    Ok(DocumentEnvelope {
        project: loaded.summary.clone(),
        document: to_project_document(&document),
        state: to_public_state(&loaded),
    })
}

pub fn save_document_content(input: SaveDocumentInput) -> AppResult<DocumentEnvelope> {
    let (collection_id, collection_name) =
        infer_collection_context(Path::new(&input.project_path))?;
    let loaded = load_project(
        Path::new(&input.project_path),
        true,
        Some(&input.document_id),
        &collection_id,
        &collection_name,
    )?;
    let document = loaded
        .documents
        .iter()
        .find(|document| document.summary.id == input.document_id)
        .ok_or_else(|| AppError::missing(format!("document not found: {}", input.document_id)))?;

    let document_path = resolve_document_path(&loaded.paths, &document.summary.id);
    write_text_file(&document_path, &input.content)?;

    let reloaded = load_project(
        &loaded.paths.root_path,
        true,
        Some(&input.document_id),
        &loaded.summary.collection_id,
        &loaded.summary.collection_name,
    )?;
    let active_document = reloaded
        .documents
        .iter()
        .find(|doc| doc.summary.id == reloaded.active_document_id)
        .cloned()
        .ok_or_else(|| AppError::missing("active document missing after save"))?;

    Ok(DocumentEnvelope {
        project: reloaded.summary.clone(),
        document: to_project_document(&active_document),
        state: to_public_state(&reloaded),
    })
}

pub fn save_project_state(input: SaveProjectStateInput) -> AppResult<ProjectStateEnvelope> {
    let (collection_id, collection_name) =
        infer_collection_context(Path::new(&input.project_path))?;
    let mut loaded = load_project(
        Path::new(&input.project_path),
        true,
        input.active_document_id.as_deref(),
        &collection_id,
        &collection_name,
    )?;

    if let Some(active_document_id) = input.active_document_id {
        ensure_document_exists(&loaded.documents, &active_document_id)?;
        loaded.active_document_id = active_document_id.clone();
        loaded.state.active_document = Some(active_document_id.clone());
        loaded
            .state
            .document_states
            .entry(active_document_id)
            .or_default()
            .last_opened_at = Some(current_timestamp());
    }

    if let Some(active_view) = input.active_view {
        loaded.state.active_view = Some(active_view);
    }

    if let Some(progress) = input.progress {
        let active_document_id = loaded.active_document_id.clone();
        loaded
            .state
            .document_states
            .entry(active_document_id)
            .or_default()
            .progress = Some(to_reading_progress(progress)?);
    }

    loaded.state.last_opened_at = Some(current_timestamp());
    write_project_state(&loaded.paths, &loaded.state)?;

    let reloaded = load_project(
        &loaded.paths.root_path,
        true,
        Some(&loaded.active_document_id),
        &collection_id,
        &collection_name,
    )?;

    Ok(ProjectStateEnvelope {
        project: reloaded.summary.clone(),
        state: to_public_state(&reloaded),
    })
}

pub fn create_project(input: CreateProjectInput) -> AppResult<ProjectDetail> {
    let workspace_root = canonicalize_existing_directory(Path::new(&input.workspace_root))?;
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::invalid("project title cannot be empty"));
    }

    let (collection_name, collection_root) = resolve_collection_root(&workspace_root, &input.kind)?;
    let project_root = resolve_unique_project_root(&collection_root, title);
    fs::create_dir_all(&project_root).map_err(|error| map_io_error(&project_root, error))?;

    let index_path = project_root.join("index.md");
    write_text_file(&index_path, &default_project_document(title, &input.kind))?;

    let paths = resolve_project_paths(&project_root)?;
    let default_view = default_view_for_kind(&input.kind);
    let manifest = ProjectManifest {
        version: 1,
        title: title.to_string(),
        kind: input.kind.clone(),
        default_view: default_view.clone(),
        entry_document: "index.md".to_string(),
    };
    let opened_at = current_timestamp();
    let mut document_states = HashMap::new();
    document_states.insert(
        "index.md".to_string(),
        DocumentState {
            progress: None,
            last_opened_at: Some(opened_at.clone()),
        },
    );
    let state = ProjectState {
        version: 1,
        active_document: Some("index.md".to_string()),
        active_view: Some(default_view),
        last_opened_at: Some(opened_at),
        document_states,
    };
    let highlights = HighlightsFile {
        version: 1,
        items: Vec::new(),
    };

    write_project_manifest(&paths, &manifest)?;
    write_project_state(&paths, &state)?;
    write_highlights(&paths, &highlights)?;

    let collection_id = slugify_collection_name(&collection_name);
    open_project_with_context(&project_root, &collection_id, &collection_name)
}

pub fn list_highlights(project_path: impl AsRef<Path>) -> AppResult<HighlightsEnvelope> {
    let (collection_id, collection_name) = infer_collection_context(project_path.as_ref())?;
    let loaded = load_project(
        project_path.as_ref(),
        true,
        None,
        &collection_id,
        &collection_name,
    )?;

    Ok(HighlightsEnvelope {
        project: loaded.summary.clone(),
        items: loaded
            .highlights
            .items
            .iter()
            .cloned()
            .map(to_public_highlight)
            .collect(),
        state: to_public_state(&loaded),
    })
}

pub fn add_highlight(input: CreateHighlightInput) -> AppResult<HighlightsEnvelope> {
    let (collection_id, collection_name) =
        infer_collection_context(Path::new(&input.project_path))?;
    let mut loaded = load_project(
        Path::new(&input.project_path),
        true,
        Some(&input.document_id),
        &collection_id,
        &collection_name,
    )?;

    ensure_document_exists(&loaded.documents, &input.document_id)?;
    if let Some(anchor_id) = input.anchor_id.as_deref() {
        ensure_anchor_exists(&loaded.documents, &input.document_id, anchor_id)?;
    }

    let quote = input.quote.trim();
    if quote.is_empty() {
        return Err(AppError::invalid("highlight quote cannot be empty"));
    }

    let note = input
        .note
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let created_at = current_timestamp();
    let record = HighlightRecord {
        id: build_highlight_id(&input.document_id, quote, &created_at),
        document_id: input.document_id.clone(),
        anchor_id: input.anchor_id.clone(),
        quote: quote.to_string(),
        note,
        created_at,
    };

    loaded.highlights.items.push(record);
    write_highlights(&loaded.paths, &loaded.highlights)?;

    let reloaded = load_project(
        &loaded.paths.root_path,
        true,
        Some(&loaded.active_document_id),
        &collection_id,
        &collection_name,
    )?;

    Ok(HighlightsEnvelope {
        project: reloaded.summary.clone(),
        items: reloaded
            .highlights
            .items
            .iter()
            .cloned()
            .map(to_public_highlight)
            .collect(),
        state: to_public_state(&reloaded),
    })
}

fn open_project_with_context(
    project_path: impl AsRef<Path>,
    collection_id: &str,
    collection_name: &str,
) -> AppResult<ProjectDetail> {
    let mut loaded = load_project(
        project_path.as_ref(),
        true,
        None,
        collection_id,
        collection_name,
    )?;
    touch_loaded_project(&mut loaded, None)?;
    Ok(build_project_detail(&loaded))
}

fn load_project_summary(
    project_path: &Path,
    workspace_root: Option<&Path>,
    collection_id: &str,
    collection_name: &str,
) -> AppResult<ProjectSummary> {
    let loaded = load_project(project_path, false, None, collection_id, collection_name)?;
    Ok(build_project_summary(
        &loaded.paths,
        &loaded.manifest,
        &loaded.state,
        &loaded.documents,
        workspace_root,
        collection_id,
        collection_name,
    ))
}

fn load_project(
    project_path: &Path,
    ensure_meta: bool,
    preferred_document_id: Option<&str>,
    collection_id: &str,
    collection_name: &str,
) -> AppResult<LoadedProject> {
    let canonical_path = canonicalize_existing_path(project_path)?;
    let paths = resolve_project_paths(&canonical_path)?;
    let documents = collect_project_documents(&paths)?;

    if documents.is_empty() {
        return Err(AppError::missing(format!(
            "project has no markdown documents: {}",
            canonical_path.display()
        )));
    }

    let inferred_kind = infer_project_kind(&canonical_path, collection_name);
    let manifest = load_or_build_manifest(&paths, &documents, inferred_kind, ensure_meta)?;
    let mut state = load_or_build_state(&paths, &documents, &manifest, ensure_meta)?;
    let highlights = load_or_build_highlights(&paths, ensure_meta)?;
    let active_document_id =
        resolve_active_document_id(preferred_document_id, &state, &manifest, &documents)?;

    state.active_document = Some(active_document_id.clone());

    let summary = build_project_summary(
        &paths,
        &manifest,
        &state,
        &documents,
        None,
        collection_id,
        collection_name,
    );

    if ensure_meta {
        write_project_manifest(&paths, &manifest)?;
        write_project_state(&paths, &state)?;
        write_highlights(&paths, &highlights)?;
    }

    Ok(LoadedProject {
        summary,
        documents,
        active_document_id,
        manifest,
        state,
        highlights,
        paths,
    })
}

fn build_project_summary(
    paths: &ProjectPaths,
    manifest: &ProjectManifest,
    state: &ProjectState,
    documents: &[LoadedDocument],
    workspace_root: Option<&Path>,
    collection_id: &str,
    collection_name: &str,
) -> ProjectSummary {
    let relative_path = workspace_root
        .and_then(|root| paths.root_path.strip_prefix(root).ok())
        .map(display_path)
        .unwrap_or_else(|| display_path(&paths.root_path));

    let progress = state
        .active_document
        .as_ref()
        .and_then(|document_id| state.document_states.get(document_id))
        .and_then(|state| state.progress.clone())
        .or_else(|| {
            state
                .document_states
                .get(&manifest.entry_document)
                .and_then(|state| state.progress.clone())
        });

    ProjectSummary {
        id: stable_id(&paths.root_path),
        title: manifest.title.clone(),
        kind: manifest.kind.clone(),
        default_view: manifest.default_view.clone(),
        path: display_path(&paths.root_path),
        relative_path,
        collection_id: collection_id.to_string(),
        collection_name: collection_name.to_string(),
        document_count: documents.len(),
        entry_document_id: manifest.entry_document.clone(),
        is_directory_project: paths.is_directory_project,
        progress,
    }
}

fn build_project_detail(loaded: &LoadedProject) -> ProjectDetail {
    let active_document = loaded
        .documents
        .iter()
        .find(|document| document.summary.id == loaded.active_document_id)
        .map(to_project_document)
        .expect("active document must exist");

    ProjectDetail {
        project: loaded.summary.clone(),
        documents: loaded
            .documents
            .iter()
            .map(|document| document.summary.clone())
            .collect(),
        active_document,
        state: to_public_state(loaded),
    }
}

fn to_project_document(document: &LoadedDocument) -> ProjectDocument {
    ProjectDocument {
        summary: document.summary.clone(),
        content: document.content.clone(),
        toc: document.toc.clone(),
        anchors: document.anchors.clone(),
    }
}

fn to_public_state(loaded: &LoadedProject) -> ProjectStatePublic {
    let document_progress = loaded
        .state
        .document_states
        .iter()
        .filter_map(|(document_id, state)| {
            state
                .progress
                .as_ref()
                .map(|progress| (document_id.clone(), progress.clone()))
        })
        .collect();

    ProjectStatePublic {
        paths: MachinePaths {
            app_dir_path: display_path(&loaded.paths.app_dir_path),
            manifest_path: display_path(&loaded.paths.manifest_path),
            state_path: display_path(&loaded.paths.state_path),
            highlights_path: display_path(&loaded.paths.highlights_path),
        },
        active_document_id: loaded.active_document_id.clone(),
        active_view: loaded
            .state
            .active_view
            .clone()
            .unwrap_or_else(|| loaded.manifest.default_view.clone()),
        last_opened_at: loaded.state.last_opened_at.clone(),
        document_progress,
        highlight_count: loaded.highlights.items.len(),
    }
}

fn touch_loaded_project(loaded: &mut LoadedProject, document_id: Option<&str>) -> AppResult<()> {
    let active_document_id = document_id
        .map(|value| value.to_string())
        .unwrap_or_else(|| loaded.active_document_id.clone());

    ensure_document_exists(&loaded.documents, &active_document_id)?;
    loaded.active_document_id = active_document_id.clone();
    loaded.state.active_document = Some(active_document_id.clone());
    loaded.state.last_opened_at = Some(current_timestamp());
    loaded
        .state
        .document_states
        .entry(active_document_id)
        .or_default()
        .last_opened_at = Some(current_timestamp());
    write_project_state(&loaded.paths, &loaded.state)
}

fn ensure_document_exists(documents: &[LoadedDocument], document_id: &str) -> AppResult<()> {
    if documents
        .iter()
        .any(|document| document.summary.id == document_id)
    {
        return Ok(());
    }

    Err(AppError::missing(format!(
        "document does not exist in project: {document_id}"
    )))
}

fn ensure_anchor_exists(
    documents: &[LoadedDocument],
    document_id: &str,
    anchor_id: &str,
) -> AppResult<()> {
    let document = documents
        .iter()
        .find(|document| document.summary.id == document_id)
        .ok_or_else(|| {
            AppError::missing(format!("document does not exist in project: {document_id}"))
        })?;

    if document.anchors.iter().any(|anchor| anchor.id == anchor_id) {
        return Ok(());
    }

    Err(AppError::missing(format!(
        "anchor does not exist in document: {anchor_id}"
    )))
}

fn resolve_active_document_id(
    preferred_document_id: Option<&str>,
    state: &ProjectState,
    manifest: &ProjectManifest,
    documents: &[LoadedDocument],
) -> AppResult<String> {
    if let Some(preferred_document_id) = preferred_document_id {
        ensure_document_exists(documents, preferred_document_id)?;
        return Ok(preferred_document_id.to_string());
    }

    if let Some(active_document_id) = state.active_document.as_ref() {
        if documents
            .iter()
            .any(|document| document.summary.id == *active_document_id)
        {
            return Ok(active_document_id.clone());
        }
    }

    if documents
        .iter()
        .any(|document| document.summary.id == manifest.entry_document)
    {
        return Ok(manifest.entry_document.clone());
    }

    documents
        .first()
        .map(|document| document.summary.id.clone())
        .ok_or_else(|| AppError::missing("project has no documents"))
}

fn resolve_project_paths(project_root: &Path) -> AppResult<ProjectPaths> {
    if project_root.is_dir() {
        let app_dir_path = project_root.join(APP_DIR_NAME);
        return Ok(ProjectPaths {
            root_path: project_root.to_path_buf(),
            app_dir_path: app_dir_path.clone(),
            manifest_path: app_dir_path.join(PROJECT_FILE_NAME),
            state_path: app_dir_path.join(STATE_FILE_NAME),
            highlights_path: app_dir_path.join(HIGHLIGHTS_FILE_NAME),
            is_directory_project: true,
        });
    }

    let file_stem = project_root
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| AppError::invalid("project file name must be valid UTF-8"))?;
    let parent = project_root
        .parent()
        .ok_or_else(|| AppError::invalid("project file must have a parent directory"))?;
    let app_dir_path = parent.join(APP_DIR_NAME).join(file_stem);

    Ok(ProjectPaths {
        root_path: project_root.to_path_buf(),
        app_dir_path: app_dir_path.clone(),
        manifest_path: app_dir_path.join(PROJECT_FILE_NAME),
        state_path: app_dir_path.join(STATE_FILE_NAME),
        highlights_path: app_dir_path.join(HIGHLIGHTS_FILE_NAME),
        is_directory_project: false,
    })
}

fn collect_project_documents(paths: &ProjectPaths) -> AppResult<Vec<LoadedDocument>> {
    if paths.is_directory_project {
        let mut documents = Vec::new();
        collect_directory_documents(&paths.root_path, &paths.root_path, &mut documents)?;
        documents.sort_by(|left, right| left.summary.id.cmp(&right.summary.id));
        return Ok(documents);
    }

    Ok(vec![load_document_from_path(
        &paths.root_path,
        &paths
            .root_path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "index.md".to_string()),
    )?])
}

fn collect_directory_documents(
    project_root: &Path,
    current_dir: &Path,
    documents: &mut Vec<LoadedDocument>,
) -> AppResult<()> {
    for entry in sorted_dir_entries(current_dir)? {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if file_name == APP_DIR_NAME || is_hidden_name(&file_name) {
                continue;
            }
            collect_directory_documents(project_root, &path, documents)?;
            continue;
        }

        if !is_markdown_file(&path) {
            continue;
        }

        let relative_path = path
            .strip_prefix(project_root)
            .map(display_path)
            .unwrap_or_else(|_| display_path(&path));
        documents.push(load_document_from_path(&path, &relative_path)?);
    }

    Ok(())
}

fn load_document_from_path(document_path: &Path, relative_path: &str) -> AppResult<LoadedDocument> {
    let content = read_text_file(document_path)?;
    let toc = extract_toc(&content);
    let anchors = extract_document_anchors(&content, &toc);
    let title = extract_title(&content, document_path);

    Ok(LoadedDocument {
        summary: DocumentSummary {
            id: relative_path.to_string(),
            title,
            path: display_path(document_path),
            relative_path: relative_path.to_string(),
            role: infer_document_role(relative_path),
            character_count: content.chars().count(),
            heading_count: toc.len(),
        },
        content,
        toc,
        anchors,
    })
}

fn infer_document_role(relative_path: &str) -> DocumentRole {
    let lower = relative_path.to_lowercase();
    if lower == "index.md" {
        return DocumentRole::Entry;
    }
    if lower.contains("/chapters/") || lower.contains("\\chapters\\") {
        return DocumentRole::Chapter;
    }
    if lower.contains("/pages/") || lower.contains("\\pages\\") {
        return DocumentRole::Page;
    }
    if lower.contains("/notes/") || lower.contains("\\notes\\") {
        return DocumentRole::Note;
    }
    DocumentRole::Document
}

fn load_or_build_manifest(
    paths: &ProjectPaths,
    documents: &[LoadedDocument],
    inferred_kind: ContentKind,
    ensure_meta: bool,
) -> AppResult<ProjectManifest> {
    let entry_document = documents
        .iter()
        .find(|document| document.summary.id == "index.md")
        .map(|document| document.summary.id.clone())
        .unwrap_or_else(|| documents[0].summary.id.clone());
    let entry_title = documents
        .iter()
        .find(|document| document.summary.id == entry_document)
        .map(|document| document.summary.title.clone())
        .unwrap_or_else(|| documents[0].summary.title.clone());
    let default_view = if inferred_kind == ContentKind::Note {
        ContentView::Editor
    } else {
        ContentView::Reader
    };

    let manifest = if paths.manifest_path.exists() {
        let content = read_text_file(&paths.manifest_path)?;
        serde_json::from_str::<ProjectManifest>(&content).map_err(|error| {
            AppError::internal(format!(
                "invalid project manifest in {}: {}",
                paths.manifest_path.display(),
                error
            ))
        })?
    } else {
        ProjectManifest {
            version: 1,
            title: entry_title,
            kind: inferred_kind.clone(),
            default_view: default_view.clone(),
            entry_document,
        }
    };

    let normalized = normalize_manifest(manifest, documents, inferred_kind, default_view);
    if ensure_meta {
        ensure_machine_dir(paths)?;
    }
    Ok(normalized)
}

fn normalize_manifest(
    mut manifest: ProjectManifest,
    documents: &[LoadedDocument],
    inferred_kind: ContentKind,
    fallback_view: ContentView,
) -> ProjectManifest {
    manifest.version = 1;
    if manifest.title.trim().is_empty() {
        manifest.title = documents[0].summary.title.clone();
    }

    if !documents
        .iter()
        .any(|document| document.summary.id == manifest.entry_document)
    {
        manifest.entry_document = documents
            .iter()
            .find(|document| document.summary.id == "index.md")
            .map(|document| document.summary.id.clone())
            .unwrap_or_else(|| documents[0].summary.id.clone());
    }

    if matches!(manifest.kind, ContentKind::Book | ContentKind::Note) == false {
        manifest.kind = inferred_kind;
    }

    match manifest.default_view {
        ContentView::Reader | ContentView::Editor | ContentView::Split => {}
    }

    if manifest.kind == ContentKind::Note && manifest.default_view == ContentView::Reader {
        manifest.default_view = ContentView::Editor;
    }

    if manifest.kind == ContentKind::Book && manifest.default_view == ContentView::Editor {
        manifest.default_view = fallback_view;
    }

    manifest
}

fn load_or_build_state(
    paths: &ProjectPaths,
    documents: &[LoadedDocument],
    manifest: &ProjectManifest,
    ensure_meta: bool,
) -> AppResult<ProjectState> {
    let mut state = if paths.state_path.exists() {
        let content = read_text_file(&paths.state_path)?;
        serde_json::from_str::<ProjectState>(&content).map_err(|error| {
            AppError::internal(format!(
                "invalid project state in {}: {}",
                paths.state_path.display(),
                error
            ))
        })?
    } else {
        ProjectState {
            version: 1,
            active_document: Some(manifest.entry_document.clone()),
            active_view: Some(manifest.default_view.clone()),
            last_opened_at: None,
            document_states: HashMap::new(),
        }
    };

    state.version = 1;
    if let Some(active_document) = state.active_document.clone() {
        if !documents
            .iter()
            .any(|document| document.summary.id == active_document)
        {
            state.active_document = Some(manifest.entry_document.clone());
        }
    } else {
        state.active_document = Some(manifest.entry_document.clone());
    }

    if state.active_view.is_none() {
        state.active_view = Some(manifest.default_view.clone());
    }

    state.document_states.retain(|document_id, _| {
        documents
            .iter()
            .any(|document| document.summary.id == *document_id)
    });

    if ensure_meta {
        ensure_machine_dir(paths)?;
    }

    Ok(state)
}

fn load_or_build_highlights(paths: &ProjectPaths, ensure_meta: bool) -> AppResult<HighlightsFile> {
    let highlights = if paths.highlights_path.exists() {
        let content = read_text_file(&paths.highlights_path)?;
        serde_json::from_str::<HighlightsFile>(&content).map_err(|error| {
            AppError::internal(format!(
                "invalid highlights file in {}: {}",
                paths.highlights_path.display(),
                error
            ))
        })?
    } else {
        HighlightsFile {
            version: 1,
            items: Vec::new(),
        }
    };

    if ensure_meta {
        ensure_machine_dir(paths)?;
    }

    Ok(highlights)
}

fn write_project_manifest(paths: &ProjectPaths, manifest: &ProjectManifest) -> AppResult<()> {
    ensure_machine_dir(paths)?;
    let serialized = serde_json::to_string_pretty(manifest).map_err(|error| {
        AppError::internal(format!("unable to serialize project manifest: {error}"))
    })?;
    write_text_file(&paths.manifest_path, &serialized)
}

fn write_project_state(paths: &ProjectPaths, state: &ProjectState) -> AppResult<()> {
    ensure_machine_dir(paths)?;
    let serialized = serde_json::to_string_pretty(state).map_err(|error| {
        AppError::internal(format!("unable to serialize project state: {error}"))
    })?;
    write_text_file(&paths.state_path, &serialized)
}

fn write_highlights(paths: &ProjectPaths, highlights: &HighlightsFile) -> AppResult<()> {
    ensure_machine_dir(paths)?;
    let serialized = serde_json::to_string_pretty(highlights)
        .map_err(|error| AppError::internal(format!("unable to serialize highlights: {error}")))?;
    write_text_file(&paths.highlights_path, &serialized)
}

fn ensure_machine_dir(paths: &ProjectPaths) -> AppResult<()> {
    fs::create_dir_all(&paths.app_dir_path)
        .map_err(|error| map_io_error(&paths.app_dir_path, error))
}

fn resolve_document_path(paths: &ProjectPaths, document_id: &str) -> PathBuf {
    if paths.is_directory_project {
        return paths.root_path.join(document_id);
    }

    paths.root_path.clone()
}

fn infer_collection_context(project_path: &Path) -> AppResult<(String, String)> {
    let canonical_path = canonicalize_existing_path(project_path)?;
    let collection_name = canonical_path
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| "工作区".to_string());

    let collection_id = if collection_name == "工作区" {
        "workspace".to_string()
    } else {
        slugify_collection_name(&collection_name)
    };

    Ok((collection_id, collection_name))
}

fn resolve_collection_root(
    workspace_root: &Path,
    kind: &ContentKind,
) -> AppResult<(String, PathBuf)> {
    let candidates = match kind {
        ContentKind::Book => ["Books", "books", "书", "书籍"].as_slice(),
        ContentKind::Note => ["Notes", "notes", "笔记"].as_slice(),
    };

    for candidate in candidates {
        let path = workspace_root.join(candidate);
        if path.exists() {
            if !path.is_dir() {
                return Err(AppError::invalid(format!(
                    "collection path is not a directory: {}",
                    path.display()
                )));
            }
            return Ok((candidate.to_string(), path));
        }
    }

    let fallback_name = match kind {
        ContentKind::Book => "Books",
        ContentKind::Note => "Notes",
    };
    let fallback_path = workspace_root.join(fallback_name);
    fs::create_dir_all(&fallback_path).map_err(|error| map_io_error(&fallback_path, error))?;
    Ok((fallback_name.to_string(), fallback_path))
}

fn resolve_unique_project_root(collection_root: &Path, title: &str) -> PathBuf {
    let base_name = slugify_project_name(title);
    let mut candidate = collection_root.join(&base_name);
    let mut index = 2usize;

    while candidate.exists() {
        candidate = collection_root.join(format!("{base_name}-{index}"));
        index += 1;
    }

    candidate
}

fn default_project_document(title: &str, kind: &ContentKind) -> String {
    match kind {
        ContentKind::Book => format!("# {title}\n\n## 导言\n\n"),
        ContentKind::Note => format!("# {title}\n\n"),
    }
}

fn default_view_for_kind(kind: &ContentKind) -> ContentView {
    match kind {
        ContentKind::Book => ContentView::Reader,
        ContentKind::Note => ContentView::Editor,
    }
}

fn infer_project_kind(project_root: &Path, collection_name: &str) -> ContentKind {
    let mut segments = vec![collection_name.to_lowercase()];
    segments.extend(
        project_root
            .components()
            .map(|component| component.as_os_str().to_string_lossy().to_lowercase()),
    );

    let mut tokens = Vec::new();
    for segment in &segments {
        tokens.extend(split_hint_tokens(segment));
    }

    if tokens
        .iter()
        .any(|token| matches!(token.as_str(), "note" | "notes" | "inbox"))
        || segments.iter().any(|segment| segment.contains("笔记"))
    {
        return ContentKind::Note;
    }

    ContentKind::Book
}

fn split_hint_tokens(value: &str) -> Vec<String> {
    value
        .split(|character: char| {
            !character.is_ascii_alphanumeric() && !matches!(character as u32, 0x3400..=0x9FFF)
        })
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn slugify_project_name(value: &str) -> String {
    let slug = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else if character.is_whitespace() || matches!(character, '-' | '_') {
                '-'
            } else if matches!(character as u32, 0x3400..=0x9FFF) {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();

    let normalized = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if normalized.is_empty() {
        "untitled-note".to_string()
    } else {
        normalized
    }
}

fn canonicalize_existing_directory(path: &Path) -> AppResult<PathBuf> {
    if !path.exists() {
        return Err(AppError::missing(format!(
            "directory does not exist: {}",
            path.display()
        )));
    }

    if !path.is_dir() {
        return Err(AppError::invalid(format!(
            "root must point to an existing directory: {}",
            path.display()
        )));
    }

    fs::canonicalize(path).map_err(|error| map_io_error(path, error))
}

fn canonicalize_existing_path(path: &Path) -> AppResult<PathBuf> {
    if !path.exists() {
        return Err(AppError::missing(format!(
            "project does not exist: {}",
            path.display()
        )));
    }

    if path.is_file() && !is_markdown_file(path) {
        return Err(AppError::invalid(format!(
            "file project must be a markdown file: {}",
            path.display()
        )));
    }

    fs::canonicalize(path).map_err(|error| map_io_error(path, error))
}

fn is_project_root(path: &Path) -> AppResult<bool> {
    if !path.is_dir() {
        return Ok(false);
    }

    if path.join(APP_DIR_NAME).join(PROJECT_FILE_NAME).exists() {
        return Ok(true);
    }

    let mut has_markdown_files = false;
    for entry in sorted_dir_entries(path)? {
        let child_path = entry.path();
        let child_name = entry.file_name().to_string_lossy().to_string();
        if child_name == "index.md" {
            return Ok(true);
        }
        if child_path.is_file() && is_markdown_file(&child_path) {
            has_markdown_files = true;
        }
    }

    Ok(has_markdown_files)
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn sorted_dir_entries(path: &Path) -> AppResult<Vec<fs::DirEntry>> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(path).map_err(|error| map_io_error(path, error))? {
        let entry = entry.map_err(|error| AppError::internal(error.to_string()))?;
        entries.push(entry);
    }
    entries.sort_by_key(|entry| entry.file_name());
    Ok(entries)
}

fn map_io_error(path: &Path, error: std::io::Error) -> AppError {
    match error.kind() {
        std::io::ErrorKind::NotFound => {
            AppError::missing(format!("resource does not exist: {}", path.display()))
        }
        std::io::ErrorKind::PermissionDenied => AppError::blocked(format!(
            "permission denied while accessing {}",
            path.display()
        )),
        _ => AppError::internal(format!("unable to access {}: {}", path.display(), error)),
    }
}

fn read_text_file(path: &Path) -> AppResult<String> {
    fs::read_to_string(path).map_err(|error| map_io_error(path, error))
}

fn write_text_file(path: &Path, content: &str) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::invalid(format!("path has no parent: {}", path.display())))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("tmp");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_path = parent.join(format!(".{file_name}.{nonce}.tmp"));

    fs::write(&temp_path, content).map_err(|error| map_io_error(&temp_path, error))?;

    match fs::rename(&temp_path, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            Err(map_io_error(path, error))
        }
    }
}

fn slugify_collection_name(value: &str) -> String {
    let slug = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else if character.is_whitespace() || matches!(character, '-' | '_') {
                '-'
            } else if matches!(character as u32, 0x3400..=0x9FFF) {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();

    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "collection".to_string()
    } else {
        trimmed.to_string()
    }
}

fn extract_title(content: &str, path: &Path) -> String {
    let mut in_code_block = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code_block = !in_code_block;
            continue;
        }

        if in_code_block || trimmed.is_empty() {
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("# ") {
            return rest.trim().trim_end_matches('#').trim().to_string();
        }

        return trimmed.trim_matches('*').trim_matches('_').to_string();
    }

    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

fn extract_toc(content: &str) -> Vec<TocItem> {
    let mut toc = Vec::new();
    let mut slug_counts: HashMap<String, usize> = HashMap::new();
    let mut in_code_block = false;

    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code_block = !in_code_block;
            continue;
        }

        if in_code_block || !trimmed.starts_with('#') {
            continue;
        }

        let depth = trimmed
            .chars()
            .take_while(|character| *character == '#')
            .count();
        if depth == 0 || depth > 6 {
            continue;
        }

        let title = trimmed[depth..]
            .trim()
            .trim_end_matches('#')
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }

        let base_slug = slugify_heading(&title);
        let count = slug_counts.entry(base_slug.clone()).or_insert(0);
        let slug = if *count == 0 {
            base_slug.clone()
        } else {
            format!("{base_slug}-{}", *count + 1)
        };
        *count += 1;

        toc.push(TocItem {
            depth,
            title,
            slug,
            line: index + 1,
        });
    }

    toc
}

fn extract_document_anchors(content: &str, toc: &[TocItem]) -> Vec<DocumentAnchor> {
    let lines: Vec<&str> = content.lines().collect();
    let mut anchors = Vec::new();
    let mut in_code_block = false;
    let mut block_lines: Vec<String> = Vec::new();
    let mut block_start = 0usize;
    let mut block_kind = AnchorKind::Paragraph;
    let mut heading_by_line = HashMap::new();

    for toc_item in toc {
        heading_by_line.insert(toc_item.line, toc_item.slug.clone());
    }

    let flush_block = |anchors: &mut Vec<DocumentAnchor>,
                       block_lines: &mut Vec<String>,
                       block_start: &mut usize,
                       block_kind: &AnchorKind| {
        if block_lines.is_empty() {
            return;
        }
        let preview = block_lines.join(" ").trim().to_string();
        let line_end = *block_start + block_lines.len() - 1;
        anchors.push(DocumentAnchor {
            id: build_anchor_id(block_kind, &preview, *block_start, line_end),
            kind: block_kind.clone(),
            line_start: *block_start,
            line_end,
            preview: truncate_preview(&preview),
            heading_slug: None,
        });
        block_lines.clear();
    };

    for (index, line) in lines.iter().enumerate() {
        let line_number = index + 1;
        let trimmed = line.trim();

        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            flush_block(
                &mut anchors,
                &mut block_lines,
                &mut block_start,
                &block_kind,
            );
            in_code_block = !in_code_block;
            anchors.push(DocumentAnchor {
                id: build_anchor_id(&AnchorKind::Code, trimmed, line_number, line_number),
                kind: AnchorKind::Code,
                line_start: line_number,
                line_end: line_number,
                preview: truncate_preview(trimmed),
                heading_slug: None,
            });
            continue;
        }

        if in_code_block {
            continue;
        }

        if trimmed.is_empty() {
            flush_block(
                &mut anchors,
                &mut block_lines,
                &mut block_start,
                &block_kind,
            );
            continue;
        }

        if trimmed.starts_with('#') {
            flush_block(
                &mut anchors,
                &mut block_lines,
                &mut block_start,
                &block_kind,
            );
            anchors.push(DocumentAnchor {
                id: heading_by_line
                    .get(&line_number)
                    .cloned()
                    .unwrap_or_else(|| {
                        build_anchor_id(&AnchorKind::Heading, trimmed, line_number, line_number)
                    }),
                kind: AnchorKind::Heading,
                line_start: line_number,
                line_end: line_number,
                preview: truncate_preview(trimmed.trim_matches('#').trim()),
                heading_slug: heading_by_line.get(&line_number).cloned(),
            });
            continue;
        }

        if block_lines.is_empty() {
            block_start = line_number;
            block_kind = infer_anchor_kind(trimmed);
        }

        if infer_anchor_kind(trimmed) != block_kind {
            flush_block(
                &mut anchors,
                &mut block_lines,
                &mut block_start,
                &block_kind,
            );
            block_start = line_number;
            block_kind = infer_anchor_kind(trimmed);
        }

        block_lines.push(trimmed.to_string());
    }

    flush_block(
        &mut anchors,
        &mut block_lines,
        &mut block_start,
        &block_kind,
    );
    anchors
}

fn infer_anchor_kind(line: &str) -> AnchorKind {
    if line.starts_with('>') {
        return AnchorKind::Quote;
    }
    if line.starts_with("- ") || line.starts_with("* ") || line.starts_with("+ ") {
        return AnchorKind::List;
    }
    AnchorKind::Paragraph
}

fn build_anchor_id(kind: &AnchorKind, preview: &str, line_start: usize, line_end: usize) -> String {
    let mut hasher = DefaultHasher::new();
    kind.hash(&mut hasher);
    preview.hash(&mut hasher);
    line_start.hash(&mut hasher);
    line_end.hash(&mut hasher);
    let digest = format!("{:08x}", hasher.finish());
    let prefix = match kind {
        AnchorKind::Heading => "h",
        AnchorKind::Paragraph => "p",
        AnchorKind::List => "l",
        AnchorKind::Quote => "q",
        AnchorKind::Code => "c",
    };
    format!("{prefix}-{digest}")
}

fn truncate_preview(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= 88 {
        return trimmed.to_string();
    }
    trimmed.chars().take(88).collect::<String>() + "…"
}

fn slugify_heading(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in value.chars() {
        let is_cjk = matches!(character as u32, 0x4E00..=0x9FFF | 0x3400..=0x4DBF);
        let normalized = if character.is_ascii_alphanumeric() {
            Some(character.to_ascii_lowercase())
        } else if is_cjk {
            Some(character)
        } else if character.is_whitespace() || matches!(character, '-' | '_' | '/' | '|' | '.') {
            Some('-')
        } else {
            None
        };

        match normalized {
            Some('-') => {
                if !last_was_dash && !slug.is_empty() {
                    slug.push('-');
                    last_was_dash = true;
                }
            }
            Some(next) => {
                slug.push(next);
                last_was_dash = false;
            }
            None => {}
        }
    }

    let cleaned = slug.trim_matches('-').to_string();
    if cleaned.is_empty() {
        "section".to_string()
    } else {
        cleaned
    }
}

fn normalize_percent(percent: f32) -> AppResult<f32> {
    if !percent.is_finite() || !(0.0..=100.0).contains(&percent) {
        return Err(AppError::invalid(
            "percent must be a finite number between 0 and 100",
        ));
    }

    Ok((percent * 100.0).round() / 100.0)
}

fn to_reading_progress(input: ReadingProgressInput) -> AppResult<ReadingProgress> {
    Ok(ReadingProgress {
        percent: normalize_percent(input.percent)?,
        anchor_id: input.anchor_id,
        heading_slug: input.heading_slug,
        heading_title: input.heading_title,
        line: input.line,
        updated_at: current_timestamp(),
    })
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn to_public_highlight(record: HighlightRecord) -> HighlightRecordPublic {
    HighlightRecordPublic {
        id: record.id,
        document_id: record.document_id,
        anchor_id: record.anchor_id,
        quote: record.quote,
        note: record.note,
        created_at: record.created_at,
    }
}

fn stable_id(path: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    display_path(path).hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn build_highlight_id(document_id: &str, quote: &str, created_at: &str) -> String {
    let mut hasher = DefaultHasher::new();
    document_id.hash(&mut hasher);
    quote.hash(&mut hasher);
    created_at.hash(&mut hasher);
    format!("hl_{:016x}", hasher.finish())
}
