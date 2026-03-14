# 3DPrintLibrary Web Interface

A lightweight web application for browsing 3D print files in a directory structure.

## Features

- Tile-based grid view of folders and 3D files (.stl, .obj, .skp)
- Automatic background images from cover.png, first image, or 3D model render
- Breadcrumb navigation
- Readme flyout panel
- Responsive design
- Runs in a minimal Docker container

## Setup

1. Build the Docker image:
   ```
   docker build -t 3dprintlibrary .
   ```

2. Run the container, mounting your 3D library directory:
   ```
   docker run -p 3000:3000 -v /path/to/your/3d/library:/data 3dprintlibrary
   ```

3. Open http://localhost:3000 in your browser.

## File Structure

- Folders are displayed as tiles with background images determined by priority:
  - Cover.jpg, cover.jpg, Cover.png, cover.png, Cover.webp, cover.webp in the folder
  - First image file in the folder
  - Render of the first 3D model file
- Supported 3D files: .stl, .obj, .skp
- Hidden: .skb files, readme.md/txt (from tiles)

## Architecture

- Backend: Node.js with Express
- Frontend: Vanilla JS with Three.js for 3D rendering
- Container: Alpine Linux based