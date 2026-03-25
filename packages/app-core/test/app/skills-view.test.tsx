// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockLoadSkills, mockRefreshSkills } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockLoadSkills: vi.fn(async () => {}),
  mockRefreshSkills: vi.fn(async () => {}),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
  Dialog: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("div", { className }, children),
  DialogHeader: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("div", { className }, children),
  DialogTitle: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("div", { className }, children),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
  StatusBadge: ({ label }: { label: string }) =>
    React.createElement("span", null, label),
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange?: (next: boolean) => void;
  }) =>
    React.createElement("button", {
      type: "button",
      "aria-pressed": checked,
      onClick: () => onCheckedChange?.(!checked),
    }),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
    React.createElement("textarea", props),
}));

vi.mock("../../src/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/hooks", () => ({
  useTimeout: () => ({ setTimeout: globalThis.setTimeout }),
}));

vi.mock("../../src/api", () => ({
  client: {
    getSkillSource: vi.fn(),
    saveSkillSource: vi.fn(),
  },
}));

import { SkillsView } from "../../src/components/SkillsView";

function createAppState(overrides?: Record<string, unknown>) {
  return {
    skills: [],
    skillCreateFormOpen: false,
    skillCreateName: "",
    skillCreateDescription: "",
    skillCreating: false,
    skillReviewReport: null,
    skillReviewId: "",
    skillReviewLoading: false,
    skillToggleAction: "",
    skillsMarketplaceQuery: "",
    skillsMarketplaceResults: [],
    skillsMarketplaceError: "",
    skillsMarketplaceLoading: false,
    skillsMarketplaceAction: "",
    skillsMarketplaceManualGithubUrl: "",
    loadSkills: mockLoadSkills,
    refreshSkills: mockRefreshSkills,
    handleSkillToggle: vi.fn(),
    handleCreateSkill: vi.fn(),
    handleDeleteSkill: vi.fn(),
    handleReviewSkill: vi.fn(),
    handleAcknowledgeSkill: vi.fn(),
    searchSkillsMarketplace: vi.fn(async () => {}),
    installSkillFromMarketplace: vi.fn(async () => {}),
    uninstallMarketplaceSkill: vi.fn(async () => {}),
    installSkillFromGithubUrl: vi.fn(async () => {}),
    setState: vi.fn(),
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
    ...overrides,
  };
}

describe("SkillsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state copy when no skills are installed", async () => {
    mockUseApp.mockReturnValue(createAppState());

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SkillsView));
    });

    expect(
      tree.root.findByProps({ "data-testid": "skills-shell" }),
    ).toBeTruthy();
    const skillsShell = tree.root.findByProps({
      "data-testid": "skills-shell",
    });
    const skillsSidebar = tree.root.findByProps({
      "data-testid": "skills-sidebar",
    });
    expect(skillsSidebar).toBeTruthy();
    expect(String(skillsShell.props.className)).toContain("flex-col");
    expect(String(skillsSidebar.props.className)).toContain("w-full");
    expect(
      tree.root.findByProps({ "data-testid": "skills-empty-state" }),
    ).toBeTruthy();
    expect(tree.root.findAllByType("button").length).toBeGreaterThan(0);
    expect(
      tree.root.findByProps({ "aria-label": "skillsview.filterSkills" }),
    ).toBeTruthy();
  });

  it("uses a master-detail layout and updates the detail pane when selection changes", async () => {
    mockUseApp.mockReturnValue(
      createAppState({
        skills: [
          {
            id: "warn-skill",
            name: "Warn Skill",
            description: "Needs review",
            enabled: false,
            scanStatus: "warning",
          },
          {
            id: "active-skill",
            name: "Active Skill",
            description: "All good",
            enabled: true,
            scanStatus: "ok",
          },
        ],
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SkillsView));
    });

    expect(
      tree.root.findByProps({ "data-testid": "skills-sidebar" }),
    ).toBeTruthy();
    expect(
      tree.root.findByProps({ "data-testid": "skills-detail" }),
    ).toBeTruthy();
    expect(
      tree.root.findByProps({ "data-testid": "skills-detail-name" }).children,
    ).toContain("Warn Skill");
    expect(
      tree.root
        .findByProps({ "data-testid": "skill-row-warn-skill" })
        .findByProps({
          "aria-current": "page",
        }),
    ).toBeTruthy();
    expect(
      tree.root
        .findAllByType("button")
        .some((node) => node.children.includes("skillsview.ReviewFindings")),
    ).toBe(true);

    await act(async () => {
      tree.root
        .findByProps({ "data-testid": "skill-row-active-skill" })
        .findByProps({ type: "button" })
        .props.onClick();
    });

    expect(
      tree.root.findByProps({ "data-testid": "skills-detail-name" }).children,
    ).toContain("Active Skill");
  });
});
