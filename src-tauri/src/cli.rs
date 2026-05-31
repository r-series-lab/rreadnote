use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use serde::Serialize;
use std::fs;
use std::io::{self, Read};
use std::path::PathBuf;

use crate::reader::{
    add_highlight, app_info, capabilities_report, create_project, list_highlights,
    open_document_in_project, open_project, save_document_content, save_project_state,
    scan_workspace_root, search_workspace_content, AppError, ContentKind, ContentView,
    CreateHighlightInput, CreateProjectInput, ReadingProgressInput, SaveDocumentInput,
    SaveProjectStateInput,
};

#[derive(Debug, Parser)]
#[command(
    name = "rreadnote",
    about = "Local-first Markdown reading notes for Chinese users",
    disable_help_flag = true,
    disable_version_flag = true
)]
struct Cli {
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Info,
    Capabilities,
    ScanWorkspace {
        #[arg(long)]
        root: PathBuf,
    },
    SearchWorkspace {
        #[arg(long)]
        root: PathBuf,
        #[arg(long)]
        query: String,
        #[arg(long)]
        limit: Option<usize>,
    },
    OpenProject {
        #[arg(long)]
        path: PathBuf,
    },
    CreateProject {
        #[arg(long)]
        root: PathBuf,
        #[arg(long, value_enum)]
        kind: KindArg,
        #[arg(long)]
        title: String,
    },
    OpenDocument {
        #[arg(long)]
        project: PathBuf,
        #[arg(long)]
        document_id: String,
    },
    SaveDocument {
        #[arg(long)]
        project: PathBuf,
        #[arg(long)]
        document_id: String,
        #[arg(long)]
        content: Option<String>,
        #[arg(long)]
        content_file: Option<PathBuf>,
        #[arg(long)]
        stdin: bool,
    },
    SaveState {
        #[arg(long)]
        project: PathBuf,
        #[arg(long)]
        active_document_id: Option<String>,
        #[arg(long, value_enum)]
        active_view: Option<ViewArg>,
        #[arg(long)]
        progress_percent: Option<f32>,
        #[arg(long)]
        anchor_id: Option<String>,
        #[arg(long)]
        heading_slug: Option<String>,
        #[arg(long)]
        heading_title: Option<String>,
        #[arg(long)]
        line: Option<usize>,
    },
    ListHighlights {
        #[arg(long)]
        project: PathBuf,
    },
    AddHighlight {
        #[arg(long)]
        project: PathBuf,
        #[arg(long)]
        document_id: String,
        #[arg(long)]
        anchor_id: Option<String>,
        #[arg(long)]
        quote: Option<String>,
        #[arg(long)]
        quote_file: Option<PathBuf>,
        #[arg(long)]
        note: Option<String>,
        #[arg(long)]
        stdin: bool,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum ViewArg {
    Reader,
    Editor,
    Split,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum KindArg {
    Book,
    Note,
}

impl From<ViewArg> for ContentView {
    fn from(value: ViewArg) -> Self {
        match value {
            ViewArg::Reader => ContentView::Reader,
            ViewArg::Editor => ContentView::Editor,
            ViewArg::Split => ContentView::Split,
        }
    }
}

impl From<KindArg> for ContentKind {
    fn from(value: KindArg) -> Self {
        match value {
            KindArg::Book => ContentKind::Book,
            KindArg::Note => ContentKind::Note,
        }
    }
}

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    ok: bool,
    command: String,
    data: T,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    ok: bool,
    error: ErrorPayload,
}

#[derive(Debug, Serialize)]
struct ErrorPayload {
    code: String,
    message: String,
}

pub fn should_run_cli(args: &[String]) -> bool {
    args.iter().skip(1).any(|arg| !arg.starts_with("-psn_"))
}

pub fn run(args: Vec<String>) -> i32 {
    let normalized_args = normalize_args(args);
    let wants_json = normalized_args.iter().any(|arg| arg == "--json");

    if is_help_request(&normalized_args) {
        return print_help(wants_json);
    }

    if is_version_request(&normalized_args) {
        return print_version(wants_json);
    }

    let cli = match Cli::try_parse_from(&normalized_args) {
        Ok(cli) => cli,
        Err(error) => {
            let app_error = AppError::invalid(error.to_string());
            print_error(&app_error, wants_json);
            return app_error.exit_code;
        }
    };

    match handle_command(cli) {
        Ok(exit_code) => exit_code,
        Err(error) => {
            print_error(&error, wants_json);
            error.exit_code
        }
    }
}

fn handle_command(cli: Cli) -> Result<i32, AppError> {
    match cli.command {
        Commands::Info => {
            print_success("info", &app_info()?, cli.json)?;
        }
        Commands::Capabilities => {
            print_success("capabilities", &capabilities_report()?, cli.json)?;
        }
        Commands::ScanWorkspace { root } => {
            print_success("scan-workspace", &scan_workspace_root(root)?, cli.json)?;
        }
        Commands::SearchWorkspace { root, query, limit } => {
            print_success(
                "search-workspace",
                &search_workspace_content(root, query, limit)?,
                cli.json,
            )?;
        }
        Commands::OpenProject { path } => {
            print_success("open-project", &open_project(path)?, cli.json)?;
        }
        Commands::CreateProject { root, kind, title } => {
            print_success(
                "create-project",
                &create_project(CreateProjectInput {
                    workspace_root: root.to_string_lossy().to_string(),
                    title,
                    kind: kind.into(),
                })?,
                cli.json,
            )?;
        }
        Commands::OpenDocument {
            project,
            document_id,
        } => {
            print_success(
                "open-document",
                &open_document_in_project(project, &document_id)?,
                cli.json,
            )?;
        }
        Commands::SaveDocument {
            project,
            document_id,
            content,
            content_file,
            stdin,
        } => {
            let next_content =
                resolve_text_input(content, content_file, stdin, "content", "content-file")?;
            print_success(
                "save-document",
                &save_document_content(SaveDocumentInput {
                    project_path: project.to_string_lossy().to_string(),
                    document_id,
                    content: next_content,
                })?,
                cli.json,
            )?;
        }
        Commands::SaveState {
            project,
            active_document_id,
            active_view,
            progress_percent,
            anchor_id,
            heading_slug,
            heading_title,
            line,
        } => {
            let progress = build_progress_input(
                progress_percent,
                anchor_id,
                heading_slug,
                heading_title,
                line,
            )?;

            print_success(
                "save-state",
                &save_project_state(SaveProjectStateInput {
                    project_path: project.to_string_lossy().to_string(),
                    active_document_id,
                    active_view: active_view.map(Into::into),
                    progress,
                })?,
                cli.json,
            )?;
        }
        Commands::ListHighlights { project } => {
            print_success("list-highlights", &list_highlights(project)?, cli.json)?;
        }
        Commands::AddHighlight {
            project,
            document_id,
            anchor_id,
            quote,
            quote_file,
            note,
            stdin,
        } => {
            let quote = resolve_text_input(quote, quote_file, stdin, "quote", "quote-file")?;
            print_success(
                "add-highlight",
                &add_highlight(CreateHighlightInput {
                    project_path: project.to_string_lossy().to_string(),
                    document_id,
                    anchor_id,
                    quote,
                    note,
                })?,
                cli.json,
            )?;
        }
    }

    Ok(0)
}

fn normalize_args(args: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::with_capacity(args.len().max(1));
    let program = args
        .first()
        .cloned()
        .unwrap_or_else(|| "rreadnote".to_string());
    normalized.push(program);
    normalized.extend(
        args.into_iter()
            .skip(1)
            .filter(|arg| !arg.starts_with("-psn_")),
    );
    normalized
}

fn is_help_request(args: &[String]) -> bool {
    args.iter()
        .skip(1)
        .any(|arg| matches!(arg.as_str(), "help" | "--help" | "-h"))
}

fn is_version_request(args: &[String]) -> bool {
    args.iter()
        .skip(1)
        .any(|arg| matches!(arg.as_str(), "version" | "--version" | "-V"))
}

fn print_help(as_json: bool) -> i32 {
    let mut command = Cli::command();
    let help = command.render_long_help().to_string();

    if as_json {
        let payload = serde_json::json!({
            "text": help,
        });
        if print_success("help", &payload, true).is_err() {
            return 1;
        }
        return 0;
    }

    println!("{help}");
    0
}

fn print_version(as_json: bool) -> i32 {
    let version = serde_json::json!({
        "app": "rReadNote",
        "binary": "rreadnote",
        "version": env!("CARGO_PKG_VERSION"),
    });

    if as_json {
        if print_success("version", &version, true).is_err() {
            return 1;
        }
        return 0;
    }

    println!("rReadNote {}", env!("CARGO_PKG_VERSION"));
    0
}

fn resolve_text_input(
    inline_text: Option<String>,
    file_path: Option<PathBuf>,
    stdin: bool,
    field_name: &str,
    file_flag_name: &str,
) -> Result<String, AppError> {
    let source_count =
        usize::from(stdin) + usize::from(inline_text.is_some()) + usize::from(file_path.is_some());

    if source_count > 1 {
        return Err(AppError::invalid(format!(
            "choose exactly one input source: --{field_name}, --{file_flag_name}, or --stdin"
        )));
    }

    if stdin {
        let mut buffer = String::new();
        io::stdin()
            .read_to_string(&mut buffer)
            .map_err(|error| AppError::internal(format!("unable to read stdin: {error}")))?;
        return Ok(buffer);
    }

    if let Some(path) = file_path {
        return fs::read_to_string(&path).map_err(|error| match error.kind() {
            io::ErrorKind::NotFound => {
                AppError::missing(format!("{file_flag_name} not found: {}", path.display()))
            }
            _ => AppError::internal(format!(
                "unable to read --{file_flag_name} from {}: {error}",
                path.display()
            )),
        });
    }

    inline_text.ok_or_else(|| {
        AppError::invalid(format!(
            "--{field_name}, --{file_flag_name}, or --stdin is required"
        ))
    })
}

fn build_progress_input(
    progress_percent: Option<f32>,
    anchor_id: Option<String>,
    heading_slug: Option<String>,
    heading_title: Option<String>,
    line: Option<usize>,
) -> Result<Option<ReadingProgressInput>, AppError> {
    if progress_percent.is_none()
        && anchor_id.is_none()
        && heading_slug.is_none()
        && heading_title.is_none()
        && line.is_none()
    {
        return Ok(None);
    }

    let percent = progress_percent.ok_or_else(|| {
        AppError::invalid(
            "--progress-percent is required when any progress anchor fields are provided",
        )
    })?;

    Ok(Some(ReadingProgressInput {
        percent,
        anchor_id,
        heading_slug,
        heading_title,
        line,
    }))
}

fn print_success<T: Serialize>(command: &str, data: &T, as_json: bool) -> Result<(), AppError> {
    if as_json {
        let payload = SuccessResponse {
            ok: true,
            command: command.to_string(),
            data,
        };
        let serialized = serde_json::to_string(&payload)
            .map_err(|error| AppError::internal(format!("unable to encode JSON: {error}")))?;
        println!("{serialized}");
        return Ok(());
    }

    let pretty = serde_json::to_string_pretty(data)
        .map_err(|error| AppError::internal(format!("unable to encode output: {error}")))?;
    println!("{pretty}");
    Ok(())
}

fn print_error(error: &AppError, as_json: bool) {
    if as_json {
        let payload = ErrorResponse {
            ok: false,
            error: ErrorPayload {
                code: error.code.to_string(),
                message: error.message.clone(),
            },
        };

        match serde_json::to_string(&payload) {
            Ok(serialized) => println!("{serialized}"),
            Err(_) => println!(
                r#"{{"ok":false,"error":{{"code":"internal_error","message":"unable to encode error JSON"}}}}"#
            ),
        }
        return;
    }

    eprintln!("{}: {}", error.code, error.message);
}
