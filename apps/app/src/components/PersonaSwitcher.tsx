/**
 * Persona switcher — pill toggle between Social and Coding modes.
 */

import { Code, MessageCircle } from "lucide-react";
import { useApp } from "../AppContext";
import { CHANNEL_COLORS, type Persona } from "./stream/helpers";

const PERSONAS: { id: Persona; label: string; Icon: typeof MessageCircle }[] = [
  { id: "social", label: "Social", Icon: MessageCircle },
  { id: "coding", label: "Coding", Icon: Code },
];

export function PersonaSwitcher() {
  const { activePersona, setState } = useApp();

  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-bg-accent border border-border text-[11px]">
      {PERSONAS.map(({ id, label, Icon }) => {
        const active = activePersona === id;
        const colors = CHANNEL_COLORS[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => setState("activePersona", id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer ${
              active
                ? `${colors.bg} ${colors.text} ${colors.border} border font-medium shadow-sm`
                : "text-muted hover:text-txt border border-transparent"
            }`}
            aria-pressed={active}
            aria-label={`Switch to ${label} mode`}
          >
            <Icon className="w-3 h-3" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
