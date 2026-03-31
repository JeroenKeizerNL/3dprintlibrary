let currentPath = '';
let modalAnimationFrame = null;
let isFlyoutCollapsed = false;

function normalizeRelativePath(inputPath) {
  return String(inputPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function getBasePathPrefix() {
  const base = String(window.BASE_URL || '').replace(/^\/+|\/+$/g, '');
  return base ? `/${base}` : '';
}

function decodePathSegments(inputPath) {
  const trimmed = String(inputPath || '').replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return '';
  }

  const decoded = trimmed
    .split('/')
    .filter(Boolean)
    .map(segment => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');

  return normalizeRelativePath(decoded);
}

function getPathFromLocation() {
  const url = new URL(window.location.href);
  const basePrefix = getBasePathPrefix();
  let pathname = url.pathname;

  if (basePrefix && pathname.toLowerCase().startsWith(basePrefix.toLowerCase())) {
    pathname = pathname.slice(basePrefix.length) || '/';
  }

  if (pathname === '/browse' || pathname === '/browse/') {
    return '';
  }

  if (pathname.startsWith('/browse/')) {
    return decodePathSegments(pathname.slice('/browse/'.length));
  }

  return '';
}

function buildBrowseUrl(path) {
  const normalized = normalizeRelativePath(path);
  const encodedPath = normalized
    ? normalized.split('/').map(segment => encodeURIComponent(segment)).join('/')
    : '';
  const browsePath = encodedPath ? `/browse/${encodedPath}` : '/browse';
  return `${getBasePathPrefix()}${browsePath}`;
}

function init() {
  const path = getPathFromLocation();
  initFlyoutToggle();
  initModal();
  loadPath(path, { replace: true });
}

function initFlyoutToggle() {
  const toggleBtn = document.getElementById('flyout-toggle');
  if (!toggleBtn) {
    return;
  }

  const savedFlyoutState = window.localStorage.getItem('flyoutCollapsed');
  if (savedFlyoutState === null) {
    isFlyoutCollapsed = isMobileOrLowResDevice();
  } else {
    isFlyoutCollapsed = savedFlyoutState === 'true';
  }

  setFlyoutCollapsed(isFlyoutCollapsed);

  toggleBtn.onclick = () => {
    isFlyoutCollapsed = !isFlyoutCollapsed;
    setFlyoutCollapsed(isFlyoutCollapsed);
    window.localStorage.setItem('flyoutCollapsed', String(isFlyoutCollapsed));
  };
}

function isMobileOrLowResDevice() {
  return window.matchMedia('(max-width: 900px), (max-height: 700px), (pointer: coarse)').matches;
}

function setFlyoutCollapsed(collapsed) {
  const flyout = document.getElementById('flyout');
  const toggleBtn = document.getElementById('flyout-toggle');
  if (!flyout || !toggleBtn) {
    return;
  }

  flyout.classList.toggle('collapsed', collapsed);
  toggleBtn.innerHTML = getFlyoutToggleIcon(collapsed);
  toggleBtn.setAttribute('aria-label', collapsed ? 'Expand README panel' : 'Collapse README panel');
  toggleBtn.setAttribute('aria-expanded', String(!collapsed));
}

function getFlyoutToggleIcon(collapsed) {
  // Collapsed panel expands left, expanded panel collapses right.
  const iconPath = collapsed
    ? 'M14.5 5.5L9 11l5.5 5.5 M9.5 5.5L4 11l5.5 5.5'
    : 'M4 5.5L9.5 11 4 16.5 M9 5.5l5.5 5.5L9 16.5';

  return `<svg viewBox="0 0 18 22" aria-hidden="true" focusable="false"><path d="${iconPath}"/></svg>`;
}

function initModal() {
  const closeBtn = document.getElementById('modal-close');
  const overlay = document.getElementById('modal-overlay');
  closeBtn.onclick = closeModal;
  overlay.onclick = closeModal;
}

function openModal(item) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const footer = document.getElementById('modal-footer');
  body.innerHTML = '';
  footer.innerHTML = '';

  if (item.type === 'file') {
    if (item.subtype === 'image') {
      const img = document.createElement('img');
      img.src = encodeURI(item.url);
      body.appendChild(img);
    } else if (item.subtype === '3d') {
      const viewer = document.createElement('canvas');
      viewer.width = 760;
      viewer.height = 540;
      body.appendChild(viewer);
      render3DModal(item.url, viewer);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    const basename = document.createElement('span');
    basename.textContent = `Name: ${item.name}`;
    const fileType = document.createElement('span');
    fileType.textContent = `Type: ${item.ext.toUpperCase().replace('.', '')}`;
    const sizeKb = (item.size / 1024).toFixed(1);
    const size = document.createElement('span');
    size.textContent = `Size: ${sizeKb} KB`;
    const date = new Date(item.mtime);
    const modified = document.createElement('span');
    modified.textContent = `Modified: ${date.toLocaleString()}`;
    meta.appendChild(basename);
    meta.appendChild(fileType);
    meta.appendChild(size);
    meta.appendChild(modified);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const download = document.createElement('button');
    download.textContent = 'Download';
    download.onclick = () => {
      const link = document.createElement('a');
      link.href = encodeURI(item.url);
      link.download = item.name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    actions.appendChild(download);

    footer.appendChild(meta);
    footer.appendChild(actions);
  }

  modal.classList.remove('hidden');
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.add('hidden');

  if (modalAnimationFrame) {
    cancelAnimationFrame(modalAnimationFrame);
    modalAnimationFrame = null;
  }
}

function render3DModal(url, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(canvas.width, canvas.height);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(1, 2, 1);
  scene.add(light);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-1, 0.5, -1);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  scene.background = new THREE.Color(0x888888);

  const ext = url.split('.').pop().toLowerCase();
  let loader;
  if (ext === 'stl') {
    loader = new THREE.STLLoader();
  } else if (ext === 'obj') {
    loader = new THREE.OBJLoader();
  } else {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '20px Arial';
      ctx.fillText('Preview not available', 20, canvas.height / 2);
    }
    return;
  }

  loader.load(url, (object) => {
    let mesh;
    if (ext === 'obj') {
      scene.add(object);
      mesh = object;
    } else {
      const material = new THREE.MeshLambertMaterial({ color: 0x105EB4 });
      mesh = new THREE.Mesh(object, material);
      scene.add(mesh);
    }

    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    mesh.position.sub(center);

    // 3D printing files are typically Z-up while Three.js is Y-up.
    mesh.rotation.x = -Math.PI / 2;

    // Re-center after rotation so orbit target and framing stay accurate.
    const box2 = new THREE.Box3().setFromObject(mesh);
    const center2 = box2.getCenter(new THREE.Vector3());
    mesh.position.sub(center2);

    const size = box2.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraZ = maxDim / Math.sin(fov / 2) * 1;
    const iso = 1 / Math.sqrt(3);
    camera.position.set(cameraZ * iso, cameraZ * iso, cameraZ * iso);
    camera.lookAt(0, 0, 0);

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.minDistance = maxDim * 0.5;
    controls.maxDistance = maxDim * 10;

    function animate() {
      modalAnimationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  }, undefined, (error) => {
    console.error(error);
  });
}

function loadPath(path, { replace = false, syncUrl = true } = {}) {
  const normalizedPath = normalizeRelativePath(path);
  currentPath = normalizedPath;

  if (syncUrl) {
    const url = new URL(window.location.href);
    url.pathname = buildBrowseUrl(normalizedPath);
    url.searchParams.delete('path');

    if (replace) {
      window.history.replaceState({}, '', url);
    } else {
      window.history.pushState({}, '', url);
    }
  }

  // Update browser title
  const titleParts = normalizedPath ? normalizedPath.split('/').filter(p => p) : [];
  const title = '3DPrintLibrary' + (titleParts.length > 0 ? ' - ' + titleParts.join(' > ') : ' - Main Library');
  document.title = title;

  fetch(`${window.BASE_URL}/api/files?path=${encodeURIComponent(normalizedPath)}`)
    .then(res => res.json())
    .then(data => {
      renderBreadcrumb(data.currentPath);
      renderGrid(data.items);
      renderFlyout(data.readme, data.readmeType);
    });
}

function renderBreadcrumb(path) {
  const breadcrumb = document.getElementById('breadcrumb');

  const parts = path.split('/').filter(p => p);

  breadcrumb.classList.remove('hidden');
  breadcrumb.innerHTML = '';

  const trail = parts.slice(0, -1);
  const current = parts.length ? parts[parts.length - 1] : null;

  const home = document.createElement('a');
  home.href = '#';
  home.onclick = (event) => {
    event.preventDefault();
    loadPath('');
  };

  const homeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  homeIcon.setAttribute('viewBox', '0 0 24 24');
  homeIcon.setAttribute('aria-hidden', 'true');
  homeIcon.setAttribute('width', '16');
  homeIcon.setAttribute('height', '16');
  const homePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  homePath.setAttribute('fill', 'currentColor');
  homePath.setAttribute('d', 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z');
  homeIcon.appendChild(homePath);

  home.appendChild(homeIcon);
  home.appendChild(document.createTextNode('Home'));
  breadcrumb.appendChild(home);

  trail.forEach((part, i) => {
    const segmentPath = trail.slice(0, i + 1).join('/');
    const separator = document.createElement('span');
    separator.textContent = '›';
    breadcrumb.appendChild(separator);

    const link = document.createElement('a');
    link.href = '#';
    link.textContent = part;
    link.onclick = (event) => {
      event.preventDefault();
      loadPath(segmentPath);
    };
    breadcrumb.appendChild(link);
  });

  if (current) {
    const separator = document.createElement('span');
    separator.textContent = '›';
    breadcrumb.appendChild(separator);

    const currentSpan = document.createElement('span');
    currentSpan.className = 'current-folder';
    currentSpan.textContent = current;
    breadcrumb.appendChild(currentSpan);
  }
}

function renderGrid(items) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  items.forEach(item => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.onclick = () => {
      if (item.type === 'folder') {
        loadPath(item.path);
      } else {
        openModal(item);
      }
    };

    const content = document.createElement('div');
    content.className = 'tile-content';
    tile.appendChild(content);

    const icon = document.createElement('div');
    icon.className = 'tile-icon';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');

    if (item.type === 'folder') {
      path.setAttribute('d', 'M10 4H4C2.9 4 2 4.9 2 6v12c0 1.1 .9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z');
    } else {
      switch (item.ext) {
        case '.stl':
          path.setAttribute('d', 'M4 7l8-4 8 4v10l-8 4-8-4V7zm8 0l-6 3v7l6 3 6-3V10l-6-3z');
          break;
        case '.obj':
          path.setAttribute('d', 'M5 8l7-4 7 4v8l-7 4-7-4V8zm7-2l-5 3v6l5 3 5-3V9l-5-3z');
          break;
        case '.skp':
        case '.scad':
          path.setAttribute('d', 'M12 2l8 4v8l-8 4-8-4V6l8-4zm0 2.18L5.47 9.82 12 12.55l6.53-2.73L12 4.18z');
          break;
        default:
          path.setAttribute('d', 'M4 6h16v12H4V6zm2 2v8h12V8H6zm2 2h8v4H8v-4z');
      }
    }

    svg.appendChild(path);
    icon.appendChild(svg);
    content.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'tile-name';
    name.textContent = item.name;
    content.appendChild(name);

    grid.appendChild(tile);

    if (item.background) {
      if (item.background.type === 'image') {
        applyImageBackground(tile, item.background.url);
      } else if (item.background.type === '3d') {
        render3DThumbnail(item.background.url, tile);
      }
    }
  });
}

function applyImageBackground(tile, imageUrl) {
  const encodedUrl = encodeURI(imageUrl);
  const { media, foreground } = ensureTileMedia(tile);

  tile.classList.add('has-image-cover');
  tile.style.backgroundImage = 'none';

  foreground.onload = () => {
    requestAnimationFrame(() => {
      const rect = tile.getBoundingClientRect();
      const tileWidth = Math.max(rect.width || 0, 300);
      const tileHeight = Math.max(rect.height || 0, 220);
      const isTooSmall = foreground.naturalWidth < tileWidth || foreground.naturalHeight < tileHeight;

      if (isTooSmall) {
        tile.classList.add('image-cover-small');
        tile.classList.remove('image-cover-large');
        return;
      }

      tile.classList.remove('image-cover-small');
      tile.classList.add('image-cover-large');
    });
  };

  foreground.onerror = () => {
    tile.classList.remove('has-image-cover');
    tile.classList.remove('image-cover-small');
    tile.classList.remove('image-cover-large');
    if (media.parentNode === tile) {
      tile.removeChild(media);
    }
    tile.style.backgroundImage = `url(${encodedUrl})`;
  };

  const backdrop = media.querySelector('.tile-media-backdrop');
  backdrop.src = encodedUrl;
  foreground.src = encodedUrl;
}

function ensureTileMedia(tile) {
  let media = tile.querySelector('.tile-media');
  if (!media) {
    media = document.createElement('div');
    media.className = 'tile-media';

    const backdrop = document.createElement('img');
    backdrop.className = 'tile-media-backdrop';
    backdrop.alt = '';
    backdrop.decoding = 'async';

    const foreground = document.createElement('img');
    foreground.className = 'tile-media-foreground';
    foreground.alt = '';
    foreground.decoding = 'async';

    media.appendChild(backdrop);
    media.appendChild(foreground);
    tile.insertBefore(media, tile.firstChild);
  }

  const backdrop = media.querySelector('.tile-media-backdrop');
  const foreground = media.querySelector('.tile-media-foreground');

  return { media, backdrop, foreground };
}

function render3DThumbnail(url, tile) {
  const glCanvas = document.createElement('canvas');
  glCanvas.width = 300;
  glCanvas.height = 200;
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
  renderer.setSize(300, 200);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 300 / 200, 0.1, 1000);
  camera.position.set(0, 0, 5);
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(1, 2, 1);
  scene.add(light);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-1, 0.5, -1);
  scene.add(fillLight);

  // Add ambient light so the model is visible
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const ext = url.split('.').pop().toLowerCase();
  let loader;
  if (ext === 'stl') {
    loader = new THREE.STLLoader();
  } else if (ext === 'obj') {
    loader = new THREE.OBJLoader();
  } else {
    // For skp, placeholder
    const placeholder = document.createElement('canvas');
    placeholder.width = 300;
    placeholder.height = 200;
    const ctx = placeholder.getContext('2d');
    if (!ctx) {
      tile.style.backgroundColor = '#333';
      return;
    }
    ctx.fillStyle = '#ccc';
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.fillText('Preview not available', 20, 110);
    tile.style.backgroundImage = `url(${placeholder.toDataURL()})`;
    return;
  }

  loader.load(url, (object) => {
    let mesh;
    if (ext === 'obj') {
      scene.add(object);
      mesh = object;
    } else {
      const material = new THREE.MeshLambertMaterial({ color: 0x105EB4 });
      mesh = new THREE.Mesh(object, material);
      scene.add(mesh);
    }
    // Fit camera to object
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    mesh.position.sub(center);

    // 3D printing files use Z-up; Three.js is Y-up — rotate -90° around X to correct
    mesh.rotation.x = -Math.PI / 2;

    // Re-center after rotation: rotating a non-origin-centred geometry shifts the world centroid
    const box2 = new THREE.Box3().setFromObject(mesh);
    const center2 = box2.getCenter(new THREE.Vector3());
    mesh.position.sub(center2);

    const size = box2.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraZ = maxDim / Math.sin(fov / 2) * 0.75;
    const iso = 1 / Math.sqrt(3);
    camera.position.set(cameraZ * iso, cameraZ * iso, cameraZ * iso);
    camera.lookAt(0, 0, 0);

    // Render to WebGL canvas then composite with gradient
    renderer.render(scene, camera);
    const composite = document.createElement('canvas');
    composite.width = 300;
    composite.height = 200;
    const ctx = composite.getContext('2d');
    if (!ctx) {
      tile.style.backgroundColor = '#333';
      return;
    }
    const grad = ctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, '#888888');
    grad.addColorStop(1, '#888888');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 300, 200);
    ctx.drawImage(glCanvas, 0, 0);
    tile.style.backgroundImage = `url(${composite.toDataURL()})`;
  }, undefined, (error) => {
    console.error(error);
    // Fallback
    const fallback = document.createElement('canvas');
    fallback.width = 300;
    fallback.height = 200;
    const fallbackCtx = fallback.getContext('2d');
    if (!fallbackCtx) {
      tile.style.backgroundColor = '#333';
      return;
    }
    fallbackCtx.fillStyle = '#ccc';
    fallbackCtx.fillRect(0, 0, 300, 200);
    tile.style.backgroundImage = `url(${fallback.toDataURL()})`;
  });
}

function renderFlyout(readme, readmeType) {
  const flyout = document.getElementById('flyout');
  const content = document.getElementById('readme-content');
  if (!readme) {
    flyout.classList.add('hidden');
    return;
  }

  if (readmeType === 'md' && window.marked) {
    content.innerHTML = marked.parse(readme);
    content.querySelectorAll('a').forEach((link) => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
  } else {
    content.textContent = readme;
  }

  setFlyoutCollapsed(isFlyoutCollapsed);
  flyout.classList.remove('hidden');
}

window.onload = init;

window.addEventListener('popstate', () => {
  const path = getPathFromLocation();
  loadPath(path, { replace: true, syncUrl: false });
});
