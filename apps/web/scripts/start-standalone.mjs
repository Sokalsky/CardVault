import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const packageRoot = process.cwd();
const candidates = [
  path.join(packageRoot, ".next", "standalone", "server.js"),
  path.join(packageRoot, ".next", "standalone", "apps", "web", "server.js"),
];
const server = candidates.find(existsSync);
if (!server) throw new Error("Standalone build not found. Run npm run build first.");

const serverRoot = path.dirname(server);
const staticSource = path.join(packageRoot, ".next", "static");
const publicSource = path.join(packageRoot, "public");
if (existsSync(staticSource)) cpSync(staticSource, path.join(serverRoot, ".next", "static"), { recursive: true });
if (existsSync(publicSource)) cpSync(publicSource, path.join(serverRoot, "public"), { recursive: true });

const portFlag = process.argv.findIndex((argument) => argument === "--port" || argument === "-p");
const port = portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT;
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: { ...process.env, ...(port ? { PORT: port } : {}) },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exitCode = signal ? 1 : (code ?? 1));
