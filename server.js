const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3123;
const DATA_DIR = process.env.DATA_DIR || '/data';

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// API to list files in a directory
app.get('/api/files', (req, res) => {
  const dirPath = req.query.path || '';
  const fullPath = path.join(DATA_DIR, dirPath);

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
          background = { type: 'image', url: path.join('/data', dirPath, file, coverFile) };
        } else {
          // 2) First image in this folder
          const folderPath = path.join(fullPath, file);
          try {
            const folderFiles = fs.readdirSync(folderPath);
            const firstImage = folderFiles.find(f => imageExts.includes(path.extname(f).toLowerCase()));
            if (firstImage) {
              background = { type: 'image', url: path.join('/data', dirPath, file, firstImage) };
            } else {
              // 3) First 3D in this folder (prefer STL -> OBJ -> SKP; SCAD is treated as preview-unavailable)
              let first3D = null;
              for (const ext3D of supported3DForPreview) {
                first3D = folderFiles.find(f => path.extname(f).toLowerCase() === ext3D);
                if (first3D) break;
              }
              if (first3D) {
                background = { type: '3d', url: path.join('/data', dirPath, file, first3D) };
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
                      background = { type: 'image', url: path.join('/data', dirPath, file, sub, c) };
                      found = true;
                      break;
                    }
                  }
                  if (found) break;

                  // Next, any image in subfolder
                  const subFiles = fs.readdirSync(subPath);
                  const subImage = subFiles.find(f => imageExts.includes(path.extname(f).toLowerCase()));
                  if (subImage) {
                    background = { type: 'image', url: path.join('/data', dirPath, file, sub, subImage) };
                    break;
                  }

                  // Finally, any 3D file in subfolder (prefer stl -> obj -> skp; SCAD is treated as preview-unavailable)
                  let sub3D = null;
                  for (const ext3D of supported3DForPreview) {
                    sub3D = subFiles.find(f => path.extname(f).toLowerCase() === ext3D);
                    if (sub3D) break;
                  }
                  if (sub3D) {
                    background = { type: '3d', url: path.join('/data', dirPath, file, sub, sub3D) };
                    break;
                  }
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }

        console.log(`Background for folder ${file}: ${JSON.stringify(background)}`);
        items.push({ name: file, type: 'folder', path: path.join(dirPath, file), background });
      } else if (supported3D.includes(ext)) {
        const background = { type: '3d', url: path.join('/data', dirPath, file) };
        items.push({
          name: file,
          type: 'file',
          subtype: '3d',
          ext,
          path: path.join(dirPath, file),
          url: path.join('/data', dirPath, file),
          size: stat.size,
          mtime: stat.mtimeMs,
          background,
        });
      } else if (supportedImage.includes(ext)) {
        const background = { type: 'image', url: path.join('/data', dirPath, file) };
        items.push({
          name: file,
          type: 'file',
          subtype: 'image',
          ext,
          path: path.join(dirPath, file),
          url: path.join('/data', dirPath, file),
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
app.use('/data', express.static(DATA_DIR));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});