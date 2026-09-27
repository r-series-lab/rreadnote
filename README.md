# rReadNote

`rReadNote` 是一个中文友好的、本地优先的 Markdown 阅读与笔记工作台。它把“书”和“笔记”统一成内容项目，让用户在同一个桌面工具里完成目录扫描、阅读、编辑、分栏查看、进度保存和高亮记录。

技术栈：`Tauri 2 + Rust + React + Vite + TypeScript + Material UI`

## 功能

- 扫描本地 Markdown 内容库
- 创建 `book` 或 `note` 类型的内容项目
- 统一管理多文档 Markdown 项目
- 阅读、编辑、分栏三种视图
- 提取标题结构并支持跳转
- 保存阅读进度和当前视图
- 添加和列出高亮记录
- 搜索工作区 Markdown 内容
- CLI 与桌面端共用同一套 Rust reader core
- 所有 CLI 命令都支持 `--json`

## 核心概念

`rReadNote` 使用统一的内容项目模型：

| 概念 | 说明 |
| --- | --- |
| `project` | 一个内容项目，可以是一本书，也可以是一组笔记 |
| `document` | 项目里的单个 Markdown 文档 |
| `kind` | `book` 或 `note` |
| `defaultView` | `reader`、`editor` 或 `split` |

这样做的好处是：书和笔记都保持为普通 Markdown 文件，扫描、保存、目录、搜索、高亮和未来索引能力可以复用。

## 推荐目录结构

```text
Library/
  Books/
    Example Book/
      index.md
      chapters/
        01-intro.md
      .rreadnote/
        project.json
        state.json
        highlights.json
  Notes/
    Product Ideas/
      index.md
      pages/
        roadmap.md
      .rreadnote/
        project.json
        state.json
        highlights.json
  Inbox.md
```

建议：

- 首层目录用于分类，例如 `Books/`、`Notes/`。
- 第二层目录是具体项目。
- 项目内部推荐使用 `index.md` 作为入口。
- 单文件 Markdown 也可以被扫描为内容。
- 机器生成的状态只放在 `.rreadnote/`。

## 快速开始

```bash
npm install
npm run dev
```

打包桌面应用：

```bash
npm run build
```

检查 Rust、前端和 CLI smoke：

```bash
npm run rust-check
npm run web:build
npm run cli:smoke
```

## CLI 用法

开发期推荐使用 npm 包装命令：

```bash
npm run cli -- info --json
npm run cli -- capabilities --json
```

也可以直接调用 Cargo：

```bash
cargo run --quiet --manifest-path ./src-tauri/Cargo.toml -- info --json
```

构建后可执行文件位于 `./target/debug/rreadnote`。

### 工作区扫描

```bash
npm run cli -- scan-workspace --root /path/to/Library --json
```

搜索工作区：

```bash
npm run cli -- search-workspace --root /path/to/Library --query "keyword" --limit 20 --json
```

### 创建和打开项目

```bash
npm run cli -- create-project \
  --root /path/to/Library \
  --kind note \
  --title "Product Ideas" \
  --json
```

```bash
npm run cli -- open-project --path /path/to/Library/Notes/Product-Ideas --json
```

打开项目内文档：

```bash
npm run cli -- open-document \
  --project /path/to/Library/Notes/Product-Ideas \
  --document-id pages/roadmap.md \
  --json
```

### 保存文档

从标准输入保存：

```bash
printf 'hello\n' | npm run cli -- save-document \
  --project /path/to/Library/Notes/Product-Ideas \
  --document-id pages/roadmap.md \
  --stdin \
  --json
```

从文件保存：

```bash
npm run cli -- save-document \
  --project /path/to/Library/Notes/Product-Ideas \
  --document-id pages/roadmap.md \
  --content-file /tmp/roadmap.md \
  --json
```

### 保存阅读状态和高亮

```bash
npm run cli -- save-state \
  --project /path/to/Library/Books/Example-Book \
  --active-view split \
  --progress-percent 37.5 \
  --heading-slug intro \
  --json
```

```bash
npm run cli -- add-highlight \
  --project /path/to/Library/Books/Example-Book \
  --document-id chapters/01-intro.md \
  --quote "important sentence" \
  --note "why it matters" \
  --json
```

```bash
npm run cli -- list-highlights --project /path/to/Library/Books/Example-Book --json
```

### JSON 输出约定

成功：

```json
{
  "ok": true,
  "command": "open-project",
  "data": {}
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "missing_resource",
    "message": "project has no markdown documents"
  }
}
```

## 给 AI / 自动化工具的建议

- 先调用 `rreadnote capabilities --json` 了解命令和字段。
- 需要建立新笔记项目时使用 `create-project`。
- 需要修改正文时优先用 `save-document --stdin --json`，避免 shell 转义问题。
- 需要保存阅读状态时使用 `save-state`，不要直接编辑 `.rreadnote/state.json`。
- 只把 `.rreadnote/` 视为机器状态目录，正文仍以 Markdown 为准。
- 所有 JSON key 使用英文，错误码稳定，展示文本可能是中文。

## 存储与隐私

唯一真相源始终是本地文件系统：

- 用户内容：`*.md`
- 项目元数据：`.rreadnote/project.json`
- 阅读状态：`.rreadnote/state.json`
- 高亮记录：`.rreadnote/highlights.json`

当前版本不使用云同步，也不把正文写入黑盒数据库。

## 开发命令

```bash
npm run web:build      # 前端生产构建
npm run rust-check     # Rust 类型检查
npm run cli:smoke      # CLI 主流程 smoke
npm run size           # 查看构建缓存和产物体积
npm run clean          # 清理构建产物
npm run clean:all      # 清理构建产物和 node_modules
```

## 路线图

- `v0.1`: 内容项目、Markdown 阅读与编辑、多文档项目、目录提取、进度保存
- `v0.2`: 搜索、标签、项目创建、文档创建、最近打开、过滤
- `v0.3`: Pretext 分页阅读、真正高亮定位、更好的中文排版

## 项目结构

```text
src/               React 前端
src-tauri/         Tauri 壳、Rust CLI、reader core
scripts/           CLI smoke 脚本
```

## 许可证

MIT，见 [LICENSE](LICENSE)。

公开仓库边界、贡献约定与安全报告方式见 [PUBLIC_REPOSITORY.md](PUBLIC_REPOSITORY.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

## 界面预览与公开文档

公开截图只展示安全的空工作区；仓库内置的 `命运的回声` 是合成演示书籍，不读取个人笔记或真实内容目录。

![rReadNote 内容工作区](docs/assets/screenshots/rreadnote-library.png)

- [界面与公开演示说明](docs/interface-guide.md)
- [发布说明](RELEASE.md)
- [安全边界](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)
