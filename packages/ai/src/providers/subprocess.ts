type ChildProcessModule = typeof import("node:child_process");
type Spawn = ChildProcessModule["spawn"];

export const runtimeSpawn = ((...args: Parameters<Spawn>) => {
  const { spawn } = process.getBuiltinModule(
    "node:child_process",
  ) as ChildProcessModule;
  return spawn(...args);
}) as Spawn;
