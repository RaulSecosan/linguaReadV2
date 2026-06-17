import { spawn } from "node:child_process";

const commands = [
  { name: "api", args: ["--prefix", "server", "run", "dev"] },
  { name: "web", args: ["--prefix", "client", "run", "dev", "--", "--host", "0.0.0.0"] },
];

let shuttingDown = false;

const children = commands.map(({ name, args }) => {
  const child = spawn("npm", args, { stdio: ["inherit", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => process.stdout.write(prefix(name, chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix(name, chunk)));
  child.on("exit", (code) => {
    if (code && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code) {
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 250);
}

function prefix(name, chunk) {
  return chunk
    .toString()
    .split(/\n/)
    .map((line, index, list) => (index === list.length - 1 && line === "" ? "" : `[${name}] ${line}`))
    .join("\n");
}
