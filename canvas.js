// Simple flowchart-like editor: add nodes, drag, and connect via ports
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('flow-root');
  const board = document.getElementById('flow-board');
  const svg = document.getElementById('flow-svg');
  const importBtn = document.getElementById('import-btn');
  const clearBtn = document.getElementById('clear');
  const menu = document.getElementById('flow-menu');
  const menuLabel = document.getElementById('menu-label');
  const menuDelete = document.getElementById('menu-delete');
  const canvasJsonEl = document.getElementById('canvas-json');
  const importOverlay = document.getElementById('import-overlay');
  const importText = document.getElementById('import-text');
  const importCancel = document.getElementById('import-cancel');
  const importConfirm = document.getElementById('import-confirm');
  let outsideMenuListenerAttached = false;

  let nextId = 1;
  const nodes = new Map(); // id -> { el, x, y, w, h }
  const edges = []; // { id, fromId, fromPort, toId, toPort, pathEl, hitEl }
  let dragging = null; // { id, offsetX, offsetY }
  let connecting = null; // { fromId, fromPort, tempPath }
  let clickContext = { id: null, moved: false, startX: 0, startY: 0 };
  let draggingWidget = null; // { type, element }

  // Visual constants
  const VISIBLE_STROKE_PX = 3;
  const HIT_STROKE_PX = 6; // 2x visible for easy clicking
  const ARROW_OFFSET_PX = 12; // how far outside the target edge the path approaches from

  // Utility: convert client coords to SVG coords
  function toSvgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
  }

  function getRootRect() { return root.getBoundingClientRect(); }
  function clientToBoardPoint(e) {
    const r = getRootRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ----- Serialization helpers -----
  function serializeCanvas() {
    const nodeData = Array.from(nodes.entries()).map(([id, node]) => ({
      id, type: node.type, x: node.x, y: node.y, label: node.el.textContent
    }));
    const edgeData = edges.map(e => ({
      id: e.id, fromId: e.fromId, fromPort: e.fromPort, toId: e.toId, toPort: e.toPort
    }));
    return { nodes: nodeData, edges: edgeData };
  }

  function updateJsonDisplay() {
    canvasJsonEl.value = JSON.stringify(serializeCanvas(), null, 2);
  }

  function deserializeCanvas(data) {
    clearAll();
    // Restore nodes first
    for (const nodeData of data.nodes) {
      const id = nodeData.id;
      const el = document.createElement('div');
      el.className = `flow-node ${nodeData.type}`;
      el.tabIndex = 0;
      el.dataset.id = id;
      el.textContent = nodeData.label || (nodeData.type === 'rect' ? 'Rect' : nodeData.type === 'circle' ? 'Circle' : 'Diamond');

      const ports = document.createElement('div');
      ports.className = 'ports';
      ['t','b','l','r'].forEach(p => {
        const dot = document.createElement('div');
        dot.className = `flow-port ${p}`;
        dot.title = 'Drag to connect';
        dot.addEventListener('pointerdown', (e) => startConnect(e, id, p));
        ports.appendChild(dot);
      });
      
      // For diamond nodes, append ports as siblings to avoid clip-path issues
      if (nodeData.type === 'diamond') {
        board.appendChild(el);
        board.appendChild(ports);
      } else {
        el.appendChild(ports);
        board.appendChild(el);
      }
      const w = nodeData.type === 'rect' ? 120 : nodeData.type === 'diamond' ? 86 : 72;
      const h = nodeData.type === 'rect' ? 64 : nodeData.type === 'diamond' ? 86 : 72;

      nodes.set(id, { el, x: nodeData.x, y: nodeData.y, w, h, type: nodeData.type });
      positionNode(id);

      el.addEventListener('pointerdown', (e) => startDrag(e, id));
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('flow-port')) return;
        e.stopPropagation();
        if (clickContext.id === id && !clickContext.moved) {
          hideMenu();
          openContextMenuAt(clientToBoardPoint(e), { type: 'node', id });
        }
        clickContext = { id: null, moved: false, startX: 0, startY: 0 };
      });
    }
    // Restore edges
    for (const edgeData of data.edges) {
      const fromNode = nodes.get(edgeData.fromId);
      const toNode = nodes.get(edgeData.toId);
      if (!fromNode || !toNode) continue;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('stroke', '#fbbf24');
      path.setAttribute('stroke-width', String(VISIBLE_STROKE_PX));
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#arrow)');
      path.dataset.id = edgeData.id;

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', String(HIT_STROKE_PX));
      hit.setAttribute('fill', 'none');
      hit.style.pointerEvents = 'stroke';
      hit.dataset.id = edgeData.id;

      svg.appendChild(hit);
      svg.appendChild(path);
      hit.addEventListener('click', (evt) => onEdgeClick(evt, path));

      const a = portPosition(fromNode, edgeData.fromPort);
      const d = buildStraightPathTowardCenter(a, toNode, edgeData.toPort);
      path.setAttribute('d', d);
      hit.setAttribute('d', d);

      edges.push({
        id: edgeData.id,
        fromId: edgeData.fromId,
        fromPort: edgeData.fromPort,
        toId: edgeData.toId,
        toPort: edgeData.toPort,
        pathEl: path,
        hitEl: hit
      });
    }
    updateJsonDisplay();
  }

  // ----- Menu helpers -----
  function openContextMenuAt(pt, target) {
    menu.style.left = `${pt.x}px`;
    menu.style.top = `${pt.y}px`;
    menu.style.display = 'block';
    menu.dataset.targetId = target.id;
    menu.dataset.targetType = target.type;
    if (target.type === 'edge') {
      menuLabel.style.display = 'none';
      menuDelete.textContent = 'Delete connector';
    } else {
      menuLabel.style.display = '';
      menuDelete.textContent = 'Delete';
    }
    menu.setAttribute('aria-hidden', 'false');
    if (outsideMenuListenerAttached) {
      window.removeEventListener('click', onOutsideMenu, true);
      outsideMenuListenerAttached = false;
    }
    setTimeout(() => {
      window.addEventListener('click', onOutsideMenu, true);
      outsideMenuListenerAttached = true;
    }, 0);
  }

  function createNode(type, x, y) {
    const id = `n${nextId++}`;
    const el = document.createElement('div');
    el.className = `flow-node ${type}`;
    el.tabIndex = 0;
    el.dataset.id = id;
    el.textContent = type === 'rect' ? 'Rect' : type === 'circle' ? 'Circle' : 'Diamond';

    const ports = document.createElement('div');
    ports.className = 'ports';
    ['t','b','l','r'].forEach(p => {
      const dot = document.createElement('div');
      dot.className = `flow-port ${p}`;
      dot.title = 'Drag to connect';
      dot.addEventListener('pointerdown', (e) => startConnect(e, id, p));
      ports.appendChild(dot);
    });
    
    // For diamond nodes, append ports as siblings to avoid clip-path issues
    if (type === 'diamond') {
      board.appendChild(el);
      board.appendChild(ports);
    } else {
      el.appendChild(ports);
      board.appendChild(el);
    }
    
    // Set initial position before getting dimensions
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    
    // For diamond nodes, position the sibling ports at the same location
    if (type === 'diamond') {
      ports.style.left = `${x}px`;
      ports.style.top = `${y}px`;
    }
    
    const rect = el.getBoundingClientRect();
    const w = rect.width || (type === 'rect' ? 120 : type === 'diamond' ? 86 : 72);
    const h = rect.height || (type === 'rect' ? 64 : type === 'diamond' ? 86 : 72);

    nodes.set(id, { el, x, y, w, h, type });
    updateJsonDisplay();

    el.addEventListener('pointerdown', (e) => startDrag(e, id));
    el.addEventListener('click', (e) => {
      // Only open menu if this was a click without movement
      if (e.target.classList.contains('flow-port')) return; // ports handled elsewhere
      e.stopPropagation();
      if (clickContext.id === id && !clickContext.moved) {
        hideMenu();
        openMenu(e, id);
      }
      // reset context after click
      clickContext = { id: null, moved: false, startX: 0, startY: 0 };
    });
    return id;
  }


  function positionNode(id) {
    const n = nodes.get(id);
    n.el.style.left = `${n.x}px`;
    n.el.style.top = `${n.y}px`;
    
    // For diamond nodes, also position the sibling ports
    if (n.type === 'diamond') {
      const ports = n.el.nextElementSibling;
      if (ports && ports.classList.contains('ports')) {
        ports.style.left = `${n.x}px`;
        ports.style.top = `${n.y}px`;
      }
    }
    
    updateEdgesForNode(id);
    updateJsonDisplay();
  }

  function startDrag(e, id) {
    if (e.target.classList.contains('flow-port')) return; // connecting takes precedence
    e.preventDefault();
    const n = nodes.get(id);
    const rootRect = root.getBoundingClientRect();
    clickContext = { id, moved: false, startX: e.clientX, startY: e.clientY };
    dragging = {
      id,
      offsetX: e.clientX - (n.x + rootRect.left),
      offsetY: e.clientY - (n.y + rootRect.top),
      originLeft: n.x,
      originTop: n.y,
    };
    n.el.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
  }

  function onDragMove(e) {
    if (!dragging) return;
    const n = nodes.get(dragging.id);
    const rootRect = root.getBoundingClientRect();
    n.x = Math.max(0, Math.min(rootRect.width - n.w, e.clientX - rootRect.left - dragging.offsetX));
    n.y = Math.max(0, Math.min(rootRect.height - n.h, e.clientY - rootRect.top - dragging.offsetY));
    positionNode(dragging.id);
    if (!clickContext.moved) {
      const dx = e.clientX - clickContext.startX;
      const dy = e.clientY - clickContext.startY;
      if (dx * dx + dy * dy > 9) { // >3px movement
        clickContext.moved = true;
      }
    }
  }

  function endDrag(e) {
    if (!dragging) return;
    const n = nodes.get(dragging.id);
    n.el.releasePointerCapture?.(e.pointerId);
    dragging = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
  }

  function startConnect(e, id, port) {
    e.preventDefault();
    // Visible path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#fbbf24');
    path.setAttribute('stroke-width', String(VISIBLE_STROKE_PX));
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrow)');
    // Hit path (transparent, wider)
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', String(HIT_STROKE_PX));
    hit.setAttribute('fill', 'none');
    hit.style.pointerEvents = 'stroke';
    // Append hit first so visible stays on top
    svg.appendChild(hit);
    svg.appendChild(path);
    hit.addEventListener('click', (evt) => onEdgeClick(evt, path));
    connecting = { fromId: id, fromPort: port, tempPath: path, tempHit: hit };
    window.addEventListener('pointermove', onConnectMove);
    window.addEventListener('pointerup', endConnect);
  }

  // Fallback hit-test for edges when SVG paths don't receive pointer events
  root.addEventListener('click', (e) => {
    if (e.target.closest('.flow-node')) return; // node clicks handled elsewhere
    const p = toSvgPoint(e.clientX, e.clientY);
    for (const edge of edges) {
      const geo = edge.pathEl;
      if (typeof geo.isPointInStroke === 'function' && geo.isPointInStroke(p)) {
        onEdgeClick(e, geo);
        break;
      }
    }
  }, true);

  function portPosition(n, port) {
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;
    if (port === 't') return { x: cx, y: n.y };
    if (port === 'b') return { x: cx, y: n.y + n.h };
    if (port === 'l') return { x: n.x, y: cy };
    if (port === 'r') return { x: n.x + n.w, y: cy };
    return { x: cx, y: cy };
  }

  function dirForPort(port) {
    if (port === 'l') return { x: -1, y: 0 };
    if (port === 'r') return { x: 1, y: 0 };
    if (port === 't') return { x: 0, y: -1 };
    if (port === 'b') return { x: 0, y: 1 };
    return { x: 1, y: 0 };
  }

  function normalize(vx, vy) {
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  function rectContains(node, pt) {
    return pt.x > node.x && pt.x < node.x + node.w && pt.y > node.y && pt.y < node.y + node.h;
  }

  function pushOutOfRect(pt, node, dir, margin) {
    const out = { x: pt.x, y: pt.y };
    if (!rectContains(node, out)) return out;
    // move along dir until outside + margin
    const step = 1;
    let iter = 0;
    while (rectContains(node, out) && iter < 200) {
      out.x += dir.x * step;
      out.y += dir.y * step;
      iter++;
    }
    out.x += dir.x * margin;
    out.y += dir.y * margin;
    return out;
  }

  function linePath(a, b) {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }

  function buildStraightPathTowardCenter(a, toNode, toPort) {
    // End at the exact edge port, and ensure arrowhead points toward the node center by
    // adding a short segment from outside -> edge so marker orientation faces inward.
    const edge = portPosition(toNode, toPort);
    const outside = offsetFromPort(edge, toPort, 12);
    return `M ${a.x} ${a.y} L ${outside.x} ${outside.y} L ${edge.x} ${edge.y}`;
  }

  function edgePointFor(node, fromPoint) {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const vx = fromPoint.x - cx;
    const vy = fromPoint.y - cy;
    if (Math.abs(vx) > Math.abs(vy)) {
      if (vx < 0) return { port: 'l', x: node.x, y: clamp(fromPoint.y, node.y, node.y + node.h) };
      return { port: 'r', x: node.x + node.w, y: clamp(fromPoint.y, node.y, node.y + node.h) };
    } else {
      if (vy < 0) return { port: 't', x: clamp(fromPoint.x, node.x, node.x + node.w), y: node.y };
      return { port: 'b', x: clamp(fromPoint.x, node.x, node.x + node.w), y: node.y + node.h };
    }
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function offsetFromPort(pt, port, dist) {
    if (port === 'l') return { x: pt.x - dist, y: pt.y };
    if (port === 'r') return { x: pt.x + dist, y: pt.y };
    if (port === 't') return { x: pt.x, y: pt.y - dist };
    if (port === 'b') return { x: pt.x, y: pt.y + dist };
    return pt;
  }

  function nearestPortForPoint(node, point) {
    // Evaluate distance from cursor point to each port center and choose nearest
    const candidates = [
      { port: 't', pos: portPosition(node, 't') },
      { port: 'b', pos: portPosition(node, 'b') },
      { port: 'l', pos: portPosition(node, 'l') },
      { port: 'r', pos: portPosition(node, 'r') },
    ];
    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      const d = (c.pos.x - point.x) ** 2 + (c.pos.y - point.y) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best.port;
  }

  function onConnectMove(e) {
    if (!connecting) return;
    const from = nodes.get(connecting.fromId);
    const rootRect = getRootRect();
    const a = portPosition(from, connecting.fromPort);
    const cursor = { x: e.clientX - rootRect.left, y: e.clientY - rootRect.top };
    // Detect node under cursor for live port preview
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overNodeEl = el && el.closest ? el.closest('.flow-node') : null;
    if (overNodeEl && overNodeEl.dataset.id && overNodeEl.dataset.id !== connecting.fromId) {
      const toNode = nodes.get(overNodeEl.dataset.id);
      const toPort = nearestPortForPoint(toNode, cursor);
      const d = buildStraightPathTowardCenter(a, toNode, toPort);
      connecting.tempPath.setAttribute('d', d);
      connecting.tempHit.setAttribute('d', d);
    } else {
      const d = linePath(a, cursor);
      connecting.tempPath.setAttribute('d', d);
      connecting.tempHit.setAttribute('d', d);
    }
  }

  function endConnect(e) {
    if (!connecting) return;
    const target = e.target.closest?.('.flow-node');
    if (target && target.dataset.id && target.dataset.id !== connecting.fromId) {
      const toId = target.dataset.id;
      const fromNode = nodes.get(connecting.fromId);
      const toNode = nodes.get(toId);
      const a = portPosition(fromNode, connecting.fromPort);
      // Choose the toPort based on which target port is closest to the cursor
      const cursor = clientToBoardPoint(e);
      const toPort = nearestPortForPoint(toNode, cursor);
      // Ensure only one edge between same endpoints (from -> to)
      deleteEdgeByEndpoints(connecting.fromId, toId);
      const d = buildStraightPathTowardCenter(a, toNode, toPort);
      connecting.tempPath.setAttribute('d', d);
      connecting.tempHit.setAttribute('d', d);
      const edgeId = `e${Date.now()}${Math.random().toString(36).slice(2)}`;
      connecting.tempPath.dataset.id = edgeId;
      connecting.tempHit.dataset.id = edgeId;
      edges.push({ id: edgeId, fromId: connecting.fromId, fromPort: connecting.fromPort, toId, toPort, pathEl: connecting.tempPath, hitEl: connecting.tempHit });
      updateJsonDisplay();
    } else {
      svg.removeChild(connecting.tempPath);
      svg.removeChild(connecting.tempHit);
    }
    window.removeEventListener('pointermove', onConnectMove);
    window.removeEventListener('pointerup', endConnect);
    connecting = null;
  }

  // ----- Edge helpers -----
  function redrawEdge(e) {
    const fromNode = nodes.get(e.fromId);
    const toNode = nodes.get(e.toId);
    const a = portPosition(fromNode, e.fromPort);
    const d = buildStraightPathTowardCenter(a, toNode, e.toPort);
    e.pathEl.setAttribute('d', d);
    e.hitEl.setAttribute('d', d);
  }

  function updateEdgesForNode(id) {
    for (const e of edges) {
      if (e.fromId === id || e.toId === id) {
        redrawEdge(e);
      }
    }
  }

  function onEdgeClick(e, pathEl) {
    e.stopPropagation();
    const edgeId = pathEl.dataset.id;
    if (!edgeId) return;
    // open menu for edge (delete only)
    openContextMenuAt(clientToBoardPoint(e), { type: 'edge', id: edgeId });
  }

  function clearAll() {
    for (const [, n] of nodes) {
      // For diamond nodes, remove the sibling ports BEFORE removing the diamond element
      if (n.type === 'diamond') {
        const ports = n.el.nextElementSibling;
        if (ports && ports.classList.contains('ports')) {
          ports.remove();
        }
      }
      n.el.remove();
    }
    nodes.clear();
    for (const e of edges) e.pathEl.remove();
    edges.length = 0;
    updateJsonDisplay();
  }

  function openMenu(e, id) {
    openContextMenuAt(clientToBoardPoint(e), { type: 'node', id });
  }

  function onOutsideMenu(ev) {
    if (!menu.contains(ev.target)) hideMenu();
  }

  function hideMenu() {
    menu.style.display = 'none';
    menu.dataset.targetId = '';
    menu.dataset.targetType = '';
    menu.setAttribute('aria-hidden', 'true');
    if (outsideMenuListenerAttached) {
      window.removeEventListener('click', onOutsideMenu, true);
      outsideMenuListenerAttached = false;
    }
  }

  function deleteNode(id) {
    const n = nodes.get(id);
    if (!n) return;
    n.el.remove();
    nodes.delete(id);
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];
      if (e.fromId === id || e.toId === id) {
        e.pathEl.remove();
        edges.splice(i, 1);
      }
    }
    updateJsonDisplay();
  }

  function deleteEdge(edgeId) {
    const idx = edges.findIndex(e => e.id === edgeId);
    if (idx >= 0) {
      edges[idx].pathEl.remove();
      edges[idx].hitEl.remove();
      edges.splice(idx, 1);
    }
    updateJsonDisplay();
  }

  function deleteEdgeByEndpoints(fromId, toId) {
    const idx = edges.findIndex(e => e.fromId === fromId && e.toId === toId);
    if (idx >= 0) {
      edges[idx].pathEl.remove();
      edges[idx].hitEl.remove();
      edges.splice(idx, 1);
    }
    updateJsonDisplay();
  }

  function labelNode(id) {
    const n = nodes.get(id);
    if (!n) return;
    const text = prompt('Enter label:', n.el.textContent || '');
    if (text !== null) {
      n.el.childNodes[0].nodeValue = text.trim() === '' ? (n.type === 'rect' ? 'Rect' : n.type === 'circle' ? 'Circle' : 'Diamond') : text;
      updateJsonDisplay();
    }
  }

  menuDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = menu.dataset.targetId;
    const targetType = menu.dataset.targetType;
    hideMenu();
    if (targetType === 'edge') {
      deleteEdge(id);
    } else {
      deleteNode(id);
    }
  });

  menuLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = menu.dataset.targetId;
    hideMenu();
    labelNode(id);
  });

  // ----- Import/Export functionality -----
  function showImportDialog() {
    importOverlay.style.display = 'flex';
    importText.value = '';
    importText.focus();
  }

  function hideImportDialog() {
    importOverlay.style.display = 'none';
  }

  function handleImport() {
    try {
      const data = JSON.parse(importText.value);
      if (!data.nodes || !data.edges) {
        alert('Invalid canvas data format. Expected {nodes: [], edges: []}');
        return;
      }
      deserializeCanvas(data);
      hideImportDialog();
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  }

  // Widget drag and drop functionality
  function setupWidgetDragAndDrop() {
    const widgetItems = document.querySelectorAll('.widget-item');
    
    widgetItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const type = item.dataset.type;
        draggingWidget = { type, element: item };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', type);
        item.style.opacity = '0.5';
      });
      
      item.addEventListener('dragend', (e) => {
        item.style.opacity = '1';
        draggingWidget = null;
      });
    });
    
    // Canvas drop handling
    board.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    
    board.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggingWidget) return;
      
      const rect = board.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Create node at drop position
      createNode(draggingWidget.type, x, y);
      draggingWidget = null;
    });
  }
  
  // Event listeners
  importBtn.addEventListener('click', showImportDialog);
  clearBtn.addEventListener('click', clearAll);

  importCancel.addEventListener('click', hideImportDialog);
  importConfirm.addEventListener('click', handleImport);
  importOverlay.addEventListener('click', (e) => {
    if (e.target === importOverlay) hideImportDialog();
  });

  // Initialize widget drag and drop
  setupWidgetDragAndDrop();
});


