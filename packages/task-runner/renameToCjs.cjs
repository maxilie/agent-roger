/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// eslint-disable @typescript-eslint/no-var-requires
const fs = require("fs");
const path = require("path");

async function updateImports(file, ext = ".cjs") {
  const content = fs.readFileSync(file, "utf-8");
  let updatedContent = content.replace(
    /require\((['"])(.+)\1\)/g,
    (match, quote, importPath) => {
      if (importPath.startsWith(".")) {
        if (!importPath.endsWith(ext)) {
          return `require(${quote}${importPath}${ext}${quote})`;
        }
      } else {
        // Generate a unique identifier for the import
        const importVar = importPath.replace(/[@/-]/g, "_");
        const importPlaceholder = `__IMPORT_PLACEHOLDER_${importVar}__`;
        return importPlaceholder;
      }
      return match;
    }
  );

  const importPlaceholders = [
    ...updatedContent.matchAll(/__IMPORT_PLACEHOLDER_(.+?)__/g),
  ];

  for (const [, importVar] of importPlaceholders) {
    const importPath = importVar.replace(/_/g, "-");
    const importStatement = `const ${importVar} = await import('${importPath}');\n`;
    updatedContent = updatedContent.replace(
      `__IMPORT_PLACEHOLDER_${importVar}__`,
      importVar
    );
    updatedContent = importStatement + updatedContent;
  }

  const wrappedContent = `(async () => {\n${updatedContent}\n})().catch(e => console.error(e));\n`;
  fs.writeFileSync(file, wrappedContent);
}

function renameJsToCjs(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      renameJsToCjs(filePath);
    } else if (path.extname(file) === ".js") {
      const newPath = path.join(dir, path.basename(file, ".js") + ".cjs");
      fs.renameSync(filePath, newPath);
      updateImports(newPath);
    }
  });
}

const outputDir = "build/src";
renameJsToCjs(outputDir);
