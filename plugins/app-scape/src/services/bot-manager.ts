/**
 * BotManager — thin lifecycle wrapper around {@link BotSdk}.
 *
 * Separates "connection lifecycle + config resolution" from the
 * `ScapeGameService` that owns the LLM loop. That lets the game
 * service stay focused on prompting / action dispatch and lets the
 * BotManager evolve independently (e.g. multi-agent support later,
 * SDK swap-in for testing).
 *
 * PR 3 scope: connect + passive state caching. No LLM loop, no
 * automatic action dispatch — the game service will push actions
 * through `sendAction` in PR 4.
 */

import { BotSdk, type BotSdkCallbacks, type BotSdkOptions, type SdkConnectionStatus } from "../sdk/index.js";
import type {
    AnyActionFrame,
    ErrorFrame,
    OperatorCommandFrame,
    PerceptionSnapshot,
    SpawnOkFrame,
} from "../sdk/types.js";

export interface BotManagerConfig {
    url: string;
    token: string;
    agentId: string;
    displayName: string;
    password: string;
    controller?: "llm" | "user" | "hybrid";
    persona?: string;
}

export interface BotManagerCallbacks {
    onStatusChange?: (status: SdkConnectionStatus) => void;
    onPerception?: (snapshot: PerceptionSnapshot) => void;
    onSpawn?: (spawn: SpawnOkFrame) => void;
    onServerError?: (error: ErrorFrame) => void;
    onOperatorCommand?: (frame: OperatorCommandFrame) => void;
    onLog?: (line: string) => void;
}

export class BotManager {
    private sdk: BotSdk | null = null;
    private latestPerception: PerceptionSnapshot | null = null;
    private latestSpawn: SpawnOkFrame | null = null;
    private latestStatus: SdkConnectionStatus = "idle";

    constructor(
        private readonly config: BotManagerConfig,
        private readonly callbacks: BotManagerCallbacks = {},
    ) {}

    connect(): void {
        if (this.sdk && this.latestStatus !== "closed" && this.latestStatus !== "failed") {
            return;
        }
        const options: BotSdkOptions = {
            url: this.config.url,
            token: this.config.token,
            agentId: this.config.agentId,
            displayName: this.config.displayName,
            password: this.config.password,
            controller: this.config.controller ?? "hybrid",
            persona: this.config.persona,
            autoReconnect: true,
        };
        const sdkCallbacks: BotSdkCallbacks = {
            onStatusChange: (status) => {
                this.latestStatus = status;
                this.callbacks.onStatusChange?.(status);
                this.log(`status → ${status}`);
            },
            onPerception: (snapshot) => {
                this.latestPerception = snapshot;
                this.callbacks.onPerception?.(snapshot);
            },
            onSpawn: (spawn) => {
                this.latestSpawn = spawn;
                this.callbacks.onSpawn?.(spawn);
                this.log(
                    `spawnOk playerId=${spawn.playerId} at (${spawn.x}, ${spawn.z})`,
                );
            },
            onServerError: (error) => {
                this.callbacks.onServerError?.(error);
                this.log(`server error ${error.code}: ${error.message}`);
            },
            onOperatorCommand: (frame) => {
                this.callbacks.onOperatorCommand?.(frame);
                const from = frame.fromPlayerName ?? frame.source;
                this.log(
                    `operator command from ${from}: "${frame.text.slice(0, 80)}"`,
                );
            },
            onLog: (direction, summary) => {
                this.log(`[${direction}] ${summary}`);
            },
        };
        this.sdk = new BotSdk(options, sdkCallbacks);
        this.sdk.connect();
    }

    disconnect(reason?: string): void {
        this.sdk?.disconnect(reason);
        this.sdk = null;
    }

    getStatus(): SdkConnectionStatus {
        return this.latestStatus;
    }

    getPerception(): PerceptionSnapshot | null {
        return this.latestPerception;
    }

    getSpawnState(): SpawnOkFrame | null {
        return this.latestSpawn;
    }

    isConnected(): boolean {
        return this.sdk?.isConnected() ?? false;
    }

    async sendAction(
        action: Omit<AnyActionFrame, "kind" | "correlationId">,
        awaitAck = true,
    ): Promise<{ success: boolean; message?: string }> {
        if (!this.sdk) {
            return { success: false, message: "bot manager not connected" };
        }
        try {
            return await this.sdk.sendAction(action, awaitAck);
        } catch (err) {
            return {
                success: false,
                message: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private log(line: string): void {
        this.callbacks.onLog?.(line);
    }
}
