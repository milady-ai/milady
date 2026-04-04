import type http from "node:http";
import { logger, type AgentRuntime, stringToUuid, type Task, type UUID } from "@elizaos/core";
import type { LifeOpsOverview } from "../contracts/lifeops.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import { WORKBENCH_TASK_TAG, WORKBENCH_TODO_TAG } from "./workbench-helpers.js";
import { LifeOpsService } from "../lifeops/service.js";

interface WorkbenchTaskView {
  id: string;
  name: string;
  description: string;
  tags: string[];
  isCompleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface WorkbenchTodoView {
  id: string;
  name: string;
  description: string;
  priority: number | null;
  isUrgent: boolean;
  type: string;
  isCompleted: boolean;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface TodoDataServiceLike {
  getTodos: (filter: { agentId: string }) => Promise<unknown[]>;
  getTodo: (id: string) => Promise<unknown | null>;
  createTodo: (data: Record<string, unknown>) => Promise<string>;
  updateTodo: (
    id: string,
    data: Record<string, unknown>,
  ) => Promise<unknown | false>;
  deleteTodo: (id: string) => Promise<unknown | false>;
}

export interface WorkbenchRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  state: {
    runtime: AgentRuntime | null;
    adminEntityId: UUID | null;
  };
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
  // Helpers from server.ts
  toWorkbenchTask: (task: Task) => WorkbenchTaskView | null;
  toWorkbenchTodo: (task: Task) => WorkbenchTodoView | null;
  toWorkbenchTodoFromRecord: (record: unknown) => WorkbenchTodoView | null;
  getTodoDataService: (runtime: AgentRuntime) => Promise<TodoDataServiceLike | null>;
  recordTodoDbFailure: (runtime: AgentRuntime, operation: string, err: unknown) => void;
  normalizeTags: (value: unknown, required?: string[]) => string[];
  readTaskMetadata: (task: Task) => Record<string, unknown>;
  readTaskCompleted: (task: Task) => boolean;
  parseNullableNumber: (value: unknown) => number | null;
  asObject: (value: unknown) => Record<string, unknown> | null;
  decodePathComponent: (
    raw: string,
    res: http.ServerResponse,
    label: string,
  ) => string | null;
  taskToTriggerSummary: (task: Task) => unknown;
  listTriggerTasks: (runtime: AgentRuntime) => Promise<Task[]>;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function handleWorkbenchRoutes(
  ctx: WorkbenchRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    state,
    json,
    error,
    readJsonBody,
  } = ctx;

  // ── GET /api/workbench/overview ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/overview") {
    const tasks: WorkbenchTaskView[] = [];
    const triggers: Array<NonNullable<ReturnType<typeof ctx.taskToTriggerSummary>>> = [];
    const todos: WorkbenchTodoView[] = [];
    const summary = {
      totalTasks: 0,
      completedTasks: 0,
      totalTriggers: 0,
      activeTriggers: 0,
      totalTodos: 0,
      completedTodos: 0,
    };

    let tasksAvailable = false;
    let triggersAvailable = false;
    let todosAvailable = false;
    let lifeopsAvailable = false;
    let lifeops: LifeOpsOverview | null = null;
    let runtimeTasks: Task[] = [];
    let todoData: TodoDataServiceLike | null = null;

    if (state.runtime) {
      try {
        runtimeTasks = await state.runtime.getTasks({});
        tasksAvailable = true;
        todosAvailable = true;

        for (const task of runtimeTasks) {
          const todo = ctx.toWorkbenchTodo(task);
          if (todo) {
            todos.push(todo);
            continue;
          }
          const mappedTask = ctx.toWorkbenchTask(task);
          if (mappedTask) {
            tasks.push(mappedTask);
          }
        }
      } catch {
        tasksAvailable = false;
        todosAvailable = false;
      }

      try {
        todoData = await ctx.getTodoDataService(state.runtime);
        if (todoData) {
          const dbTodos = await todoData.getTodos({
            agentId: state.runtime.agentId as string,
          });
          todosAvailable = true;
          for (const rawTodo of dbTodos) {
            const mapped = ctx.toWorkbenchTodoFromRecord(rawTodo);
            if (mapped) {
              todos.push(mapped);
            }
          }
        }
      } catch (err) {
        if (todoData) {
          ctx.recordTodoDbFailure(state.runtime, "overview.getTodos", err);
        }
      }

      try {
        lifeops = await new LifeOpsService(state.runtime).getOverview();
        lifeopsAvailable = true;
      } catch {
        lifeopsAvailable = false;
      }

      try {
        const triggerTasks = await ctx.listTriggerTasks(state.runtime);
        triggersAvailable = true;
        for (const task of triggerTasks) {
          const summaryItem = ctx.taskToTriggerSummary(task);
          if (summaryItem) {
            triggers.push(summaryItem as NonNullable<typeof summaryItem>);
          }
        }
      } catch {
        if (tasksAvailable) {
          triggersAvailable = true;
          for (const task of runtimeTasks) {
            const summaryItem = ctx.taskToTriggerSummary(task);
            if (summaryItem) {
              triggers.push(summaryItem as NonNullable<typeof summaryItem>);
            }
          }
        }
      }
    }

    if (todos.length > 1) {
      const dedupedTodos = new Map<string, WorkbenchTodoView>();
      for (const todo of todos) {
        dedupedTodos.set(todo.id, todo);
      }
      todos.length = 0;
      todos.push(...dedupedTodos.values());
    }

    tasks.sort((a, b) => a.name.localeCompare(b.name));
    todos.sort((a, b) => a.name.localeCompare(b.name));
    triggers.sort((a: any, b: any) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
    summary.totalTasks = tasks.length;
    summary.completedTasks = tasks.filter((task) => task.isCompleted).length;
    summary.totalTriggers = triggers.length;
    summary.activeTriggers = triggers.filter((trigger: any) => trigger.enabled).length;
    summary.totalTodos = todos.length;
    summary.completedTodos = todos.filter((todo) => todo.isCompleted).length;

    json(res, {
      tasks,
      triggers,
      todos,
      summary,
      ...(lifeops ? { lifeops } : {}),
      tasksAvailable,
      triggersAvailable,
      todosAvailable,
      lifeopsAvailable,
    });
    return true;
  }

  // ── GET /api/workbench/tasks ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/tasks") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const runtimeTasks = await state.runtime.getTasks({});
    const tasks = runtimeTasks
      .map((task) => ctx.toWorkbenchTask(task))
      .filter((task): task is WorkbenchTaskView => task !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    json(res, { tasks });
    return true;
  }

  // ── POST /api/workbench/tasks ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/tasks") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const body = await readJsonBody<{
      name?: string;
      description?: string;
      tags?: string[];
      isCompleted?: boolean;
    }>(req, res);
    if (!body) return true;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      error(res, "name is required", 400);
      return true;
    }
    const description =
      typeof body.description === "string" ? body.description : "";
    const isCompleted = body.isCompleted === true;
    const metadata = {
      isCompleted,
      workbench: { kind: "task" },
    };
    const taskId = await state.runtime.createTask({
      name,
      description,
      tags: ctx.normalizeTags(body.tags, [WORKBENCH_TASK_TAG]),
      metadata,
    });
    const created = await state.runtime.getTask(taskId);
    const task = created ? ctx.toWorkbenchTask(created) : null;
    if (!task) {
      error(res, "Task created but unavailable", 500);
      return true;
    }
    json(res, { task }, 201);
    return true;
  }

  // ── GET/PUT/DELETE /api/workbench/tasks/:id ─────────────────────────
  const taskItemMatch = /^\/api\/workbench\/tasks\/([^/]+)$/.exec(pathname);
  if (taskItemMatch && ["GET", "PUT", "DELETE"].includes(method)) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const decodedTaskId = ctx.decodePathComponent(taskItemMatch[1], res, "task id");
    if (!decodedTaskId) return true;
    const task = await state.runtime.getTask(decodedTaskId as UUID);
    const taskView = task ? ctx.toWorkbenchTask(task) : null;
    if (!task || !taskView || !task.id) {
      error(res, "Task not found", 404);
      return true;
    }

    if (method === "GET") {
      json(res, { task: taskView });
      return true;
    }

    if (method === "DELETE") {
      await state.runtime.deleteTask(task.id);
      json(res, { ok: true });
      return true;
    }

    const body = await readJsonBody<{
      name?: string;
      description?: string;
      tags?: string[];
      isCompleted?: boolean;
    }>(req, res);
    if (!body) return true;

    const update: Partial<Task> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        error(res, "name cannot be empty", 400);
        return true;
      }
      update.name = name;
    }
    if (typeof body.description === "string") {
      update.description = body.description;
    }
    if (body.tags !== undefined) {
      update.tags = ctx.normalizeTags(body.tags, [WORKBENCH_TASK_TAG]);
    }
    if (typeof body.isCompleted === "boolean") {
      update.metadata = {
        ...ctx.readTaskMetadata(task),
        isCompleted: body.isCompleted,
      };
    }
    await state.runtime.updateTask(task.id, update);
    const refreshed = await state.runtime.getTask(task.id);
    const refreshedView = refreshed ? ctx.toWorkbenchTask(refreshed) : null;
    if (!refreshedView) {
      error(res, "Task updated but unavailable", 500);
      return true;
    }
    json(res, { task: refreshedView });
    return true;
  }

  // ── GET /api/workbench/todos ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/todos") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const runtimeTasks = await state.runtime.getTasks({});
    const todos = runtimeTasks
      .map((task) => ctx.toWorkbenchTodo(task))
      .filter((todo): todo is WorkbenchTodoView => todo !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    const todoData = await ctx.getTodoDataService(state.runtime);
    if (todoData) {
      try {
        const dbTodos = await todoData.getTodos({
          agentId: state.runtime.agentId as string,
        });
        for (const rawTodo of dbTodos) {
          const mapped = ctx.toWorkbenchTodoFromRecord(rawTodo);
          if (mapped) {
            const existingIndex = todos.findIndex(
              (todo) => todo.id === mapped.id,
            );
            if (existingIndex >= 0) {
              todos[existingIndex] = mapped;
            } else {
              todos.push(mapped);
            }
          }
        }
        todos.sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        ctx.recordTodoDbFailure(state.runtime, "todos.list", err);
      }
    }
    json(res, { todos });
    return true;
  }

  // ── POST /api/workbench/todos ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/todos") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const body = await readJsonBody<{
      name?: string;
      description?: string;
      priority?: number | string | null;
      isUrgent?: boolean;
      type?: string;
      isCompleted?: boolean;
      tags?: string[];
    }>(req, res);
    if (!body) return true;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      error(res, "name is required", 400);
      return true;
    }
    const description =
      typeof body.description === "string" ? body.description : "";
    const isCompleted = body.isCompleted === true;
    const priority = ctx.parseNullableNumber(body.priority);
    const isUrgent = body.isUrgent === true;
    const type =
      typeof body.type === "string" && body.type.trim().length > 0
        ? body.type.trim()
        : "task";

    const todoData = await ctx.getTodoDataService(state.runtime);
    if (todoData) {
      try {
        const now = Date.now();
        const roomId =
          (
            state.runtime.getService("AUTONOMY") as {
              getAutonomousRoomId?: () => UUID;
            } | null
          )?.getAutonomousRoomId?.() ??
          stringToUuid(`workbench-todo-room-${state.runtime.agentId}`);
        const worldId = stringToUuid(
          `workbench-todo-world-${state.runtime.agentId}`,
        );
        const entityId =
          state.adminEntityId ?? stringToUuid(`workbench-todo-entity-${now}`);
        const createdTodoId = await todoData.createTodo({
          agentId: state.runtime.agentId,
          worldId,
          roomId,
          entityId,
          name,
          description: description || name,
          type,
          priority: priority ?? undefined,
          isUrgent,
          metadata: {
            createdAt: new Date(now).toISOString(),
            source: "workbench-api",
          },
          tags: ctx.normalizeTags(body.tags, ["TODO"]),
        });
        const createdDbTodo = await todoData.getTodo(createdTodoId);
        const mappedDbTodo = createdDbTodo
          ? ctx.toWorkbenchTodoFromRecord(createdDbTodo)
          : null;
        if (mappedDbTodo) {
          json(res, { todo: mappedDbTodo }, 201);
          return true;
        }
      } catch (err) {
        ctx.recordTodoDbFailure(state.runtime, "todos.create", err);
      }
    }

    const metadata = {
      isCompleted,
      workbenchTodo: {
        description,
        priority,
        isUrgent,
        isCompleted,
        type,
      },
    };
    const taskId = await state.runtime.createTask({
      name,
      description,
      tags: ctx.normalizeTags(body.tags, [WORKBENCH_TODO_TAG, "todo"]),
      metadata,
    });
    const created = await state.runtime.getTask(taskId);
    const todo = created ? ctx.toWorkbenchTodo(created) : null;
    if (!todo) {
      error(res, "Todo created but unavailable", 500);
      return true;
    }
    json(res, { todo }, 201);
    return true;
  }

  // ── POST /api/workbench/todos/:id/complete ──────────────────────────
  const todoCompleteMatch = /^\/api\/workbench\/todos\/([^/]+)\/complete$/.exec(
    pathname,
  );
  if (method === "POST" && todoCompleteMatch) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const decodedTodoId = ctx.decodePathComponent(
      todoCompleteMatch[1],
      res,
      "todo id",
    );
    if (!decodedTodoId) return true;
    const body = await readJsonBody<{ isCompleted?: boolean }>(req, res);
    if (!body) return true;
    const isCompleted = body.isCompleted === true;
    const todoData = await ctx.getTodoDataService(state.runtime);
    if (todoData) {
      try {
        const updated = await todoData.updateTodo(decodedTodoId, {
          isCompleted,
          completedAt: isCompleted ? new Date() : null,
        });
        if (updated !== false) {
          json(res, { ok: true });
          return true;
        }
      } catch (err) {
        ctx.recordTodoDbFailure(state.runtime, "todos.complete", err);
      }
    }
    const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
    if (!todoTask || !todoTask.id || !ctx.toWorkbenchTodo(todoTask)) {
      error(res, "Todo not found", 404);
      return true;
    }
    const metadata = ctx.readTaskMetadata(todoTask);
    const todoMeta =
      ctx.asObject(metadata.workbenchTodo) ?? ctx.asObject(metadata.todo) ?? {};
    await state.runtime.updateTask(todoTask.id, {
      metadata: {
        ...metadata,
        isCompleted,
        workbenchTodo: {
          ...todoMeta,
          isCompleted,
        },
      },
    });
    json(res, { ok: true });
    return true;
  }

  // ── GET/PUT/DELETE /api/workbench/todos/:id ──────────────────────────
  const todoItemMatch = /^\/api\/workbench\/todos\/([^/]+)$/.exec(pathname);
  if (todoItemMatch && ["GET", "PUT", "DELETE"].includes(method)) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return true;
    }
    const decodedTodoId = ctx.decodePathComponent(todoItemMatch[1], res, "todo id");
    if (!decodedTodoId) return true;
    const todoData = await ctx.getTodoDataService(state.runtime);

    if (method === "GET" && todoData) {
      try {
        const dbTodo = await todoData.getTodo(decodedTodoId);
        const mapped = dbTodo ? ctx.toWorkbenchTodoFromRecord(dbTodo) : null;
        if (mapped) {
          json(res, { todo: mapped });
          return true;
        }
      } catch (err) {
        ctx.recordTodoDbFailure(state.runtime, "todos.get", err);
      }
    }

    if (method === "GET") {
      const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
      const todoView = todoTask ? ctx.toWorkbenchTodo(todoTask) : null;
      if (!todoTask || !todoTask.id || !todoView) {
        error(res, "Todo not found", 404);
        return true;
      }
      json(res, { todo: todoView });
      return true;
    }

    if (method === "DELETE" && todoData) {
      try {
        const deleted = await todoData.deleteTodo(decodedTodoId);
        if (deleted !== false) {
          json(res, { ok: true });
          return true;
        }
      } catch (err) {
        ctx.recordTodoDbFailure(state.runtime, "todos.delete", err);
      }
    }

    if (method === "DELETE") {
      const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
      if (!todoTask?.id || !ctx.toWorkbenchTodo(todoTask)) {
        error(res, "Todo not found", 404);
        return true;
      }
      await state.runtime.deleteTask(todoTask.id);
      json(res, { ok: true });
      return true;
    }

    // PUT
    const body = await readJsonBody<{
      name?: string;
      description?: string;
      priority?: number | string | null;
      isUrgent?: boolean;
      type?: string;
      isCompleted?: boolean;
      tags?: string[];
    }>(req, res);
    if (!body) return true;

    if (todoData) {
      try {
        const updates: Record<string, unknown> = {};
        if (typeof body.name === "string") {
          const name = body.name.trim();
          if (!name) {
            error(res, "name cannot be empty", 400);
            return true;
          }
          updates.name = name;
        }
        if (typeof body.description === "string") {
          updates.description = body.description;
        }
        if (body.priority !== undefined) {
          updates.priority = ctx.parseNullableNumber(body.priority);
        }
        if (typeof body.isUrgent === "boolean") {
          updates.isUrgent = body.isUrgent;
        }
        if (typeof body.type === "string" && body.type.trim().length > 0) {
          updates.type = body.type.trim();
        }
        if (typeof body.isCompleted === "boolean") {
          updates.isCompleted = body.isCompleted;
          updates.completedAt = body.isCompleted ? new Date() : null;
        }
        const updated = await todoData.updateTodo(decodedTodoId, updates);
        if (updated === false) throw new Error("updateTodo returned false");
        const refreshedDbTodo = await todoData.getTodo(decodedTodoId);
        const refreshedMapped = refreshedDbTodo
          ? ctx.toWorkbenchTodoFromRecord(refreshedDbTodo)
          : null;
        if (refreshedMapped) {
          json(res, { todo: refreshedMapped });
          return true;
        }
      } catch (err) {
        ctx.recordTodoDbFailure(state.runtime, "todos.update", err);
      }
    }

    const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
    const todoView = todoTask ? ctx.toWorkbenchTodo(todoTask) : null;
    if (!todoTask || !todoTask.id || !todoView) {
      error(res, "Todo not found", 404);
      return true;
    }

    const update: Partial<Task> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        error(res, "name cannot be empty", 400);
        return true;
      }
      update.name = name;
    }
    if (typeof body.description === "string") {
      update.description = body.description;
    }
    if (body.tags !== undefined) {
      update.tags = ctx.normalizeTags(body.tags, [WORKBENCH_TODO_TAG, "todo"]);
    }

    const metadata = ctx.readTaskMetadata(todoTask);
    const existingTodoMeta =
      ctx.asObject(metadata.workbenchTodo) ?? ctx.asObject(metadata.todo) ?? {};
    const nextTodoMeta: Record<string, unknown> = {
      ...existingTodoMeta,
    };
    if (typeof body.description === "string") {
      nextTodoMeta.description = body.description;
    }
    if (body.priority !== undefined) {
      nextTodoMeta.priority = ctx.parseNullableNumber(body.priority);
    }
    if (typeof body.isUrgent === "boolean") {
      nextTodoMeta.isUrgent = body.isUrgent;
    }
    if (typeof body.type === "string" && body.type.trim().length > 0) {
      nextTodoMeta.type = body.type.trim();
    }

    let isCompleted = ctx.readTaskCompleted(todoTask);
    if (typeof body.isCompleted === "boolean") {
      isCompleted = body.isCompleted;
    }
    nextTodoMeta.isCompleted = isCompleted;
    update.metadata = {
      ...metadata,
      isCompleted,
      workbenchTodo: nextTodoMeta,
    };

    await state.runtime.updateTask(todoTask.id, update);
    const refreshed = await state.runtime.getTask(todoTask.id);
    const refreshedTodo = refreshed ? ctx.toWorkbenchTodo(refreshed) : null;
    if (!refreshedTodo) {
      error(res, "Todo updated but unavailable", 500);
      return true;
    }
    json(res, { todo: refreshedTodo });
    return true;
  }

  return false;
}
