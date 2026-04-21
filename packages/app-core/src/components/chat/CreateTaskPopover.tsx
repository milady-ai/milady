import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@miladyai/ui";
import { Code2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
/** Glass-style button surface (inlined from deleted desktop-surface-primitives). */
const GLASS_BUTTON =
  "border border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] text-muted-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_14px_20px_-18px_rgba(15,23,42,0.14)] backdrop-blur-md transition-[border-color,background-color,color,transform,box-shadow] duration-200 hover:border-border/46 hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_97%,transparent))] hover:text-txt hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_16px_22px_-18px_rgba(15,23,42,0.16)] active:scale-95 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_24px_-20px_rgba(0,0,0,0.24)]";

const GLASS_BUTTON_ACCENT =
  "border border-accent/26 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.16),rgba(var(--accent-rgb),0.07))] text-txt-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_14px_22px_-18px_rgba(var(--accent-rgb),0.24)] ring-1 ring-inset ring-accent/10 hover:border-accent/42 hover:bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.2),rgba(var(--accent-rgb),0.1))] hover:text-txt-strong";

const DEFAULT_AGENT_TYPES = ["claude", "gemini", "codex", "aider"] as const;
type AgentType = (typeof DEFAULT_AGENT_TYPES)[number];

interface CreateTaskPopoverProps {
  /** Current chat input text to pre-fill the task description */
  chatInput: string;
  /** Whether the composer is locked (agent starting, etc.) */
  disabled: boolean;
  /** Callback to send a message with create_task metadata */
  onCreateTask: (description: string, agentType: string) => void;
  /** Translation function */
  t: (key: string) => string;
}

export function CreateTaskPopover({
  chatInput,
  disabled,
  onCreateTask,
  t,
}: CreateTaskPopoverProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("claude");

  // Pre-fill description from chat input when popover opens (not on subsequent chatInput changes)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current && chatInput.trim()) {
      setDescription(chatInput.trim());
    }
    prevOpenRef.current = open;
  }, [open, chatInput]);

  const handleCreate = useCallback(() => {
    const trimmed = description.trim();
    if (!trimmed) return;
    onCreateTask(trimmed, agentType);
    setDescription("");
    setAgentType("claude");
    setOpen(false);
  }, [description, agentType, onCreateTask]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-[46px] w-[46px] shrink-0 ${GLASS_BUTTON}`}
          disabled={disabled}
          aria-label={t("chat.createTask") || "Create coding task"}
          title={t("chat.createTask") || "Create coding task"}
        >
          <Code2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-txt-strong">
              {t("chat.createTaskTitle") || "Create Coding Task"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setOpen(false)}
              aria-label={t("common.close") || "Close"}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              t("chat.taskDescriptionPlaceholder") ||
              "Describe what to build..."
            }
            className="min-h-[80px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCreate();
              }
            }}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="agent-type-select"
              className="text-xs text-muted-foreground"
            >
              {t("chat.agentType") || "Agent"}
            </label>
            <Select
              value={agentType}
              onValueChange={(v) => setAgentType(v as AgentType)}
            >
              <SelectTrigger id="agent-type-select" className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_AGENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className={`w-full ${GLASS_BUTTON_ACCENT}`}
            onClick={handleCreate}
            disabled={!description.trim()}
          >
            {t("chat.createTaskButton") || "Create"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
