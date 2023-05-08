/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  entries.forEach((entry) => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

function addJsExtension(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const updatedContent = content.replace(
    /from\s+['"]([^'"]+)['"]/g,
    (match, importPath) => {
      if (importPath.startsWith(".")) {
        const resolvedTsPath = path.resolve(
          path.dirname(filePath),
          `${importPath}.ts`
        );
        const resolvedTsIndexPath = path.resolve(
          path.dirname(filePath),
          `${importPath}/index.ts`
        );

        let newPath = importPath;
        if (fs.existsSync(resolvedTsPath)) {
          newPath = `${importPath}.js`;
        } else if (fs.existsSync(resolvedTsIndexPath)) {
          newPath = `${importPath}/index.js`;
        }

        return `from '${newPath}'`;
      }
      return match;
    }
  );
  fs.writeFileSync(filePath, updatedContent);
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (stat.isFile() && fullPath.endsWith(".ts")) {
      addJsExtension(fullPath);
    }
  });
}

// Replace this with the path to your core package's source folder
const coreSrcPath = "./src";
const tempDistPath = "./dist-temp";

// Copy src folder to dist-temp folder
copyDirectory(coreSrcPath, tempDistPath);

// Process the dist-temp folder
processDirectory(tempDistPath);
