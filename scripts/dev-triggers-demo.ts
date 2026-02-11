import crypto from "node:crypto";
import { startApiServer } from "../src/api/server.js";

const port = 31337;
let tasks: Record<string, unknown>[] = [];
const rt = {
  agentId: "00000000-0000-0000-0000-000000000001",
  character: { name: "TriggerDemo" },
  getSetting: () => undefined,
  enableAutonomy: true,
  getService: (t: string) =>
    t === "AUTONOMY"
      ? {
          getAutonomousRoomId: () => "00000000-0000-0000-0000-000000000201",
          injectAutonomousInstruction: async (p: { instructions: string }) => {
            console.log("[demo] injected:", p.instructions.slice(0, 80));
          },
          isLoopRunning: () => false,
          enableAutonomy: async () => {},
          disableAutonomy: async () => {},
        }
      : null,
  getTasks: async (q?: { tags?: string[] }) =>
    !q?.tags?.length
      ? tasks
      : tasks.filter((t) =>
          q.tags?.every((tag) => (t.tags as string[])?.includes(tag)),
        ),
  getTask: async (id: string) => tasks.find((t) => t.id === id) ?? null,
  createTask: async (task: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    tasks.push({ ...task, id });
    return id;
  },
  updateTask: async (id: string, u: Record<string, unknown>) => {
    tasks = tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            ...u,
            metadata: {
              ...((t.metadata as object) ?? {}),
              ...((u.metadata as object) ?? {}),
            },
          }
        : t,
    );
  },
  deleteTask: async (id: string) => {
    tasks = tasks.filter((t) => t.id !== id);
  },
  createMemory: async () => {},
  getTaskWorker: () => null,
  registerTaskWorker: () => {},
  getRoomsByWorld: async () => [],
  getMemories: async () => [],
  getCache: async () => null,
  setCache: async () => {},
  logger: {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: () => {},
  },
};
const s = await startApiServer({ port, runtime: rt as never });
console.log(`[demo] API on http://localhost:${s.port}`);
