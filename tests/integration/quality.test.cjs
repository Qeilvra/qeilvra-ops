const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ESLint } = require("eslint");
const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs");

const workspaceRoot = path.resolve(__dirname, "../..");
const eslint = new ESLint({ cwd: workspaceRoot, cache: false });
const serverFile = "packages/config/src/index.ts";
const uiFile = "packages/ui/src/index.tsx";
const webFile = "apps/web/src/app/page.tsx";
const contractsFile = "packages/contracts/src/index.ts";
const adapterFile = "apps/web/src/config/client.ts";
const nextConfigFile = "apps/web/next.config.ts";
const pureConfigFiles = ["packages/config/src/client.ts", "packages/config/src/validation.ts"];

async function messagesFor(file, source) {
  // Real project paths give these in-memory examples the same types and rules as application code.
  const results = await eslint.lintText(source, { filePath: path.join(workspaceRoot, file) });
  assert.equal(results.length, 1, `${file} must be covered by linting`);
  const messages = results[0].messages;
  assert.ok(!messages.some((message) => message.fatal), JSON.stringify(messages));
  return messages;
}

async function rejects(file, source, ...rules) {
  const messages = await messagesFor(file, source);
  for (const rule of rules) {
    assert.ok(
      messages.some((message) => message.ruleId === rule),
      JSON.stringify(messages),
    );
  }
}

async function accepts(file, source) {
  assert.deepEqual(await messagesFor(file, source), []);
}

async function rejectsBoundary(file, source) {
  const messages = await messagesFor(file, source);
  assert.ok(
    messages.some(
      (message) =>
        message.ruleId === "no-restricted-imports" ||
        message.ruleId === "airmech/package-boundaries",
    ),
    JSON.stringify(messages),
  );
}

test("asynchronous work must handle failures and use callbacks that await their work", async () => {
  await rejects(
    serverFile,
    'export function schedule(): void { Promise.resolve("ready"); }',
    "@typescript-eslint/no-floating-promises",
  );
  await rejects(
    serverFile,
    'export function schedule(): void { void Promise.reject(new Error("failed")); }',
    "@typescript-eslint/no-floating-promises",
  );
  await rejects(
    serverFile,
    "export function schedule(): void { [1].forEach(async (value) => { await Promise.resolve(value); }); }",
    "@typescript-eslint/no-misused-promises",
  );
  await rejects(
    serverFile,
    "export async function readAmount(): Promise<number> { return await 42; }",
    "@typescript-eslint/await-thenable",
  );
  await accepts(
    serverFile,
    "export async function schedule(): Promise<void> { for (const value of [1]) { await Promise.resolve(value); } }",
  );
  await accepts(
    serverFile,
    'export function schedule(): void { Promise.resolve("ready").catch((error: unknown) => { console.error(error); }); }',
  );
});

test("untrusted JSON must be narrowed before its values reach typed application code", async () => {
  await rejects(
    serverFile,
    "export function readAmount(payload: string): number { const value = JSON.parse(payload); return value.amount; }",
    "@typescript-eslint/no-unsafe-assignment",
    "@typescript-eslint/no-unsafe-member-access",
    "@typescript-eslint/no-unsafe-return",
  );
  await rejects(
    serverFile,
    "function acceptAmount(value: number): number { return value; } export function readAmount(payload: string): number { const value = JSON.parse(payload); return acceptAmount(value.amount); }",
    "@typescript-eslint/no-unsafe-argument",
  );
  await rejects(
    serverFile,
    "export function normalize(payload: string): string { const value = JSON.parse(payload); return value.normalize(); }",
    "@typescript-eslint/no-unsafe-call",
  );
  await accepts(
    serverFile,
    `export function readAmount(payload: string): number {
      const value: unknown = JSON.parse(payload);
      if (typeof value !== "object" || value === null || !("amount" in value) || typeof value.amount !== "number") {
        throw new Error("Invalid amount");
      }
      return value.amount;
    }`,
  );
});

test("debugging leftovers, unused imports, and explicit any cannot enter production source", async () => {
  await rejects(
    serverFile,
    "export function identity(value: any): unknown { return value; }",
    "@typescript-eslint/no-explicit-any",
  );
  await rejects(serverFile, "export function inspect(): void { debugger; }", "no-debugger");
  await rejects(
    serverFile,
    'import { randomUUID } from "node:crypto"; export const ready = true;',
    "@typescript-eslint/no-unused-vars",
  );
});

test("React hooks preserve call order and track the values used by effects", async () => {
  await rejects(
    uiFile,
    `import { useState } from "react";
     export function Probe({ enabled }: { enabled: boolean }) {
       if (enabled) { const [value] = useState(0); return <span>{value}</span>; }
       return null;
     }`,
    "react-hooks/rules-of-hooks",
  );
  await rejects(
    uiFile,
    `import { useEffect } from "react";
     export function Probe({ label }: { label: string }) {
       useEffect(() => { document.title = label; }, []);
       return <span>{label}</span>;
     }`,
    "react-hooks/exhaustive-deps",
  );
  await accepts(
    uiFile,
    `import { useEffect } from "react";
     export function Probe({ label }: { label: string }) {
       useEffect(() => { document.title = label; }, [label]);
       return <span>{label}</span>;
     }`,
  );
});

test("Next.js discovers app roots and rejects invalid client components, scripts, and internal links", async () => {
  const configuration = await eslint.calculateConfigForFile(path.join(workspaceRoot, webFile));
  const roots = getRootDirs({ cwd: workspaceRoot, settings: configuration.settings });
  assert.deepEqual(roots.map((root) => path.resolve(root)).sort(), [
    path.join(workspaceRoot, "apps/web"),
  ]);
  const scopedRootProbe = spawnSync(
    process.execPath,
    [
      "-e",
      `const assert = require("node:assert/strict");
       const path = require("node:path");
       const { getRootDirs } = require(${JSON.stringify(require.resolve("@next/eslint-plugin-next/dist/utils/get-root-dirs"))});
       const roots = getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: process.cwd() } } });
       assert.deepEqual(roots.map((root) => path.resolve(root)), [process.cwd()]);`,
    ],
    {
      cwd: path.join(workspaceRoot, "apps/web"),
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    },
  );
  assert.equal(scopedRootProbe.error, undefined);
  assert.equal(scopedRootProbe.status, 0, scopedRootProbe.stderr);
  await rejects(
    webFile,
    '"use client"; export default async function Page() { await Promise.resolve(); return <main>Ready</main>; }',
    "@next/next/no-async-client-component",
  );
  await rejects(
    webFile,
    'export default function Page() { return <script src="/startup.js" />; }',
    "@next/next/no-sync-scripts",
  );
  await rejects(
    webFile,
    'export default function Page() { return <a href="/">Home</a>; }',
    "@next/next/no-html-link-for-pages",
  );
  await accepts(
    webFile,
    '"use client"; export default function Page() { return <main>Ready</main>; }',
  );
});

test("browser and UI code cannot reach database or server implementations through alternative imports", async () => {
  for (const file of [webFile, uiFile]) {
    await rejectsBoundary(file, 'import "@airmech/database";');
    await rejectsBoundary(file, 'import "@airmech/database/private";');
    for (const source of [
      "@airmech/config",
      "@airmech/config/server",
      "@airmech/config/client/private",
      "@airmech/config/server/private",
    ]) {
      await rejectsBoundary(file, `import "${source}";`);
    }
    await accepts(file, 'import "@airmech/config/client"; export {};');
    await rejectsBoundary(
      file,
      'export async function loadDatabase() { return await import("@airmech/database"); }',
    );
    await rejectsBoundary(
      file,
      "export async function loadDatabase() { return await import(`@airmech/database`); }",
    );
    await rejectsBoundary(file, 'import "@airmech/api";');
    await rejectsBoundary(
      file,
      'export async function loadWorker() { return await import("@airmech/worker"); }',
    );
  }
  await rejectsBoundary(webFile, 'import "../../../../packages/database/src/index";');
  await rejectsBoundary(uiFile, 'import "../../database/src/index";');
  await rejectsBoundary(webFile, 'import "../../../api/src/application.js";');
  await rejectsBoundary(
    uiFile,
    'export async function loadApi() { return await import("../../../apps/api/src/application.js"); }',
  );
  await accepts(
    webFile,
    'import "@airmech/ui/styles.css"; export default function Page() { return <main>Ready</main>; }',
  );
  await accepts(
    webFile,
    'import "@/components/startup-frame"; export default function Page() { return <main>Ready</main>; }',
  );
  await accepts(nextConfigFile, 'import "@airmech/config/server"; export {};');
  await rejectsBoundary(nextConfigFile, 'import "@airmech/config";');
  await rejectsBoundary(nextConfigFile, 'import "../../packages/config/src/server";');
  await rejectsBoundary(webFile, 'import "../../../../packages/config/src/client";');
  await rejectsBoundary(uiFile, 'import "../../config/src/client";');
  for (const file of [webFile, uiFile, "apps/api/src/main.ts", "apps/worker/src/main.ts"]) {
    await rejects(
      file,
      "export const environment = process.env;",
      "airmech/centralized-environment",
    );
    await rejects(file, "export const { NODE_ENV } = process;", "airmech/centralized-environment");
  }
  await accepts(adapterFile, "export const appName = process.env.NEXT_PUBLIC_APP_NAME;");
  await accepts(nextConfigFile, 'process.env.NEXT_PUBLIC_APP_NAME = "Airmech One"; export {};');
  await accepts("apps/api/src/main.ts", "export function stop(): void { process.exitCode = 0; }");
  for (const source of [
    "export const secret = process.env.AUTH_SECRET;",
    "export const environment = process.env;",
    "export const settings = { ...process.env };",
    "export const { NEXT_PUBLIC_APP_NAME } = process.env;",
    'export const appName = process.env["NEXT_PUBLIC_APP_NAME"];',
    'export const appName = process["env"].NEXT_PUBLIC_APP_NAME;',
    "export function read(key: string) { return process.env[key]; }",
    "export const appName = process.env.NEXT_PUBLIC_OTHER;",
    "export const workingDirectory = process.cwd();",
    "export const environment = globalThis.process.env;",
    'process.env.NEXT_PUBLIC_APP_NAME = "Airmech One"; export {};',
  ]) {
    await rejects(adapterFile, source, "airmech/centralized-environment");
  }
  for (const source of [
    "export const appName = process.env.NEXT_PUBLIC_APP_NAME;",
    'process.env.AUTH_SECRET = "invalid"; export {};',
    'process.env["NEXT_PUBLIC_APP_NAME"] = "Airmech One"; export {};',
    'process.env.NEXT_PUBLIC_APP_NAME += " suffix"; export {};',
  ]) {
    await rejects(nextConfigFile, source, "airmech/centralized-environment");
  }
});

test("shared contracts stay transport-safe instead of importing application or Node implementations", async () => {
  await rejectsBoundary(contractsFile, 'import "../../../apps/api/src/application.js";');
  await rejectsBoundary(
    contractsFile,
    'export async function loadApi() { return await import("../../../apps/api/src/application.js"); }',
  );
  await rejectsBoundary(contractsFile, 'import "node:fs";');
  await rejectsBoundary(contractsFile, 'import "@airmech/config/client";');
  await accepts(
    contractsFile,
    'export interface ProbeResponse { readonly status: "ok"; readonly message: string; }',
  );
  for (const file of pureConfigFiles) {
    for (const source of [
      "node:fs",
      "@airmech/config/server",
      "@airmech/config",
      "./server",
      "./runtime",
      "./index",
    ]) {
      await rejectsBoundary(file, `import "${source}";`);
    }
    await rejects(
      file,
      "export const environment = process.env;",
      "airmech/centralized-environment",
      "no-restricted-globals",
    );
    await accepts(file, 'import "./validation"; export {};');
  }
});
