import { useState } from "react";
import {
  AddRounded,
  FolderOpenRounded,
  RefreshRounded,
} from "@mui/icons-material";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";

import { basename } from "../lib/markdown";
import type { ProjectDetail } from "../lib/rreadnote";
import { RMark } from "./RMark";

type FeedbackState = {
  severity: "info" | "success" | "error";
  message: string;
};

type TopBarProps = {
  activeProject: ProjectDetail | null;
  workspaceRoot: string | null;
  projectCount: number;
  busyMessage: string | null;
  feedback: FeedbackState;
  onChooseWorkspace: () => void;
  onRescan: () => void;
  onCreateProject: (title: string) => Promise<boolean>;
};

function statusClassName(severity: FeedbackState["severity"]) {
  return `status-pill status-pill-${severity}`;
}

export function TopBar({
  activeProject,
  workspaceRoot,
  projectCount,
  busyMessage,
  feedback,
  onChooseWorkspace,
  onRescan,
  onCreateProject,
}: TopBarProps) {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState("未命名项目");
  const documentCount = activeProject?.documents.length ?? 0;
  const contextPrimary =
    activeProject?.project.title ??
    (workspaceRoot ? basename(workspaceRoot) : "未选择目录");
  const contextSecondary = activeProject
    ? documentCount > 1
      ? `${documentCount} 个文档`
      : "单文档内容"
    : workspaceRoot
      ? `${projectCount} 个内容`
      : "本地内容台";
  const statusMessage =
    busyMessage ?? (feedback.severity === "error" ? feedback.message : null);

  async function handleCreateProject() {
    const ok = await onCreateProject(projectTitleDraft.trim());
    if (ok) {
      setCreateProjectOpen(false);
      setProjectTitleDraft("未命名项目");
    }
  }

  return (
    <>
      <Card className="topbar-card">
        <CardContent className="topbar-content">
          <div className="topbar-brand">
            <RMark />
            <div className="brand-copy">
              <div className="brand-title">rReadNote</div>
              <div className="brand-subtitle">本地内容台</div>
            </div>
          </div>

          <div className="topbar-summary">
            <div className="topbar-context-primary">{contextPrimary}</div>
            <div className="topbar-context-secondary">{contextSecondary}</div>
          </div>

          <div className="topbar-commandbar">
            <div className="topbar-actions">
              {statusMessage ? (
                <div className={statusClassName(busyMessage ? "info" : feedback.severity)}>
                  {statusMessage}
                </div>
              ) : null}

              <Button
                className="command-button"
                variant="outlined"
                startIcon={<FolderOpenRounded />}
                onClick={onChooseWorkspace}
              >
                选择目录
              </Button>
              <Button
                className="command-button command-button-primary"
                variant="contained"
                startIcon={<AddRounded />}
                onClick={() => setCreateProjectOpen(true)}
                disabled={!workspaceRoot}
              >
                新建项目
              </Button>
              <Button
                className="command-button"
                variant="outlined"
                startIcon={<RefreshRounded />}
                onClick={onRescan}
                disabled={!workspaceRoot}
              >
                刷新
              </Button>
            </div>
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
