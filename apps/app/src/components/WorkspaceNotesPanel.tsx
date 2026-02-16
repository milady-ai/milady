import { useWorkspaceNotesPanelController } from "./workspaceNotesPanelController";
import { WorkspaceNotesPanelView } from "./WorkspaceNotesPanelView";

import type { WorkspaceNotesPanelProps } from "./WorkspaceNotesPanelData";

export function WorkspaceNotesPanel({
  open,
  mode,
  seedText,
  mobile = false,
  onClose,
  onCreateActionFromNote,
  onCreateSkillFromNote,
}: WorkspaceNotesPanelProps) {
  const controller = useWorkspaceNotesPanelController({
    open,
    mode,
    seedText,
    onCreateActionFromNote,
    onCreateSkillFromNote,
  });

  if (!open) return null;

  return (
    <WorkspaceNotesPanelView
      mobile={mobile}
      onClose={onClose}
      controller={controller}
    />
  );
}
