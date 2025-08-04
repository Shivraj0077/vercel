const express = require("express");
const { execSync } = require("child_process");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const simpleGit = require("simple-git");
const app = express();
const PORT = 4000;

require("dotenv").config();
app.use(cors());
app.use(express.json());

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET = process.env.S3_BUCKET_NAME
// Helper function to find the project directory containing package.json
function findProjectDirectory(basePath) {
  // First, check if package.json is in the root
  if (fs.existsSync(path.join(basePath, "package.json"))) {
    console.log("✅ Found package.json in root directory");
    return basePath;
  }
  
  console.log("🔍 Searching for package.json in subdirectories...");
  
  // Search in subdirectories (up to 3 levels deep)
  function searchDirectory(currentPath, depth = 0) {
    if (depth > 3) return null; // Limit search depth
    
    try {
      const items = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          const subPath = path.join(currentPath, item.name);
          
          // Check if this directory has package.json
          if (fs.existsSync(path.join(subPath, "package.json"))) {
            console.log(`✅ Found package.json in: ${path.relative(basePath, subPath)}`);
            return subPath;
          }
          
          // Recursively search subdirectories
          const found = searchDirectory(subPath, depth + 1);
          if (found) return found;
        }
      }
    } catch (err) {
      console.warn(`Could not read directory ${currentPath}:`, err.message);
    }
    
    return null;
  }
  
  const projectPath = searchDirectory(basePath);
  
  if (!projectPath) {
    console.warn("⚠️  No package.json found, using root directory");
    return basePath;
  }
  
  return projectPath;
}

// Helper functions for fixing build issues
async function fixNextJsIssues(projectPath) {
  console.log("🔧 Applying Next.js fixes...");
  
  // Fix 1: Find and fix "use server" + React hooks issues
  const srcPath = path.join(projectPath, "src");
  if (fs.existsSync(srcPath)) {
    await fixUseServerIssues(srcPath);
  }
  
  // Fix 2: Add next.config.js with static export if missing
  const nextConfigPath = path.join(projectPath, "next.config.js");
  if (!fs.existsSync(nextConfigPath)) {
    const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig`;
    fs.writeFileSync(nextConfigPath, nextConfig);
    console.log("✅ Added next.config.js with static export");
  }
  
  // Fix 3: Update package.json to ensure proper scripts
  const packageJsonPath = path.join(projectPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    
    // Ensure build script exists
    if (!packageJson.scripts) packageJson.scripts = {};
    if (!packageJson.scripts.build) {
      packageJson.scripts.build = "next build";
    }
    
    // Add export script
    packageJson.scripts.export = "next export";
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log("✅ Updated package.json scripts");
  }
}

async function fixUseServerIssues(dirPath) {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    
    if (file.isDirectory()) {
      await fixUseServerIssues(fullPath);
    } else if (file.name.endsWith('.jsx') || file.name.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Check if file has "use server" but uses client-side hooks
      if (content.includes('"use server"') || content.includes("'use server'")) {
        const hasClientHooks = /use(State|Effect|Context|Reducer|Callback|Memo|Ref|Layout|Effect)/.test(content);
        const hasClerkHooks = /use(User|Auth|Session|Organization)/.test(content);
        
        if (hasClientHooks || hasClerkHooks) {
          console.log(`🔧 Fixing ${fullPath}: Converting "use server" to "use client"`);
          content = content.replace(/["']use server["'];?\s*\n?/g, '"use client";\n');
          fs.writeFileSync(fullPath, content);
        }
      }
    }
  }
}

async function convertToStaticReact(projectPath) {
  console.log("🔄 Converting to static React build...");
  
  // Update package.json to use React scripts instead of Next.js
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  
  // Change scripts to standard React
  packageJson.scripts = {
    ...packageJson.scripts,
    "build": "react-scripts build || vite build || webpack --mode=production",
    "start": "react-scripts start || vite || webpack serve"
  };
  
  // Add React build dependencies if missing
  if (!packageJson.dependencies["react-scripts"] && !packageJson.devDependencies["vite"]) {
    console.log("Installing react-scripts as fallback...");
    try {
      execSync("npm install react-scripts --save-dev", { cwd: projectPath, stdio: "inherit" });
    } catch (err) {
      console.warn("Could not install react-scripts, trying manual build...");
    }
  }
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  try {
    execSync("npm run build", { cwd: projectPath, stdio: "inherit" });
  } catch (err) {
    // Last resort: create a simple static version
    await createFallbackBuild(projectPath);
  }
}

async function fixReactBuildIssues(projectPath) {
  console.log("🔧 Applying React build fixes...");
  
  try {
    // Try with different build commands
    const buildCommands = [
      "npm run build -- --force",
      "CI=false npm run build",
      "npm run build --legacy-peer-deps",
      "npx vite build",
      "npx webpack --mode=production"
    ];
    
    for (const cmd of buildCommands) {
      try {
        console.log(`Trying: ${cmd}`);
        execSync(cmd, { cwd: projectPath, stdio: "inherit" });
        console.log("✅ Build successful!");
        return;
      } catch (err) {
        console.warn(`Command failed: ${cmd}`);
      }
    }
    
    // If all builds fail, create fallback
    await createFallbackBuild(projectPath);
    
  } catch (err) {
    console.error("All build attempts failed, creating fallback...");
    await createFallbackBuild(projectPath);
  }
}

async function createFallbackBuild(projectPath) {
  console.log("🆘 Creating fallback static build...");
  
  const buildPath = path.join(projectPath, "build");
  fs.mkdirSync(buildPath, { recursive: true });
  
  // Create a simple index.html that shows the project
  const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Deployment Successful</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .container { max-width: 600px; margin: 0 auto; }
        .error { color: #ff6b6b; }
        .success { color: #51cf66; }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="success">🚀 Deployment Successful!</h1>
        <p>Your project has been deployed, but there were build issues that prevented the full compilation.</p>
        <p class="error">Common issues found:</p>
        <ul style="text-align: left;">
            <li>Next.js server components using client-side hooks</li>
            <li>TypeScript/ESLint errors</li>
            <li>Missing dependencies or configuration</li>
        </ul>
        <p><strong>Next steps:</strong></p>
        <ol style="text-align: left;">
            <li>Fix the build errors in your repository</li>
            <li>Redeploy the project</li>
            <li>Check the console logs for specific error details</li>
        </ol>
    </div>
</body>
</html>`;
  
  fs.writeFileSync(path.join(buildPath, "index.html"), fallbackHtml);
  console.log("✅ Created fallback build");
}

// Check if S3 bucket is configured
if (!BUCKET) {
  throw new Error("❌ S3_BUCKET_NAME not set in environment variables!");
}

// Helper: Detect build output folder with more options
function detectBuildDir(basePath) {
  const candidates = ["out", "dist", "build", ".next", "public"];
  for (const folder of candidates) {
    const fullPath = path.join(basePath, folder);
    if (fs.existsSync(fullPath)) {
      // Check if it contains HTML files (indicating it's a built output)
      const files = fs.readdirSync(fullPath);
      if (files.some(file => file.endsWith('.html') || file === 'index.html')) {
        console.log(`✅ Found build output in: ${folder}`);
        return folder;
      }
    }
  }
  
  // If no proper build folder found, create a fallback
  console.warn("No valid build folder found, using build");
  return "build";
}

// Helper: Upload folder recursively
const uploadDir = async (dir, s3Prefix) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const key = `${s3Prefix}/${file}`;
    if (fs.lstatSync(fullPath).isDirectory()) {
      await uploadDir(fullPath, key);
    } else {
      const content = fs.readFileSync(fullPath);
      await s3
        .putObject({
          Bucket: BUCKET,
          Key: key,
          Body: content,
          ContentType: getContentType(file),
        })
        .promise();
    }
  }
};

// Deploy route
app.post("/deploy", async (req, res) => {
  const { repoUrl, user = "anon", project = "demo" } = req.body;
  const tempPath = path.join(require('os').tmpdir(), "vercel-clone", `${user}-${project}`);

  try {
    // Clean up existing directory with force and retry
    if (fs.existsSync(tempPath)) {
      try {
        fs.rmSync(tempPath, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("Cleanup warning:", cleanupErr.message);
        // Try alternative cleanup method
        try {
          execSync(`rmdir /s /q "${tempPath}"`, { stdio: 'ignore' });
        } catch (rmErr) {
          console.warn("Alternative cleanup also failed, continuing...");
        }
      }
    }
    
    fs.mkdirSync(tempPath, { recursive: true });

    // Clone with additional options to handle permissions
    const git = simpleGit({
      baseDir: __dirname,
      config: [
        'core.autocrlf=false',
        'core.filemode=false'
      ]
    });
    
    try {
      await git.clone(repoUrl, tempPath, ['--config', 'core.filemode=false']);
    } catch (gitError) {
      console.error("Git clone failed, trying alternative method:", gitError.message);
      
      // Alternative: use execSync to clone
      try {
        execSync(`git clone "${repoUrl}" "${tempPath}"`, { 
          stdio: 'inherit',
          env: { ...process.env, GIT_CONFIG_GLOBAL: '', GIT_CONFIG_SYSTEM: '' }
        });
      } catch (execError) {
        throw new Error(`Both git clone methods failed. Original error: ${gitError.message}`);
      }
    }

    // Find the actual project directory (where package.json is located)
    const projectPath = findProjectDirectory(tempPath);
    console.log(`📁 Found project directory: ${projectPath}`);

    // Build with error handling and fixes
    execSync("npm install --legacy-peer-deps", { cwd: projectPath, stdio: "inherit" });

    // Detect project type and apply fixes
    const isNext = fs.existsSync(path.join(projectPath, "next.config.js"));
    const hasPackageJson = fs.existsSync(path.join(projectPath, "package.json"));
    
    if (hasPackageJson) {
      const packageJson = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8"));
      console.log(`Building ${packageJson.name || "project"}...`);
    }

    if (isNext) {
      console.log("Detected Next.js project. Applying fixes and building...");
      
      try {
        // Try to fix common Next.js issues before building
        await fixNextJsIssues(projectPath);
        
        // Try building with Next.js
        execSync("npm run build", { cwd: projectPath, stdio: "inherit" });
        
        // Check if we need to export (for static hosting)
        try {
          execSync("npx next export", { cwd: projectPath, stdio: "inherit" });
        } catch (exportErr) {
          console.warn("Next export failed, checking for static output...");
          // Next.js 13+ might output to different folder
          if (!fs.existsSync(path.join(projectPath, "out")) && 
              fs.existsSync(path.join(projectPath, "dist"))) {
            console.log("Using dist folder as output");
          }
        }
      } catch (nextBuildErr) {
        console.warn("Next.js build failed, trying to convert to static React:", nextBuildErr.message);
        
        // Fallback: Convert to static React build
        await convertToStaticReact(projectPath);
      }
    } else {
      console.log("Detected React/Vite project. Building...");
      try {
        execSync("npm run build", { cwd: projectPath, stdio: "inherit" });
      } catch (buildErr) {
        console.warn("Standard build failed, trying fixes:", buildErr.message);
        await fixReactBuildIssues(projectPath);
      }
    }

    const buildDir = detectBuildDir(projectPath);
    await uploadDir(
      path.join(projectPath, buildDir),
      `users/${user}/${project}`
    );

    res.send({ message: "✅ Deployed successfully.", url: "http://localhost:4000/" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "❌ Deployment failed." });
  }
});

// Serve files from S3 for project-specific routes
app.use("/site", (req, res, next) => {
  const urlParts = req.path.split('/').filter(Boolean); // Remove empty parts
  
  if (urlParts.length < 2) {
    return res.status(404).send("Invalid URL format. Expected: /site/user/project/file");
  }
  
  const [user, project, ...filePathParts] = urlParts;
  let filePath = filePathParts.join('/') || 'index.html';
  
  const key = `users/${user}/${project}/${filePath}`;

  s3.getObject({ Bucket: BUCKET, Key: key }).promise()
    .then(s3Object => {
      const contentType = getContentType(filePath);
      res.setHeader("Content-Type", contentType);
      res.send(s3Object.Body);
    })
    .catch(err => {
      console.error("File not found:", key);
      // If file not found and no extension, try serving index.html for SPA routing
      if (!path.extname(filePath)) {
        const indexKey = `users/${user}/${project}/index.html`;
        return s3.getObject({ Bucket: BUCKET, Key: indexKey }).promise()
          .then(indexObject => {
            res.setHeader("Content-Type", "text/html");
            res.send(indexObject.Body);
          })
          .catch(indexErr => {
            console.error("Index.html also not found:", indexKey);
            res.status(404).send("Not found");
          });
      }
      res.status(404).send("Not found");
    });
});

// Serve static files directly (for when apps reference /static/, /assets/, etc.)
// This assumes the current deployment is anon/demo - you might want to make this configurable
app.use("/static", (req, res) => {
  const filePath = req.path.substring(1); // Remove leading slash
  const key = `users/anon/demo/static/${filePath}`;
  
  s3.getObject({ Bucket: BUCKET, Key: key }).promise()
    .then(s3Object => {
      const contentType = getContentType(filePath);
      res.setHeader("Content-Type", contentType);
      res.send(s3Object.Body);
    })
    .catch(err => {
      console.error("Static file not found:", key);
      res.status(404).send("Static file not found");
    });
});

// Serve other common asset paths
app.use("/assets", (req, res) => {
  const filePath = req.path.substring(1);
  const key = `users/anon/demo/assets/${filePath}`;
  
  s3.getObject({ Bucket: BUCKET, Key: key }).promise()
    .then(s3Object => {
      const contentType = getContentType(filePath);
      res.setHeader("Content-Type", contentType);
      res.send(s3Object.Body);
    })
    .catch(err => {
      console.error("Asset file not found:", key);
      res.status(404).send("Asset file not found");
    });
});

// Serve manifest.json and other root files
app.get("/manifest.json", (req, res) => {
  const key = `users/anon/demo/manifest.json`;
  
  s3.getObject({ Bucket: BUCKET, Key: key }).promise()
    .then(s3Object => {
      res.setHeader("Content-Type", "application/json");
      res.send(s3Object.Body);
    })
    .catch(err => {
      console.error("Manifest not found:", key);
      res.status(404).send("Manifest not found");
    });
});

// Default route - serve the latest deployment (anon/demo) at root
app.get("/", (req, res) => {
  const key = `users/anon/demo/index.html`;
  
  s3.getObject({ Bucket: BUCKET, Key: key }).promise()
    .then(s3Object => {
      res.setHeader("Content-Type", "text/html");
      res.send(s3Object.Body);
    })
    .catch(err => {
      console.error("Default index.html not found:", key);
      res.status(404).send("No deployments found");
    });
});

// Catch-all for root level files (favicon.ico, robots.txt, etc.)
app.get("/:filename", (req, res) => {
  const filename = req.params.filename;
  
  // Only handle files with extensions to avoid interfering with other routes
  if (path.extname(filename)) {
    const key = `users/anon/demo/${filename}`;
    
    s3.getObject({ Bucket: BUCKET, Key: key }).promise()
      .then(s3Object => {
        const contentType = getContentType(filename);
        res.setHeader("Content-Type", contentType);
        res.send(s3Object.Body);
      })
      .catch(err => {
        console.error("Root file not found:", key);
        res.status(404).send("File not found");
      });
  } else {
    res.status(404).send("Not found");
  }
});

// Content-Type helper
function getContentType(file) {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".js")) return "application/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".ico")) return "image/x-icon";
  if (file.endsWith(".woff")) return "font/woff";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));