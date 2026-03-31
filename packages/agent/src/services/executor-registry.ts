import { TaskExecutorRegistry } from "./task-executor";
import { CodingTaskExecutor } from "./coding-task-executor";
import { ResearchTaskExecutor } from "./research-task-executor";

/** Create a registry pre-populated with all built-in executors */
export function createDefaultExecutorRegistry(): TaskExecutorRegistry {
  const registry = new TaskExecutorRegistry();
  registry.register(new CodingTaskExecutor());
  registry.register(new ResearchTaskExecutor());
  return registry;
}
