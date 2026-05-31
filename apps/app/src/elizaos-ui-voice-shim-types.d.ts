import type { ComponentType } from "react";

export type VoiceCaptureState =
  | "idle"
  | "starting"
  | "listening"
  | "stopped"
  | "error";

export interface VoiceCaptureTranscriptSegment {
  text: string;
  final: boolean;
  backend: "local-inference" | "browser";
}

export interface VoiceCaptureHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
  isActive(): boolean;
  getAnalyser(): AnalyserNode | null;
}

export interface VoiceCaptureFactoryOptions {
  onTranscript: (segment: VoiceCaptureTranscriptSegment) => void;
  onStateChange?: (state: VoiceCaptureState, error?: Error) => void;
}

export declare function createVoiceCapture(
  options: VoiceCaptureFactoryOptions,
): VoiceCaptureHandle;

export interface VoicePillMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}

export interface VoicePillProps {
  messages?: VoicePillMessage[];
  onSubmit?: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  ariaLabel?: string;
}

export declare const VoicePill: ComponentType<VoicePillProps>;
export default VoicePill;
