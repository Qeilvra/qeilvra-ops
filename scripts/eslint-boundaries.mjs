import { builtinModules } from "node:module";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const nodeModules = new Set(builtinModules);
const browserForbidden = new Set([
  "database",
  "queue",
  "storage",
  "identity",
  "config",
  "testing",
  "api",
  "worker",
]);
const contractForbidden = new Set([...browserForbidden, "ui"]);
const clientConfigFiles = new Set([
  "packages/config/src/client.ts",
  "packages/config/src/validation.ts",
]);
const browserAdapter = "apps/web/src/config/client.ts";
const nextConfiguration = "apps/web/next.config.ts";

function workspacePath(filename) {
  return path.relative(workspaceRoot, filename).split(path.sep).join("/");
}

function packageName(source) {
  return source.startsWith("@airmech/") ? source.split("/")[1] : undefined;
}

function isForbidden(source, filename) {
  const owner = workspacePath(filename);
  const web = owner.startsWith("apps/web/");
  const ui = owner.startsWith("packages/ui/");
  const contracts = owner.startsWith("packages/contracts/");
  const config = owner.startsWith("packages/config/");
  if (!web && !ui && !contracts && !config) return false;

  if (clientConfigFiles.has(owner)) {
    if (!source.startsWith(".")) return true;
    const target = workspacePath(path.resolve(path.dirname(filename), source)).replace(
      /\.[cm]?[jt]sx?$/,
      "",
    );
    return !["packages/config/src/client", "packages/config/src/validation"].includes(target);
  }

  if (
    (source === "@airmech/config/client" &&
      (owner.startsWith("apps/web/src/") || owner.startsWith("packages/ui/src/"))) ||
    (source === "@airmech/config/server" && owner === nextConfiguration)
  ) {
    return false;
  }

  const importedPackage = packageName(source);
  if ((web || ui) && browserForbidden.has(importedPackage)) return true;
  if (contracts && contractForbidden.has(importedPackage)) return true;
  if (
    config &&
    ["database", "queue", "storage", "identity", "ui", "api", "worker"].includes(importedPackage)
  )
    return true;

  if (web || ui || contracts) {
    if (source.startsWith("node:") || nodeModules.has(source) || source.startsWith("@nestjs/")) {
      return true;
    }
    if (/^(pg|@prisma\/client|bullmq|ioredis|@supabase\/supabase-js)(\/|$)/.test(source))
      return true;
  }
  if (contracts && /^(next|react|react-dom)(\/|$)/.test(source)) return true;

  let resolved;
  if (source.startsWith(".") || path.isAbsolute(source)) {
    resolved = path.resolve(path.dirname(filename), source);
  } else if (web && source.startsWith("@/")) {
    resolved = path.resolve(workspaceRoot, "apps/web/src", source.slice(2));
  } else {
    return false;
  }

  const target = workspacePath(resolved);
  const inPackage = (name) =>
    target === `packages/${name}` || target.startsWith(`packages/${name}/`);
  if ((web || ui || contracts || config) && inPackage("database")) return true;
  if ((web || ui || contracts || config) && (inPackage("queue") || inPackage("storage")))
    return true;
  if ((web || ui || contracts || config) && inPackage("identity")) return true;
  if ((web || ui || contracts) && (inPackage("config") || inPackage("testing"))) return true;
  if ((contracts || config) && inPackage("ui")) return true;
  if ((ui || contracts || config) && target.startsWith("apps/")) return true;
  return web && /^apps\/(api|worker)(\/|$)/.test(target);
}

// Complements core static-import restrictions with literal dynamic imports,
// CommonJS loads, and resolved relative paths. It performs no filesystem scans.
export const boundaryRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: { forbidden: "Import '{{source}}' crosses this package's architecture boundary." },
  },
  create(context) {
    function check(sourceNode) {
      const source =
        sourceNode?.type === "TemplateLiteral" && sourceNode.expressions.length === 0
          ? sourceNode.quasis[0]?.value.cooked
          : sourceNode?.value;
      if (typeof source === "string" && isForbidden(source, context.filename)) {
        context.report({ node: sourceNode, messageId: "forbidden", data: { source } });
      }
    }
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          check(node.arguments[0]);
        }
      },
    };
  },
};

function memberName(node) {
  if (node.type !== "MemberExpression") return undefined;
  return node.computed
    ? node.property.type === "Literal"
      ? node.property.value
      : undefined
    : node.property.name;
}

function isPublicAccess(node, owner) {
  const environment = node.parent;
  const setting = environment?.parent;
  if (
    node.type !== "Identifier" ||
    node.name !== "process" ||
    environment?.type !== "MemberExpression" ||
    environment.object !== node ||
    environment.computed ||
    environment.optional ||
    memberName(environment) !== "env" ||
    setting?.type !== "MemberExpression" ||
    setting.object !== environment ||
    setting.computed ||
    setting.optional ||
    memberName(setting) !== "NEXT_PUBLIC_APP_NAME"
  ) {
    return false;
  }

  const use = setting.parent;
  if (owner === nextConfiguration) {
    return use?.type === "AssignmentExpression" && use.left === setting && use.operator === "=";
  }
  return (
    owner === browserAdapter &&
    !(use?.type === "AssignmentExpression" && use.left === setting) &&
    use?.type !== "UpdateExpression" &&
    !(use?.type === "UnaryExpression" && use.operator === "delete")
  );
}

// Runtime environment values enter applications through validated configuration.
// The two literal public-name accesses are the explicit Next.js build-time bridge.
export const environmentRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      centralized:
        "Read runtime environment through @airmech/config. Only the literal public app-name bridge is permitted here.",
    },
  },
  create(context) {
    const owner = workspacePath(context.filename);
    const pureClientConfig = clientConfigFiles.has(owner);
    const productionSource = /^(apps|packages)\/[^/]+\/src\//.test(owner);
    if (
      (!productionSource && owner !== nextConfiguration) ||
      (owner.startsWith("packages/config/") && !pureClientConfig)
    ) {
      return {};
    }

    const browser =
      owner.startsWith("apps/web/src/") || owner.startsWith("packages/ui/src/") || pureClientConfig;
    const processNames = new Set(["process"]);
    const report = (node) => context.report({ node, messageId: "centralized" });
    function checkProcess(node) {
      if (isPublicAccess(node, owner)) return;
      const access = node.parent;
      if (
        !browser &&
        access?.type === "MemberExpression" &&
        access.object === node &&
        !access.computed &&
        memberName(access) !== "env"
      ) {
        return;
      }
      report(node);
    }

    return {
      ImportDeclaration(node) {
        if (!["process", "node:process"].includes(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            if ((specifier.imported.name ?? specifier.imported.value) === "env") report(specifier);
          } else {
            processNames.add(specifier.local.name);
          }
        }
      },
      Identifier(node) {
        if (
          processNames.has(node.name) &&
          context.sourceCode
            .getScope(node)
            .references.some((reference) => reference.identifier === node)
        ) {
          checkProcess(node);
        }
      },
      MemberExpression(node) {
        if (
          memberName(node) === "process" &&
          node.object.type === "Identifier" &&
          ["globalThis", "global"].includes(node.object.name)
        ) {
          checkProcess(node);
        }
      },
    };
  },
};
