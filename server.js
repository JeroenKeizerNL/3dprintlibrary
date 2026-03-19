const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3123;
const DATA_DIR = process.env.DATA_DIR || '/data';
const BASE_URL = process.env.BASE_URL || '';
const DATA_ROUTE = BASE_URL + '/data';

function normalizeRelativePath(inputPath) {
  return String(inputPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function joinRelativePath(...segments) {
  const normalized = segments
    .map(segment => normalizeRelativePath(segment))
    .filter(Boolean);

  return normalized.length ? normalized.join('/') : '';
}

function joinWebPath(...segments) {
  return path.posix.join(...segments.map(segment => String(segment || '').replace(/\\/g, '/')));
}

function resolveDataPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized
    ? path.join(DATA_DIR, ...normalized.split('/'))
    : DATA_DIR;
}

function isSameOrSubpath(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveSafeDataPath(relativePath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(String(relativePath || ''));
  } catch {
    return null;
  }

  const normalized = normalizeRelativePath(decodedPath);
  const segments = normalized ? normalized.split('/') : [];

  if (segments.some(segment => segment === '.' || segment === '..' || segment.includes('\0'))) {
    return null;
  }

  const dataRoot = path.resolve(DATA_DIR);
  const resolvedPath = path.resolve(dataRoot, ...segments);

  // Core traversal guard: final resolved path must be dataRoot itself or inside it.
  if (!isSameOrSubpath(dataRoot, resolvedPath)) {
    return null;
  }

  // If paths exist, compare canonical paths too to avoid symlink-based escapes.
  let canonicalRoot = dataRoot;
  let canonicalResolved = resolvedPath;

  try {
    canonicalRoot = fs.realpathSync.native ? fs.realpathSync.native(dataRoot) : fs.realpathSync(dataRoot);
  } catch {
    // Keep lexical path fallback when root canonicalization is unavailable.
  }

  if (fs.existsSync(resolvedPath)) {
    try {
      canonicalResolved = fs.realpathSync.native ? fs.realpathSync.native(resolvedPath) : fs.realpathSync(resolvedPath);
    } catch {
      return null;
    }
  }

  if (!isSameOrSubpath(canonicalRoot, canonicalResolved)) {
    return null;
  }

  return {
    normalized,
    fullPath: resolvedPath,
  };
}

app.use(cors());

// Serve index.html dynamically to inject BASE_URL (handles both /base and /base/)
const rootRoutes = BASE_URL ? [BASE_URL, BASE_URL + '/'] : ['/'];
const browseRoutes = BASE_URL
  ? [BASE_URL + '/browse', BASE_URL + '/browse/*']
  : ['/browse', '/browse/*'];

app.get([...rootRoutes, ...browseRoutes], (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error loading index.html');
    }
    const baseTag = `<base href="${BASE_URL ? BASE_URL + '/' : '/'}">`;
    const modifiedHtml = data
      .replace('{{BASE_TAG}}', baseTag)
      .replace('{{BASE_URL}}', BASE_URL);
    res.send(modifiedHtml);
  });
});

app.use(BASE_URL, express.static(path.join(__dirname, 'public')));

// API health endpoint for container/orchestrator checks
app.get(BASE_URL + '/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// API to list files in a directory
app.get(BASE_URL + '/api/files', (req, res) => {
  const resolved = resolveSafeDataPath(req.query.path || '');
  if (!resolved) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const dirPath = resolved.normalized;
  const fullPath = resolved.fullPath;

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    return res.status(404).json({ error: 'Directory not found' });
  }

  fs.readdir(fullPath, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to read directory' });
    }

    const items = [];
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const coverFiles = ['Cover.jpg', 'cover.jpg', 'Cover.png', 'cover.png', 'Cover.webp', 'cover.webp'];
    const supported3D = ['.stl', '.obj', '.skp', '.scad'];
    // For cover-selection logic we prefer STL/OBJ/SKP over SCAD (SCAD is treated like SKB: preview missing)
    const supported3DForPreview = ['.stl', '.obj', '.skp'];
    const supportedImage = [...imageExts];

    const folderHasModels = files.some(f => supported3D.includes(path.extname(f).toLowerCase()));

    files.forEach(file => {
      const filePath = path.join(fullPath, file);
      const stat = fs.statSync(filePath);
      const ext = path.extname(file).toLowerCase();

      if (stat.isDirectory()) {
        // Determine background
        let background = null;

        // 1) Cover.* in this folder
        let coverFile = null;
        for (const c of coverFiles) {
          const p = path.join(fullPath, file, c);
          const exists = fs.existsSync(p);
          if (exists) {
            coverFile = c;
            break;
          }
        }
        if (coverFile) {
          background = { type: 'image', url: joinWebPath(DATA_ROUTE, dirPath, file, coverFile) };
        } else {
          // 2) First image in this folder
          const folderPath = path.join(fullPath, file);
          try {
            const folderFiles = fs.readdirSync(folderPath);
            const firstImage = folderFiles.find(f => imageExts.includes(path.extname(f).toLowerCase()));
            if (firstImage) {
              background = { type: 'image', url: joinWebPath(DATA_ROUTE, dirPath, file, firstImage) };
            } else {
              // 3) First 3D in this folder (prefer STL -> OBJ -> SKP; SCAD is treated as preview-unavailable)
              let first3D = null;
              for (const ext3D of supported3DForPreview) {
                first3D = folderFiles.find(f => path.extname(f).toLowerCase() === ext3D);
                if (first3D) break;
              }
              if (first3D) {
                background = { type: '3d', url: joinWebPath(DATA_ROUTE, dirPath, file, first3D) };
              } else {
                // 4) If none found, scan immediate subfolders for cover/image/3D
                for (const sub of folderFiles) {
                  const subPath = path.join(folderPath, sub);
                  if (!fs.existsSync(subPath) || !fs.statSync(subPath).isDirectory()) continue;

                  // Prefer cover in subfolder
                  let found = false;
                  for (const c of coverFiles) {
                    const p = path.join(subPath, c);
                    if (fs.existsSync(p)) {
                      background = { type: 'image', url: joinWebPath(DATA_ROUTE, dirPath, file, sub, c) };
                      found = true;
                      break;
                    }
                  }
                  if (found) break;

                  // Next, any image in subfolder
                  const subFiles = fs.readdirSync(subPath);
                  const subImage = subFiles.find(f => imageExts.includes(path.extname(f).toLowerCase()));
                  if (subImage) {
                    background = { type: 'image', url: joinWebPath(DATA_ROUTE, dirPath, file, sub, subImage) };
                    break;
                  }

                  // Finally, any 3D file in subfolder (prefer stl -> obj -> skp; SCAD is treated as preview-unavailable)
                  let sub3D = null;
                  for (const ext3D of supported3DForPreview) {
                    sub3D = subFiles.find(f => path.extname(f).toLowerCase() === ext3D);
                    if (sub3D) break;
                  }
                  if (sub3D) {
                    background = { type: '3d', url: joinWebPath(DATA_ROUTE, dirPath, file, sub, sub3D) };
                    break;
                  }
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }

        items.push({ name: file, type: 'folder', path: joinRelativePath(dirPath, file), background });
      } else if (supported3D.includes(ext)) {
        const background = { type: '3d', url: joinWebPath(DATA_ROUTE, dirPath, file) };
        items.push({
          name: file,
          type: 'file',
          subtype: '3d',
          ext,
          path: joinRelativePath(dirPath, file),
          url: joinWebPath(DATA_ROUTE, dirPath, file),
          size: stat.size,
          mtime: stat.mtimeMs,
          background,
        });
      } else if (supportedImage.includes(ext)) {
        // Suppress cover images from the tile grid when there are no model files in this folder.
        const isCoverImage = coverFiles.some(c => c.toLowerCase() === file.toLowerCase());
        if (isCoverImage && !folderHasModels) return;

        const background = { type: 'image', url: joinWebPath(DATA_ROUTE, dirPath, file) };
        items.push({
          name: file,
          type: 'file',
          subtype: 'image',
          ext,
          path: joinRelativePath(dirPath, file),
          url: joinWebPath(DATA_ROUTE, dirPath, file),
          size: stat.size,
          mtime: stat.mtimeMs,
          background,
        });
      }
    });

    // Readme
    let readme = null;
    let readmeType = null;
    const readmeFiles = ['readme.md', 'README.md', 'readme.txt', 'README.txt', 'Readme.md', 'Readme.txt'];
    let readmeFile = null;
    for (const r of readmeFiles) {
      const p = path.join(fullPath, r);
      if (fs.existsSync(p)) {
        readmeFile = r;
        break;
      }
    }
    if (readmeFile) {
      readme = fs.readFileSync(path.join(fullPath, readmeFile), 'utf8');
      readmeType = path.extname(readmeFile).toLowerCase() === '.md' ? 'md' : 'txt';
    }

    // Sort: folders first, then 3D files, then images, then others
    const groupOrder = (item) => {
      if (item.type === 'folder') return 0;
      if (item.type === 'file') {
        if (item.subtype === '3d') return 1;
        if (item.subtype === 'image') return 2;
      }
      return 3;
    };

    items.sort((a, b) => {
      const ga = groupOrder(a);
      const gb = groupOrder(b);
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    res.json({ items, currentPath: dirPath, readme, readmeType });
  });
});

// Serve files from data directory
app.use(DATA_ROUTE, (req, res, next) => {
  const resolved = resolveSafeDataPath(req.path || '');
  if (!resolved) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  next();
});

app.use(DATA_ROUTE, express.static(DATA_DIR));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});