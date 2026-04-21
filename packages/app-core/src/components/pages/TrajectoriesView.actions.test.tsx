// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockGetTrajectories,
  mockDeleteTrajectories,
  mockClearAllTrajectories,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockGetTrajectories: vi.fn(),
  mockDeleteTrajectories: vi.fn(),
  mockClearAllTrajectories: vi.fn(),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getTrajectories: (...args: unknown[]) => mockGetTrajectories(...args),
    deleteTrajectories: (...args: unknown[]) => mockDeleteTrajectories(...args),
    clearAllTrajectories: (...args: unknown[]) =>
      mockClearAllTrajectories(...args),
  },
}));

vi.mock("@miladyai/ui", () => {
  const Button = ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  );

  const PagePanelRoot = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const PagePanel = Object.assign(PagePanelRoot, {
    Notice: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Loading: ({ heading }: { heading?: ReactNode }) => <div>{heading}</div>,
    Empty: ({
      title,
      description,
    }: {
      title?: ReactNode;
      description?: ReactNode;
    }) => (
      <div>
        <div>{title}</div>
        <div>{description}</div>
      </div>
    ),
  });

  const SidebarContentRoot = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const SidebarContent = Object.assign(SidebarContentRoot, {
    Toolbar: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
    ToolbarActions: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    SectionHeader: ({
      children,
      meta,
    }: {
      children?: ReactNode;
      meta?: ReactNode;
    }) => (
      <div>
        <div>{children}</div>
        <div>{meta}</div>
      </div>
    ),
    SectionLabel: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    EmptyState: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
  });

  return {
    Button,
    DropdownMenu: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onClick,
    }: {
      children?: ReactNode;
      onClick?: () => void;
    }) => <button onClick={onClick}>{children}</button>,
    DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    PageLayout: ({
      sidebar,
      children,
    }: {
      sidebar?: ReactNode;
      children?: ReactNode;
    }) => (
      <div>
        <div>{sidebar}</div>
        <div>{children}</div>
      </div>
    ),
    PagePanel,
    Sidebar: ({
      header,
      children,
    }: {
      header?: ReactNode;
      children?: ReactNode;
    }) => (
      <div>
        <div>{header}</div>
        <div>{children}</div>
      </div>
    ),
    SidebarContent,
    SidebarHeader: ({
      search,
    }: {
      search?: {
        value?: string;
        onChange?: (event: { target: { value: string } }) => void;
        placeholder?: string;
      };
    }) => (
      <input
        aria-label={search?.placeholder ?? "Search"}
        value={search?.value ?? ""}
        onChange={(event) =>
          search?.onChange?.({ target: { value: event.target.value } })
        }
      />
    ),
    SidebarPanel: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarScrollRegion: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    TrajectorySidebarItem: ({
      title,
      onSelect,
    }: {
      title?: ReactNode;
      onSelect?: () => void;
    }) => <button onClick={onSelect}>{title}</button>,
  };
});

vi.mock("lucide-react", () => ({
  Download: () => <span>download-icon</span>,
  RefreshCw: () => <span>refresh-icon</span>,
  Trash2: () => <span>trash-icon</span>,
  XCircle: () => <span>clear-icon</span>,
}));

vi.mock("./TrajectoryDetailView", () => ({
  TrajectoryDetailView: ({ trajectoryId }: { trajectoryId: string }) => (
    <div>Trajectory detail: {trajectoryId}</div>
  ),
}));

import { TrajectoriesView } from "./TrajectoriesView";

function t(key: string, options?: { defaultValue?: string }): string {
  const translations: Record<string, string> = {
    "common.refresh": "Refresh",
    "common.export": "Export",
    "common.loading": "Loading...",
    "trajectoriesview.DeleteCurrent": "Delete current",
    "trajectoriesview.DeleteCurrentPrompt": "Delete this trajectory?",
    "trajectoriesview.ClearAll": "Clear all",
    "trajectoriesview.ClearAllPrompt": "Delete all trajectories?",
    "confirmdeletecontrol.Confirm": "Confirm",
    "confirmdeletecontrol.Cancel": "Cancel",
    "trajectoriesview.Search": "Search...",
    "trajectoriesview.Entries": "Entries",
    "trajectoriesview.LoadingTrajectories": "Loading trajectories...",
    "trajectoriesview.NoTrajectoriesYet": "No trajectories yet.",
    "trajectoriesview.NoTrajectoriesMatchingFilters":
      "No trajectories match the current filters.",
    "databaseview.Prev": "Prev",
    "onboarding.next": "Next",
  };
  return translations[key] ?? options?.defaultValue ?? key;
}

function makeTrajectory(id: string) {
  return {
    id,
    agentId: "agent-1",
    roomId: null,
    entityId: null,
    conversationId: null,
    source: "discord",
    status: "completed" as const,
    startTime: Date.now(),
    endTime: Date.now(),
    durationMs: 150,
    llmCallCount: 1,
    providerAccessCount: 0,
    totalPromptTokens: 16,
    totalCompletionTokens: 12,
    metadata: {},
    createdAt: "2026-04-07T22:00:00.000Z",
    updatedAt: "2026-04-07T22:00:01.000Z",
  };
}

describe("TrajectoriesView actions", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockGetTrajectories.mockReset();
    mockDeleteTrajectories.mockReset();
    mockClearAllTrajectories.mockReset();
    document.body.innerHTML = "";
  });

  it("deletes the selected trajectory and advances selection", async () => {
    const setActionNotice = vi.fn();
    const onSelectTrajectory = vi.fn();

    mockUseApp.mockReturnValue({
      t,
      setActionNotice,
    });
    mockGetTrajectories
      .mockResolvedValueOnce({
        trajectories: [makeTrajectory("traj-1"), makeTrajectory("traj-2")],
        total: 2,
        offset: 0,
        limit: 50,
      })
      .mockResolvedValueOnce({
        trajectories: [makeTrajectory("traj-2")],
        total: 1,
        offset: 0,
        limit: 50,
      });
    mockDeleteTrajectories.mockResolvedValue({ deleted: 1 });

    render(
      <TrajectoriesView
        selectedTrajectoryId="traj-1"
        onSelectTrajectory={onSelectTrajectory}
      />,
    );

    await waitFor(() => {
      expect(mockGetTrajectories).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete current" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockDeleteTrajectories).toHaveBeenCalledWith(["traj-1"]);
      expect(onSelectTrajectory).toHaveBeenCalledWith("traj-2");
    });
  });

  it("clears all trajectories and clears the selection", async () => {
    const setActionNotice = vi.fn();
    const onSelectTrajectory = vi.fn();

    mockUseApp.mockReturnValue({
      t,
      setActionNotice,
    });
    mockGetTrajectories.mockResolvedValue({
      trajectories: [makeTrajectory("traj-1")],
      total: 1,
      offset: 0,
      limit: 50,
    });
    mockClearAllTrajectories.mockResolvedValue({ deleted: 1 });

    render(
      <TrajectoriesView
        selectedTrajectoryId="traj-1"
        onSelectTrajectory={onSelectTrajectory}
      />,
    );

    await waitFor(() => {
      expect(mockGetTrajectories).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockClearAllTrajectories).toHaveBeenCalledTimes(1);
      expect(onSelectTrajectory).toHaveBeenCalledWith(null);
    });
  });

  it("does not delete anything when the confirmation is cancelled", async () => {
    const setActionNotice = vi.fn();
    const onSelectTrajectory = vi.fn();

    mockUseApp.mockReturnValue({
      t,
      setActionNotice,
    });
    mockGetTrajectories.mockResolvedValue({
      trajectories: [makeTrajectory("traj-1")],
      total: 1,
      offset: 0,
      limit: 50,
    });

    render(
      <TrajectoriesView
        selectedTrajectoryId="traj-1"
        onSelectTrajectory={onSelectTrajectory}
      />,
    );

    await waitFor(() => {
      expect(mockGetTrajectories).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete current" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDeleteTrajectories).not.toHaveBeenCalled();
    expect(onSelectTrajectory).not.toHaveBeenCalled();
    expect(setActionNotice).not.toHaveBeenCalled();
  });

  it("surfaces an error notice when deleting the selected trajectory fails", async () => {
    const setActionNotice = vi.fn();
    const onSelectTrajectory = vi.fn();

    mockUseApp.mockReturnValue({
      t,
      setActionNotice,
    });
    mockGetTrajectories.mockResolvedValue({
      trajectories: [makeTrajectory("traj-1"), makeTrajectory("traj-2")],
      total: 2,
      offset: 0,
      limit: 50,
    });
    mockDeleteTrajectories.mockRejectedValue(new Error("delete failed"));

    render(
      <TrajectoriesView
        selectedTrajectoryId="traj-1"
        onSelectTrajectory={onSelectTrajectory}
      />,
    );

    await waitFor(() => {
      expect(mockGetTrajectories).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete current" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockDeleteTrajectories).toHaveBeenCalledWith(["traj-1"]);
      expect(setActionNotice).toHaveBeenCalledWith(
        "delete failed",
        "error",
        4200,
      );
    });
    expect(onSelectTrajectory).not.toHaveBeenCalled();
  });

  it("shows an info notice when clearing all trajectories deletes nothing", async () => {
    const setActionNotice = vi.fn();
    const onSelectTrajectory = vi.fn();

    mockUseApp.mockReturnValue({
      t,
      setActionNotice,
    });
    mockGetTrajectories.mockResolvedValue({
      trajectories: [makeTrajectory("traj-1")],
      total: 1,
      offset: 0,
      limit: 50,
    });
    mockClearAllTrajectories.mockResolvedValue({ deleted: 0 });

    render(
      <TrajectoriesView
        selectedTrajectoryId="traj-1"
        onSelectTrajectory={onSelectTrajectory}
      />,
    );

    await waitFor(() => {
      expect(mockGetTrajectories).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockClearAllTrajectories).toHaveBeenCalledTimes(1);
      expect(setActionNotice).toHaveBeenCalledWith(
        "No trajectory was deleted.",
        "info",
        2400,
      );
      expect(onSelectTrajectory).toHaveBeenCalledWith(null);
    });
  });

  it("surfaces an error notice when clearing all trajectories fails", async () => {
    const setActionNotice = vi.fn();
    const onSelectTrajectory = vi.fn();

    mockUseApp.mockReturnValue({
      t,
      setActionNotice,
    });
    mockGetTrajectories.mockResolvedValue({
      trajectories: [makeTrajectory("traj-1")],
      total: 1,
      offset: 0,
      limit: 50,
    });
    mockClearAllTrajectories.mockRejectedValue(new Error("clear failed"));

    render(
      <TrajectoriesView
        selectedTrajectoryId="traj-1"
        onSelectTrajectory={onSelectTrajectory}
      />,
    );

    await waitFor(() => {
      expect(mockGetTrajectories).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockClearAllTrajectories).toHaveBeenCalledTimes(1);
      expect(setActionNotice).toHaveBeenCalledWith(
        "clear failed",
        "error",
        4200,
      );
    });
    expect(onSelectTrajectory).not.toHaveBeenCalled();
  });
});
