import http from "node:http";
import path from "node:path";
import {
  type Content,
  elizaLogger,
  type Memory,
  stringToUuid,
} from "@elizaos/core";
import dotenv from "dotenv";
import { handleCuaRoute } from "./cua-routes";
import {
  clearCapturedAction,
  getCapturedAction,
  setBenchmarkContext,
} from "./plugin";
import { createBenchmarkRuntime } from "./runtime-bootstrap";
import {
  type BenchmarkOutboxEntry,
  type BenchmarkSession,
  type BenchmarkTrajectoryStep,
  type CuaServiceLike,
  capturedActionToParams,
  coerceActions,
  coerceParams,
  composeBenchmarkPrompt,
  createSession,
  ensureBenchmarkSessionContext,
  extractBenchmarkName,
  extractRecord,
  extractTaskId,
  formatUnknownError,
  hasCuaConfig,
  normalizeBenchmarkContext,
  resolveHost,
  resolvePort,
  sessionKey,
} from "./server-utils";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export async function startBenchmarkServer() {
  const port = resolvePort();
  const host = resolveHost();
  elizaLogger.info(
    `[bench] Initializing milady benchmark runtime on ${host}:${port}...`,
  );

  const { runtime, plugins, shouldLoadCua } = await createBenchmarkRuntime();

  const roomToSession = new Map<string, string>();
  const entityToSession = new Map<string, string>();
  const trajectoriesBySession = new Map<string, BenchmarkTrajectoryStep[]>();
  const outboxBySession = new Map<string, BenchmarkOutboxEntry[]>();

  const benchmarkTransport = {
    sendDirectMessage: async (targetEntityId: string, content: Content) => {
      const key = entityToSession.get(targetEntityId);
      const text = typeof content.text === "string" ? content.text : "";
      const source =
        typeof content.source === "string" ? content.source : "benchmark";
      if (!key) return;
      const current = outboxBySession.get(key) ?? [];
      current.push({
        kind: "direct",
        targetId: targetEntityId,
        text,
        source,
        ts: Date.now(),
      });
      outboxBySession.set(key, current);
    },
    sendRoomMessage: async (targetRoomId: string, content: Content) => {
      const key = roomToSession.get(targetRoomId);
      const text = typeof content.text === "string" ? content.text : "";
      const source =
        typeof content.source === "string" ? content.source : "benchmark";
      if (!key) return;
      const current = outboxBySession.get(key) ?? [];
      current.push({
        kind: "room",
        targetId: targetRoomId,
        text,
        source,
        ts: Date.now(),
      });
      outboxBySession.set(key, current);
    },
  };

  const runtimeWithServiceOverride = runtime as unknown as {
    getService: (serviceType: string) => unknown;
  };
  const originalGetService =
    runtimeWithServiceOverride.getService.bind(runtime);
  runtimeWithServiceOverride.getService = (serviceType: string) => {
    if (serviceType === "benchmark") return benchmarkTransport;
    return originalGetService(serviceType);
  };

  const sessions = new Map<string, BenchmarkSession>();
  let activeSession: BenchmarkSession | null = null;

  const registerSessionRefs = (session: BenchmarkSession): void => {
    const key = sessionKey(session);
    roomToSession.set(session.roomId, key);
    roomToSession.set(session.relayRoomId, key);
    entityToSession.set(session.userEntityId, key);
  };

  const resolveSession = (
    taskId: string,
    benchmark: string,
    createIfMissing = true,
  ): BenchmarkSession | null => {
    const key = `${benchmark}:${taskId}`;
    const existing = sessions.get(key);
    if (existing) {
      activeSession = existing;
      return existing;
    }
    if (!createIfMissing) return null;
    const created = createSession(taskId, benchmark);
    sessions.set(key, created);
    registerSessionRefs(created);
    activeSession = created;
    return created;
  };

  const getCuaService = (): CuaServiceLike | null => {
    const service = runtime.getService("cua") as CuaServiceLike | null;
    return service;
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (pathname === "/api/benchmark/health" && req.method === "GET") {
      const cuaService = getCuaService();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ready",
          agent_name: runtime.character.name ?? "Milady",
          plugins: plugins.length,
          active_session: activeSession
            ? {
                benchmark: activeSession.benchmark,
                task_id: activeSession.taskId,
                room_id: activeSession.roomId,
              }
            : null,
          cua: {
            requested: shouldLoadCua,
            configured: hasCuaConfig(),
            service_available: Boolean(cuaService),
          },
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/reset" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = body.trim()
            ? (JSON.parse(body) as {
                task_id?: unknown;
                benchmark?: unknown;
              })
            : {};
          const taskId =
            typeof parsed.task_id === "string" &&
            parsed.task_id.trim().length > 0
              ? parsed.task_id
              : "default-task";
          const benchmark =
            typeof parsed.benchmark === "string" &&
            parsed.benchmark.trim().length > 0
              ? parsed.benchmark
              : "unknown";

          const session = resolveSession(taskId, benchmark, true);
          if (!session) {
            throw new Error("Failed to initialize benchmark session");
          }
          const key = sessionKey(session);
          trajectoriesBySession.set(key, []);
          outboxBySession.set(key, []);

          await ensureBenchmarkSessionContext(runtime, session);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              room_id: session.roomId,
              task_id: session.taskId,
              benchmark: session.benchmark,
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          elizaLogger.error(`[bench] Reset error: ${formatUnknownError(err)}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    if (pathname === "/api/benchmark/outbox" && req.method === "GET") {
      const context = extractRecord({
        benchmark: requestUrl.searchParams.get("benchmark") ?? undefined,
        task_id:
          requestUrl.searchParams.get("task_id") ??
          requestUrl.searchParams.get("taskId") ??
          undefined,
      });
      const taskId = extractTaskId(context);
      const benchmark = extractBenchmarkName(context);
      const session =
        resolveSession(taskId, benchmark, false) ??
        activeSession ??
        resolveSession("default-task", "unknown", false);

      if (!session) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", outbox: [] }));
        return;
      }

      const key = sessionKey(session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          benchmark: session.benchmark,
          task_id: session.taskId,
          room_id: session.roomId,
          outbox: outboxBySession.get(key) ?? [],
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/trajectory" && req.method === "GET") {
      const context = extractRecord({
        benchmark: requestUrl.searchParams.get("benchmark") ?? undefined,
        task_id:
          requestUrl.searchParams.get("task_id") ??
          requestUrl.searchParams.get("taskId") ??
          undefined,
      });
      const taskId = extractTaskId(context);
      const benchmark = extractBenchmarkName(context);
      const session =
        resolveSession(taskId, benchmark, false) ??
        activeSession ??
        resolveSession("default-task", "unknown", false);

      if (!session) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", steps: [], outbox: [] }));
        return;
      }

      const key = sessionKey(session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          benchmark: session.benchmark,
          task_id: session.taskId,
          room_id: session.roomId,
          relay_room_id: session.relayRoomId,
          steps: trajectoriesBySession.get(key) ?? [],
          outbox: outboxBySession.get(key) ?? [],
        }),
      );
      return;
    }

    if (
      await handleCuaRoute({
        pathname,
        req,
        res,
        getCuaService,
        activeSession,
      })
    ) {
      return;
    }

    if (pathname === "/api/benchmark/message" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body) as {
            text?: unknown;
            context?: unknown;
            image?: unknown;
          };

          const text =
            typeof parsed.text === "string" ? parsed.text.trim() : "";
          if (!text) {
            throw new Error(
              "Request body must include non-empty string `text`",
            );
          }

          const context = extractRecord(parsed.context);
          const taskId = extractTaskId(context);
          const benchmark = extractBenchmarkName(context);
          const session =
            resolveSession(taskId, benchmark, true) ??
            activeSession ??
            resolveSession("default-task", "unknown", true);
          if (!session) {
            throw new Error("Failed to resolve benchmark session");
          }
          const key = sessionKey(session);
          const trajectory = trajectoriesBySession.get(key) ?? [];
          const startedAt = Date.now();

          await ensureBenchmarkSessionContext(runtime, session);

          const benchmarkContext = normalizeBenchmarkContext(session, context);
          const composedPrompt = composeBenchmarkPrompt({
            text,
            context: benchmarkContext,
            image: parsed.image,
          });

          const incomingMessage: Memory = {
            id: stringToUuid(`benchmark-msg:${Date.now()}:${Math.random()}`),
            content: {
              text: composedPrompt,
              source: "benchmark",
              metadata: {
                benchmark: session.benchmark,
                taskId: session.taskId,
                ...(context ? { contextJson: JSON.stringify(context) } : {}),
              },
            },
            entityId: session.userEntityId,
            agentId: runtime.agentId,
            roomId: session.roomId,
            createdAt: Date.now(),
          };

          const callbackTexts: string[] = [];
          const callback = async (content: Content): Promise<Memory[]> => {
            if (
              typeof content.text === "string" &&
              content.text.trim().length > 0
            ) {
              callbackTexts.push(content.text.trim());
            }
            return [];
          };

          if (!runtime.messageService) {
            throw new Error("Runtime message service is not available");
          }

          clearCapturedAction();
          setBenchmarkContext(benchmarkContext);
          const result = await (async () => {
            try {
              return await runtime.messageService?.handleMessage(
                runtime,
                incomingMessage,
                callback,
              );
            } finally {
              setBenchmarkContext(null);
            }
          })();

          if (!result) throw new Error("Message service returned no result");

          const capturedAction = getCapturedAction();
          const responseText =
            typeof result.responseContent?.text === "string"
              ? result.responseContent.text
              : callbackTexts.join("\n\n");
          const thought =
            typeof result.responseContent?.thought === "string"
              ? result.responseContent.thought
              : null;
          const actionList = coerceActions(result.responseContent?.actions);
          const actions =
            actionList.length > 0
              ? actionList
              : capturedAction
                ? ["BENCHMARK_ACTION"]
                : [];
          const parsedParams = coerceParams(result.responseContent?.params);
          const params =
            Object.keys(parsedParams).length > 0
              ? parsedParams
              : capturedActionToParams(capturedAction);
          const finishedAt = Date.now();

          trajectory.push({
            step: trajectory.length + 1,
            startedAt,
            finishedAt,
            inputText: text,
            promptText: composedPrompt,
            context,
            thought,
            responseText,
            actions,
            params,
          });
          trajectoriesBySession.set(key, trajectory);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              text: responseText,
              thought,
              actions,
              params,
              benchmark: session.benchmark,
              task_id: session.taskId,
              room_id: session.roomId,
              trajectory_step: trajectory.length,
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorDetail =
            err instanceof Error && err.stack
              ? err.stack
              : formatUnknownError(err);
          elizaLogger.error(`[bench] Request error: ${errorDetail}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, host, () => {
    elizaLogger.info(
      `[bench] Milady benchmark server listening on ${host}:${port}`,
    );
    console.log(`MILADY_BENCH_READY host=${host} port=${port}`);
  });
}

startBenchmarkServer().catch((err) => {
  console.error("Failed to start benchmark server:", err);
  process.exit(1);
});
