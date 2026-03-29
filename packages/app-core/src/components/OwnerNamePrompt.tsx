/**
 * One-time modal that asks the user for their name when it's not set.
 * Shown the first time the user navigates to native/desktop UI.
 * Dismissed forever once a name is entered and persisted to config.
 *
 * Attempts to speak the prompt using the character's cloud TTS voice.
 * Silently skips TTS if cloud is not connected.
 */

import { Button, Input, Z_OVERLAY } from "@miladyai/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeOwnerName, OWNER_NAME_MAX_LENGTH } from "../utils/owner-name";

const PROMPT_TEXT = "Sorry, I didn't get your name! What should I call you?";

/** Best-effort TTS using the character's configured voice via cloud proxy. */
async function speakPrompt(): Promise<void> {
  let voiceId: string | undefined;
  let modelId: string | undefined;
  try {
    const cfgRes = await fetch("/api/config");
    if (cfgRes.ok) {
      const cfg = (await cfgRes.json()) as Record<string, unknown>;
      const tts = (cfg.messages as Record<string, unknown> | undefined)?.tts as
        | Record<string, unknown>
        | undefined;
      const el = tts?.elevenlabs as Record<string, unknown> | undefined;
      if (typeof el?.voiceId === "string") voiceId = el.voiceId;
      if (typeof el?.modelId === "string") modelId = el.modelId;
    }
  } catch {
    return;
  }

  try {
    const res = await fetch("/api/tts/cloud", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: PROMPT_TEXT,
        ...(voiceId ? { voiceId } : {}),
        ...(modelId ? { modelId } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    if (blob.size < 100) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    // TTS is best-effort — modal still works without it
  }
}

interface OwnerNamePromptProps {
  open: boolean;
  onSubmit: (name: string) => void;
}

export function OwnerNamePrompt({ open, onSubmit }: OwnerNamePromptProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const spokeRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    if (!spokeRef.current) {
      spokeRef.current = true;
      void speakPrompt();
    }
    return () => clearTimeout(timer);
  }, [open]);

  const handleSubmit = useCallback(() => {
    const normalized = normalizeOwnerName(name);
    if (normalized) onSubmit(normalized);
  }, [name, onSubmit]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[${Z_OVERLAY}] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300`}
    >
      <div className="mx-4 w-full max-w-sm rounded-3xl border border-border/40 bg-card/95 px-6 py-8 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-500">
        <div className="text-center">
          <p className="text-lg font-semibold text-txt-strong">
            Hey! What should I call you?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            I&apos;d love to know your name so I can greet you properly.
          </p>
        </div>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            ref={inputRef}
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 border-border/55 bg-bg/82 text-center text-base"
            autoComplete="given-name"
            maxLength={OWNER_NAME_MAX_LENGTH}
          />
          <Button
            type="submit"
            variant="default"
            className="mt-4 h-11 w-full text-sm font-semibold"
            disabled={!normalizeOwnerName(name)}
          >
            That&apos;s me!
          </Button>
        </form>
      </div>
    </div>
  );
}
