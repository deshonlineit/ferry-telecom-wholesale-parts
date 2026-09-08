import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const generatedApiPath = path.resolve(
  directory,
  "..",
  "api-zod",
  "src",
  "generated",
  "api.ts",
);

let source = await readFile(generatedApiPath, "utf8");
source = source.replace(
  "import * as zod from 'zod';",
  "import * as zod from 'zod/v4';",
);

const declarationPattern =
  /^export const (\w+(?:Max|Min)) = ([^\n;]+);\n?/gm;
const declarations = [...source.matchAll(declarationPattern)];

for (const declaration of declarations) {
  const [statement, name] = declaration;
  const declarationIndex = source.indexOf(statement);
  const firstReferenceIndex = source.indexOf(name);

  if (
    firstReferenceIndex === -1 ||
    declarationIndex === -1 ||
    firstReferenceIndex >= declarationIndex
  ) {
    continue;
  }

  source =
    `${source.slice(0, firstReferenceIndex)}${statement}\n` +
    `${source.slice(firstReferenceIndex, declarationIndex)}` +
    source.slice(declarationIndex + statement.length);
}

if (!source.includes("import * as zod from 'zod/v4';")) {
  throw new Error("Generated API does not use the required zod/v4 import");
}

await writeFile(generatedApiPath, `${source.trimEnd()}\n`);