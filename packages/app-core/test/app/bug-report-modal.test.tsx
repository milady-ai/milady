// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @miladyai/ui components to render inline (no Radix portals)
// so react-test-renderer does not crash with parentInstance.children.indexOf.
vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Banner: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { role: "alert", ...props }, children),
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props }, children),
    Dialog: ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(React.Fragment, null, children),
    DialogContent: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", { role: "dialog", ...props }, children),
    DialogDescription: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("span", props, children),
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("span", props, children),
    Field: passthrough,
    FieldDescription: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
    FieldLabel: ({
      children,
      ...props
    }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
      React.createElement("label", props, children),
    FieldMessage: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLParagraphElement>) =>
      React.createElement("div", props, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
    Select: passthrough,
    SelectContent: passthrough,
    SelectItem: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("option", props, children),
    SelectTrigger: passthrough,
    SelectValue: passthrough,
  };
});

// --- hoisted mocks ----------------------------------------------------------

const {
  mockUseBugReport,
  mockClient,
  mockCopyToClipboard,
  isElectrobunRuntimeMock,
  mockDesktopDiagnostics,
  loadDesktopBugReportDiagnosticsMock,
  openDesktopLogsFolderMock,
  createDesktopBugReportBundleMock,
  bridgeMockModule,
  desktopBugReportMockModule,
} = vi.hoisted(() => {
  const mockUseBugReport = vi.fn();
  const mockClient = {
    getCodingAgentStatus: vi.fn(async () => null),
    checkBugReportInfo: vi.fn().mockResolvedValue({}),
    submitBugReport: vi.fn().mockResolvedValue({}),
  };
  const mockCopyToClipboard = vi.fn();
  const isElectrobunRuntimeMock = vi.fn(() => false);
  const mockDesktopDiagnostics = {
    state: "error",
    phase: "startup_failed",
    updatedAt: "2026-03-26T00:00:00.000Z",
    lastError: "Boom",
    agentName: null,
    port: null,
    startedAt: null,
    platform: "win32",
    arch: "x64",
    configDir: "C:/Users/test/AppData/Roaming/Milady",
    logPath: "C:/Users/test/AppData/Roaming/Milady/milady-startup.log",
    statusPath: "C:/Users/test/AppData/Roaming/Milady/startup-status.json",
    logTail: "startup line 1\\nstartup line 2",
    appVersion: "2.0.0-alpha.125",
    appRuntime: "electrobun/1.3.10",
    packaged: true,
    locale: "zh-CN",
  };
  const loadDesktopBugReportDiagnosticsMock = vi.fn();
  const openDesktopLogsFolderMock = vi.fn();
  const createDesktopBugReportBundleMock = vi.fn();

  return {
    mockUseBugReport,
    mockClient,
    mockCopyToClipboard,
    isElectrobunRuntimeMock,
    mockDesktopDiagnostics,
    loadDesktopBugReportDiagnosticsMock,
    openDesktopLogsFolderMock,
    createDesktopBugReportBundleMock,
    bridgeMockModule: {
      isElectrobunRuntime: () => isElectrobunRuntimeMock(),
    },
    desktopBugReportMockModule: {
      loadDesktopBugReportDiagnostics: (...args: unknown[]) =>
        loadDesktopBugReportDiagnosticsMock(...args),
      openDesktopLogsFolder: (...args: unknown[]) =>
        openDesktopLogsFolderMock(...args),
      createDesktopBugReportBundle: (...args: unknown[]) =>
        createDesktopBugReportBundleMock(...args),
      formatDesktopBugReportDiagnostics: (diagnostics: {
        phase: string;
        lastError: string | null;
      }) =>
        `Startup Phase: ${diagnostics.phase}\nLast Error: ${diagnostics.lastError ?? "none"}`,
    },
  };
});

const mockSetTimeout = (fn: () => void, ms: number) =>
  globalThis.setTimeout(fn, ms);
const mockClearTimeout = (id: ReturnType<typeof globalThis.setTimeout>) =>
  globalThis.clearTimeout(id);

vi.mock("@miladyai/app-core/hooks", () => ({
  useBugReport: () => mockUseBugReport(),
  useTimeout: () => ({
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,
  }),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => ({
    t: (key: string) => key,
    copyToClipboard: mockCopyToClipboard,
  }),
}));

vi.mock("@miladyai/app-core/config/branding", () => ({
  useBranding: () => ({
    appName: "Milady",
    bugReportUrl: "https://github.com/elizaos/eliza/issues/new",
  }),
}));

vi.mock("@miladyai/app-core/utils", () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock("../../src/bridge", () => bridgeMockModule);
vi.mock("../../src/bridge/index.ts", () => bridgeMockModule);
vi.mock(
  "../../src/utils/desktop-bug-report",
  () => desktopBugReportMockModule,
);
vi.mock(
  "../../src/utils/desktop-bug-report.ts",
  () => desktopBugReportMockModule,
);

import { BugReportModal } from "../../src/components/shell/BugReportModal";

// --- helpers ----------------------------------------------------------------

let closeFn: ReturnType<typeof vi.fn>;

function setupMock(isOpen: boolean) {
  closeFn = vi.fn();
  mockUseBugReport.mockReturnValue({ isOpen, draft: null, close: closeFn });
}

function getButtons(root: TestRenderer.ReactTestInstance) {
  return root.findAllByType("button" as React.ElementType);
}

function getTextareas(root: TestRenderer.ReactTestInstance) {
  return root.findAllByType("textarea" as React.ElementType);
}

function getText(root: TestRenderer.ReactTestInstance): string {
  return root
    .findAllByType("span" as React.ElementType)
    .map((n) => n.children.join(""))
    .join("\n");
}

function findButton(root: TestRenderer.ReactTestInstance, label: string) {
  return getButtons(root).find((b) => b.children.join("").includes(label));
}

function disableElectrobunRuntime(): void {
  const runtimeWindow = window as Window & {
    __electrobunWindowId?: number;
    __MILADY_ELECTROBUN_RPC__?: unknown;
  };
  isElectrobunRuntimeMock.mockReturnValue(false);
  delete runtimeWindow.__electrobunWindowId;
  delete runtimeWindow.__MILADY_ELECTROBUN_RPC__;
}

function enableElectrobunRuntime(): void {
  const runtimeWindow = window as Window & {
    __electrobunWindowId?: number;
    __MILADY_ELECTROBUN_RPC__?: {
      request: Record<string, (params?: unknown) => Promise<unknown>>;
      onMessage: typeof vi.fn;
      offMessage: typeof vi.fn;
    };
  };
  isElectrobunRuntimeMock.mockReturnValue(true);
  runtimeWindow.__electrobunWindowId = 1;
  runtimeWindow.__MILADY_ELECTROBUN_RPC__ = {
    request: {
      desktopGetStartupDiagnostics: async () =>
        loadDesktopBugReportDiagnosticsMock(),
      desktopOpenLogsFolder: async () => openDesktopLogsFolderMock(),
      desktopCreateBugReportBundle: async (params?: unknown) =>
        createDesktopBugReportBundleMock(params),
    },
    onMessage: vi.fn(),
    offMessage: vi.fn(),
  };
}

/** Fill both required fields and return the tree root. */
async function fillRequired(root: TestRenderer.ReactTestInstance) {
  const textareas = getTextareas(root);
  await act(async () => {
    textareas[0].props.onChange({ target: { value: "Bug description" } });
  });
  await act(async () => {
    textareas[1].props.onChange({ target: { value: "1. Click button" } });
  });
}

// --- tests ------------------------------------------------------------------

describe("BugReportModal", () => {
  beforeEach(() => {
    disableElectrobunRuntime();
    mockUseBugReport.mockReset();
    mockClient.checkBugReportInfo.mockReset().mockResolvedValue({});
    mockClient.submitBugReport.mockReset().mockResolvedValue({});
    mockCopyToClipboard.mockReset().mockResolvedValue(undefined);
    isElectrobunRuntimeMock.mockReset().mockReturnValue(false);
    loadDesktopBugReportDiagnosticsMock
      .mockReset()
      .mockResolvedValue(mockDesktopDiagnostics);
    openDesktopLogsFolderMock.mockReset().mockResolvedValue(undefined);
    createDesktopBugReportBundleMock.mockReset().mockResolvedValue({
      directory:
        "C:/Users/test/AppData/Roaming/Milady/bug-reports/milady-report-1",
    });
  });

  afterEach(() => {});

  // --- rendering ---

  it("renders nothing when closed", () => {
    setupMock(false);
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
    });
    expect(tree?.toJSON()).toBeNull();
  });

  it("renders modal with header when open", async () => {
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });
    expect(getText(tree?.root)).toContain("bugreportmodal.ReportABug");
  });

  it("renders required field markers", async () => {
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });
    const labels = tree?.root.findAllByType("label" as React.ElementType);
    const requiredLabels = labels?.filter((l) =>
      l
        .findAllByType("span" as React.ElementType)
        .flatMap((s) => s.children)
        .some((c) => typeof c === "string" && c.includes("*")),
    );
    expect(requiredLabels?.length).toBeGreaterThanOrEqual(2);
  });

  it("renders all form textareas and inputs", async () => {
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });
    // Description, Steps to Reproduce, Expected Behavior, Actual Behavior
    expect(getTextareas(tree?.root).length).toBeGreaterThanOrEqual(4);
    // Node Version, Model Provider
    const inputs = tree?.root.findAllByType("input" as React.ElementType);
    expect(inputs?.length).toBeGreaterThanOrEqual(2);
  });

  // --- env info fetch ---

  it("fetches env info on open", async () => {
    mockClient.checkBugReportInfo.mockResolvedValue({
      nodeVersion: "v22.0.0",
      platform: "darwin",
    });
    setupMock(true);
    await act(async () => {
      TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });
    expect(mockClient.checkBugReportInfo).toHaveBeenCalledOnce();
  });

  it("prefills the form from bug report draft data", async () => {
    closeFn = vi.fn();
    mockUseBugReport.mockReturnValue({
      isOpen: true,
      draft: {
        description: "Startup failed on Windows",
        actualBehavior: "App never got past startup",
        logs: "Reason: backend-unreachable",
      },
      close: closeFn,
    });
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    const textareas = getTextareas(tree?.root);
    expect(textareas[0].props.value).toBe("Startup failed on Windows");
    expect(textareas[3].props.value).toBe("App never got past startup");
  });

  // --- validation ---

  it("disables submit when required fields are empty", async () => {
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });
    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    expect(submitBtn?.props.disabled).toBe(true);
  });

  it("shows validation error on empty submit attempt", async () => {
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    const errorDivs = tree?.root.findAll((node) =>
      node.children.some(
        (c) =>
          typeof c === "string" &&
          c.includes("bugreportmodal.descriptionRequired"),
      ),
    );
    expect(errorDivs?.length).toBeGreaterThan(0);
  });

  // --- submission ---

  it("calls submitBugReport on valid submit", async () => {
    mockClient.submitBugReport.mockResolvedValue({
      url: "https://github.com/elizaos/eliza/issues/99",
    });
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    expect(mockClient.submitBugReport).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Bug description",
        stepsToReproduce: "1. Click button",
      }),
    );
  });

  it("does not send screenshot field to server", async () => {
    mockClient.submitBugReport.mockResolvedValue({
      url: "https://example.com",
    });
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    const callArg = mockClient.submitBugReport.mock.calls[0][0];
    expect(callArg).not.toHaveProperty("screenshot");
  });

  it("shows success state with issue URL after submit", async () => {
    const issueUrl = "https://github.com/elizaos/eliza/issues/99";
    mockClient.submitBugReport.mockResolvedValue({ url: issueUrl });
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    expect(getText(tree?.root)).toContain("bugreportmodal.BugReportSubmitted");
    const link = tree?.root.findByType("a" as React.ElementType);
    expect(link?.props.href).toBe(issueUrl);
  });

  it("shows success state when remote intake accepts without returning a URL", async () => {
    mockClient.submitBugReport.mockResolvedValue({ accepted: true });
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("bugreportmodal.BugReportSubmitted");
    expect(snapshot).toContain("Your report was received.");
  });

  it("ignores non-https URLs returned by remote intake", async () => {
    mockClient.submitBugReport.mockResolvedValue({
      accepted: true,
      url: "data:text/html,phish",
    });
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("bugreportmodal.BugReportSubmitted");
    expect(snapshot).toContain("Your report was received.");
    expect(snapshot).not.toContain("data:text/html,phish");
  });

  it("shows error message on submit failure", async () => {
    mockClient.submitBugReport.mockRejectedValue(new Error("Network error"));
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    const errorDivs = tree?.root.findAll((node) =>
      node.children.some(
        (c) => typeof c === "string" && c.includes("Network error"),
      ),
    );
    expect(errorDivs?.length).toBe(1);
  });

  // --- fallback mode ---

  it("does not show success URL on fallback response", async () => {
    mockClient.submitBugReport.mockResolvedValue({
      fallback: "https://github.com/elizaos/eliza/issues/new",
    });
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const submitBtn = findButton(tree?.root, "bugreportmodal.submit");
    await act(async () => {
      submitBtn?.props.onClick();
    });

    // Fallback path does not transition to success URL view
    expect(getText(tree?.root)).not.toContain(
      "bugreportmodal.BugReportSubmitted",
    );
    // Form should still be visible (not replaced by success state)
    expect(getTextareas(tree?.root).length).toBeGreaterThan(0);
  });

  it("loads desktop diagnostics in the Electrobun runtime", async () => {
    enableElectrobunRuntime();
    setupMock(true);

    await act(async () => {
      TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    expect(loadDesktopBugReportDiagnosticsMock).toHaveBeenCalledOnce();
  });

  it("opens the desktop logs folder", async () => {
    enableElectrobunRuntime();
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    const logsButton = findButton(tree?.root, "bugreportmodal.openLogsFolder");
    await act(async () => {
      await logsButton?.props.onClick();
    });

    expect(openDesktopLogsFolderMock).toHaveBeenCalledOnce();
  });

  it("copies desktop diagnostics", async () => {
    enableElectrobunRuntime();
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    const copyButton = findButton(tree?.root, "bugreportmodal.copyDiagnostics");
    await act(async () => {
      await copyButton?.props.onClick();
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("Startup Phase: startup_failed"),
    );
  });

  it("creates a local report bundle", async () => {
    enableElectrobunRuntime();
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    await fillRequired(tree?.root);

    const saveButton = findButton(tree?.root, "bugreportmodal.saveBundle");
    await act(async () => {
      await saveButton?.props.onClick();
    });

    expect(createDesktopBugReportBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "milady-report",
        reportMarkdown: expect.any(String),
      }),
    );
  });

  // --- close behavior ---

  it("calls close on Cancel button click", async () => {
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    const cancelBtn = findButton(tree?.root, "common.cancel");
    act(() => {
      cancelBtn?.props.onClick();
    });

    expect(closeFn).toHaveBeenCalled();
  });

  // --- logs toggle ---

  it("toggles logs textarea visibility", async () => {
    setupMock(true);
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(BugReportModal));
      await new Promise((r) => globalThis.setTimeout(r, 60));
    });

    const before = getTextareas(tree?.root).length;

    const logsToggle = getButtons(tree?.root).find(
      (b) => b.props["aria-controls"] === "bug-report-logs-panel",
    );
    act(() => {
      logsToggle?.props.onClick();
    });

    const after = getTextareas(tree?.root).length;
    expect(after).toBe(before + 1);
  });
});
