mod cli;
mod reader;

use reader::{
    add_highlight as load_add_highlight, app_info as load_app_info,
    capabilities_report as load_capabilities_report, create_project as load_create_project,
    list_highlights as load_list_highlights, open_document_in_project,
    open_project as load_open_project, save_document_content,
    save_project_state as load_save_project_state, scan_workspace_root,
    search_workspace_content as load_search_workspace_content, CapabilityReport,
    CreateHighlightInput, CreateProjectInput, DocumentEnvelope, HighlightsEnvelope, ProjectDetail,
    ProjectStateEnvelope, SaveDocumentInput, SaveProjectStateInput, SearchWorkspaceResult,
    WorkspaceScanResult,
};

#[tauri::command]
fn app_info() -> Result<reader::AppInfo, String> {
    load_app_info().map_err(|error| error.message)
}

#[tauri::command]
fn capabilities() -> Result<CapabilityReport, String> {
    load_capabilities_report().map_err(|error| error.message)
}

#[tauri::command]
fn scan_workspace(root: String) -> Result<WorkspaceScanResult, String> {
    scan_workspace_root(root).map_err(|error| error.message)
}

#[tauri::command]
fn search_workspace(
    root: String,
    query: String,
    limit: Option<usize>,
) -> Result<SearchWorkspaceResult, String> {
    load_search_workspace_content(root, query, limit).map_err(|error| error.message)
}

#[tauri::command]
fn open_project(project_path: String) -> Result<ProjectDetail, String> {
    load_open_project(project_path).map_err(|error| error.message)
}

#[tauri::command]
fn open_document(project_path: String, document_id: String) -> Result<DocumentEnvelope, String> {
    open_document_in_project(project_path, &document_id).map_err(|error| error.message)
}

#[tauri::command]
fn save_document(input: SaveDocumentInput) -> Result<DocumentEnvelope, String> {
    save_document_content(input).map_err(|error| error.message)
}

#[tauri::command]
fn save_project_state(input: SaveProjectStateInput) -> Result<ProjectStateEnvelope, String> {
    load_save_project_state(input).map_err(|error| error.message)
}

#[tauri::command]
fn create_project(input: CreateProjectInput) -> Result<ProjectDetail, String> {
    load_create_project(input).map_err(|error| error.message)
}

#[tauri::command]
fn list_highlights(project_path: String) -> Result<HighlightsEnvelope, String> {
    load_list_highlights(project_path).map_err(|error| error.message)
}

#[tauri::command]
fn add_highlight(input: CreateHighlightInput) -> Result<HighlightsEnvelope, String> {
    load_add_highlight(input).map_err(|error| error.message)
}

pub fn should_run_cli(args: &[String]) -> bool {
    cli::should_run_cli(args)
}

pub fn run_cli(args: Vec<String>) -> i32 {
    cli::run(args)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            capabilities,
            scan_workspace,
            search_workspace,
            open_project,
            open_document,
            save_document,
            save_project_state,
            create_project,
            list_highlights,
            add_highlight
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
