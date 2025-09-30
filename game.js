// Simple Pacman-like game: Maze Muncher
// Arrow keys/WASD to move. Eat pellets, avoid ghosts.
document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const messageEl = document.getElementById('message');
  const restartBtn = document.getElementById('restart');

  const TILE = 20; // 28x31 grid like Pacman (approx based on canvas size)
  const COLS = Math.floor(canvas.width / TILE);
  const ROWS = Math.floor(canvas.height / TILE);

  // 0 empty, 1 wall, 2 pellet, 3 power pellet
  // Create a more interesting maze with strategic chokepoints and open areas
  const grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 ? 1 : 2
    )
  );

  // Create a more complex maze pattern
  // Central cross pattern with strategic gaps
  for (let r = 3; r < ROWS - 3; r++) {
    if (r !== Math.floor(ROWS/2) && r !== Math.floor(ROWS/2) - 1 && r !== Math.floor(ROWS/2) + 1) {
      grid[r][Math.floor(COLS/2)] = 1;
      grid[r][Math.floor(COLS/2) - 1] = 1;
    }
  }
  for (let c = 3; c < COLS - 3; c++) {
    if (c !== Math.floor(COLS/2) && c !== Math.floor(COLS/2) - 1 && c !== Math.floor(COLS/2) + 1) {
      grid[Math.floor(ROWS/2)][c] = 1;
      grid[Math.floor(ROWS/2) - 1][c] = 1;
    }
  }

  // Add corner rooms with single entrances
  // Top-left corner room
  for (let r = 2; r < 6; r++) {
    for (let c = 2; c < 6; c++) {
      if (r === 2 || c === 2) grid[r][c] = 1;
    }
  }
  grid[3][2] = 2; // Leave entrance

  // Top-right corner room
  for (let r = 2; r < 6; r++) {
    for (let c = COLS - 6; c < COLS - 2; c++) {
      if (r === 2 || c === COLS - 3) grid[r][c] = 1;
    }
  }
  grid[3][COLS - 3] = 2; // Leave entrance

  // Bottom-left corner room
  for (let r = ROWS - 6; r < ROWS - 2; r++) {
    for (let c = 2; c < 6; c++) {
      if (r === ROWS - 3 || c === 2) grid[r][c] = 1;
    }
  }
  grid[ROWS - 4][2] = 2; // Leave entrance

  // Bottom-right corner room
  for (let r = ROWS - 6; r < ROWS - 2; r++) {
    for (let c = COLS - 6; c < COLS - 2; c++) {
      if (r === ROWS - 3 || c === COLS - 3) grid[r][c] = 1;
    }
  }
  grid[ROWS - 4][COLS - 3] = 2; // Leave entrance

  // Add some strategic walls to create chokepoints
  // Vertical barriers with gaps
  for (let r = 8; r < ROWS - 8; r++) {
    if (r % 3 !== 0) {
      grid[r][8] = 1;
      grid[r][COLS - 9] = 1;
    }
  }

  // Horizontal barriers with gaps
  for (let c = 8; c < COLS - 8; c++) {
    if (c % 4 !== 0) {
      grid[8][c] = 1;
      grid[ROWS - 9][c] = 1;
    }
  }

  // Place power pellets in strategic locations
  grid[2][2] = 3; // Top-left corner
  grid[2][COLS - 3] = 3; // Top-right corner
  grid[ROWS - 3][2] = 3; // Bottom-left corner
  grid[ROWS - 3][COLS - 3] = 3; // Bottom-right corner
  grid[Math.floor(ROWS/2)][Math.floor(COLS/2)] = 3; // Center

  const startPos = { r: ROWS - 2, c: 2 };
  const player = { r: startPos.r, c: startPos.c, dir: { r: 0, c: 0 }, pending: { r: 0, c: 0 } };
  let powerMs = 0; // milliseconds remaining for power pellet effect
  let invincibleMs = 0; // milliseconds remaining for invincibility after spawn
  let score = 0;
  let lives = 3;

  const ghostStartPositions = [
    { r: 2, c: COLS - 3 },
    { r: 2, c: 2 },
    { r: ROWS - 3, c: COLS - 3 }
  ];
  
  const ghosts = [
    { 
      name: 'John', 
      r: 2, c: COLS - 3, 
      color: '#ef4444', 
      mode: 'chase', 
      scatterTarget: { r: 1, c: COLS - 2 },
      behavior: 'aggressive', // Always chases player with greedy step
      lastDirection: { r: 0, c: 0 }
    },
    { 
      name: 'Kevin', 
      r: 2, c: 2, 
      color: '#22d3ee', 
      mode: 'wander', 
      scatterTarget: { r: 1, c: 1 },
      behavior: 'patrol', // Wanders until player gets close
      lastDirection: { r: 0, c: 0 },
      chaseDistance: 5, // Start chasing when player is within 5 tiles
      loseDistance: 10 // Stop chasing when player is beyond 10 tiles
    },
    { 
      name: 'Doug', 
      r: ROWS - 3, c: COLS - 3, 
      color: '#8b5cf6', 
      mode: 'chase', 
      scatterTarget: { r: Math.floor(ROWS/2) - 1, c: Math.floor(COLS/2) - 1 },
      behavior: 'astar', // Uses A* pathfinding for optimal routes
      lastDirection: { r: 0, c: 0 },
      path: [] // Stores the calculated path
    },
  ];

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw grid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE, y = r * TILE;
        if (grid[r][c] === 1) {
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(x, y, TILE, TILE);
        } else if (grid[r][c] === 2) {
          ctx.fillStyle = '#e5e7eb';
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + TILE / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (grid[r][c] === 3) {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + TILE / 2, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // draw player
    const px = player.c * TILE + TILE / 2;
    const py = player.r * TILE + TILE / 2;
    let playerColor = '#fde047'; // Default yellow (classic Pacman)
    if (powerMs > 0) {
      playerColor = '#fbbf24'; // Brighter yellow when powered up
    } else if (invincibleMs > 0) {
      // Flash between yellow and white when invincible
      playerColor = Math.floor(invincibleMs / 100) % 2 === 0 ? '#fde047' : '#ffffff';
    }
    ctx.fillStyle = playerColor;
    ctx.beginPath();
    ctx.arc(px, py, TILE * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // draw ghosts
    for (const g of ghosts) {
      const gx = g.c * TILE + TILE / 2;
      const gy = g.r * TILE + TILE / 2;
      ctx.fillStyle = powerMs > 0 ? '#1e3a8a' : g.color; // Dark blue when power pellet active
      ctx.beginPath();
      ctx.arc(gx, gy, TILE * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function canMove(r, c) {
    return grid[r] && grid[r][c] !== undefined && grid[r][c] !== 1;
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.r === player.r && g.c === player.c) {
        if (powerMs > 0) {
          score += 200;
          g.r = 2; g.c = COLS - 3; // send back to corner
        } else if (invincibleMs <= 0) { // Only take damage if not invincible
          lives -= 1;
          resetAfterDeath();
        }
      }
    }
  }

  function updatePlayer() {
    // Try to apply pending direction if possible
    const nr = player.r + player.pending.r;
    const nc = player.c + player.pending.c;
    if (canMove(nr, nc)) {
      player.dir = { ...player.pending };
    }

    const tr = player.r + player.dir.r;
    const tc = player.c + player.dir.c;
    if (canMove(tr, tc)) {
      player.r = tr; player.c = tc;
      // Pellets
      if (grid[player.r][player.c] === 2) { score += 10; grid[player.r][player.c] = 0; }
      if (grid[player.r][player.c] === 3) { score += 50; grid[player.r][player.c] = 0; powerMs = 4000; }
      
      // Check collisions after player moves
      checkCollisions();
    }
  }

  function neighbors(r, c) {
    const opts = [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ];
    return opts.filter(p => canMove(p.r, p.c));
  }

  // A* pathfinding algorithm
  function astar(start, goal) {
    console.log('A*: Finding path from', start, 'to', goal);
    const openSet = [start];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    gScore.set(`${start.r},${start.c}`, 0);
    fScore.set(`${start.r},${start.c}`, heuristic(start, goal));
    
    let iterations = 0;
    while (openSet.length > 0 && iterations < 100) {
      iterations++;
      
      // Find node with lowest fScore
      let current = openSet[0];
      let currentIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        const currentF = fScore.get(`${current.r},${current.c}`) || Infinity;
        const nodeF = fScore.get(`${openSet[i].r},${openSet[i].c}`) || Infinity;
        if (nodeF < currentF) {
          current = openSet[i];
          currentIndex = i;
        }
      }
      
      // Remove current from openSet and add to closedSet
      openSet.splice(currentIndex, 1);
      closedSet.add(`${current.r},${current.c}`);
      
      // Check if we reached the goal
      if (current.r === goal.r && current.c === goal.c) {
        // Reconstruct path
        const path = [];
        let node = current;
        while (node) {
          path.unshift(node);
          node = cameFrom.get(`${node.r},${node.c}`);
        }
        console.log('A*: Found path with', path.length, 'steps');
        return path;
      }
      
      // Check all neighbors
      const neighborsList = neighbors(current.r, current.c);
      console.log('A*: Current', current, 'has', neighborsList.length, 'neighbors:', neighborsList);
      
      for (const neighbor of neighborsList) {
        const neighborKey = `${neighbor.r},${neighbor.c}`;
        
        // Skip if already in closed set
        if (closedSet.has(neighborKey)) {
          console.log('A*: Skipping neighbor', neighbor, 'already in closed set');
          continue;
        }
        
        const tentativeG = (gScore.get(`${current.r},${current.c}`) || 0) + 1;
        const currentG = gScore.get(neighborKey) || Infinity;
        
        console.log('A*: Evaluating neighbor', neighbor, 'tentativeG:', tentativeG, 'currentG:', currentG);
        
        if (tentativeG < currentG) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          fScore.set(neighborKey, tentativeG + heuristic(neighbor, goal));
          
          if (!openSet.some(n => n.r === neighbor.r && n.c === neighbor.c)) {
            openSet.push(neighbor);
            console.log('A*: Added neighbor', neighbor, 'to openSet');
          }
        }
      }
      
      console.log('A*: OpenSet now has', openSet.length, 'nodes');
    }
    
    console.log('A*: No path found after', iterations, 'iterations');
    return []; // No path found
  }

  
  
  // Heuristic function (Manhattan distance)
  function heuristic(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  }

  // Check if there's a clear path between two points (no walls blocking)
  function hasClearPath(r1, c1, r2, c2) {
    // Use Bresenham's line algorithm to check all points between the two positions
    const dx = Math.abs(r2 - r1);
    const dy = Math.abs(c2 - c1);
    const sx = r1 < r2 ? 1 : -1;
    const sy = c1 < c2 ? 1 : -1;
    let err = dx - dy;
    
    let x = r1;
    let y = c1;
    
    while (true) {
      // Check if current position is a wall
      if (grid[x] && grid[x][y] === 1) {
        return false; // Wall found, no clear path
      }
      
      // Check if we've reached the destination
      if (x === r2 && y === c2) {
        break;
      }
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    
    return true; // Clear path found
  }

  function updateGhosts() {
    for (const g of ghosts) {
      if (g.name === 'Doug') {
        // Skip Doug - he has his own update function
        continue;
      }
      
      if (powerMs > 0) {
        // frightened: move away greedily (both ghosts)
        let worst = { d: -1, r: g.r, c: g.c };
        for (const n of neighbors(g.r, g.c)) {
          const d = Math.abs(n.r - player.r) + Math.abs(n.c - player.c);
          if (d > worst.d) worst = { d, r: n.r, c: n.c };
        }
        g.r = worst.r; g.c = worst.c;
      } else {
        // Different behaviors based on ghost type
        if (g.name === 'John') {
          // John: Always chase the player aggressively
          let best = { d: Infinity, r: g.r, c: g.c };
          for (const n of neighbors(g.r, g.c)) {
            const d = Math.abs(n.r - player.r) + Math.abs(n.c - player.c);
            if (d < best.d) best = { d, r: n.r, c: n.c };
          }
          g.r = best.r; g.c = best.c;
        } else if (g.name === 'Kevin') {
          // Kevin: Wander until player gets close, then chase until player is far
          const distanceToPlayer = Math.abs(g.r - player.r) + Math.abs(g.c - player.c);
          
          if (g.mode === 'wander' && distanceToPlayer <= g.chaseDistance) {
            // Player entered detection range - start chasing!
            g.mode = 'chase';
          } else if (g.mode === 'chase' && distanceToPlayer > g.loseDistance) {
            // Player escaped - stop chasing and return to wandering
            g.mode = 'wander';
          }
          
          if (g.mode === 'chase') {
            // Chase the player
            let best = { d: Infinity, r: g.r, c: g.c };
            for (const n of neighbors(g.r, g.c)) {
              const d = Math.abs(n.r - player.r) + Math.abs(n.c - player.c);
              if (d < best.d) best = { d, r: n.r, c: n.c };
            }
            g.r = best.r; g.c = best.c;
          } else {
            // Wander around
            const availableMoves = neighbors(g.r, g.c);
            if (availableMoves.length > 0) {
              // Avoid reversing direction unless necessary
              const validMoves = availableMoves.filter(n => 
                !(n.r === g.r - g.lastDirection.r && n.c === g.c - g.lastDirection.c)
              );
              
              const movesToChoose = validMoves.length > 0 ? validMoves : availableMoves;
              const randomMove = movesToChoose[Math.floor(Math.random() * movesToChoose.length)];
              
              g.lastDirection = { r: randomMove.r - g.r, c: randomMove.c - g.c };
              g.r = randomMove.r; g.c = randomMove.c;
            }
          }
      }
    }
    
    // Check collisions after ghosts move
    checkCollisions();
    }
  }

  function updateDoug() {
    const doug = ghosts.find(g => g.name === 'Doug');
    if (!doug) return;
    
    if (powerMs > 0) {
      // frightened: move away greedily
      let worst = { d: -1, r: doug.r, c: doug.c };
      for (const n of neighbors(doug.r, doug.c)) {
        const d = Math.abs(n.r - player.r) + Math.abs(n.c - player.c);
        if (d > worst.d) worst = { d, r: n.r, c: n.c };
      }
      doug.r = worst.r; doug.c = worst.c;
      doug.path = []; // Clear path when frightened
    } else {
      // Use A* pathfinding for optimal routes
      const distanceToPlayer = Math.abs(doug.r - player.r) + Math.abs(doug.c - player.c);
      
      // Special close-range behavior when within 4 tiles
      if (distanceToPlayer <= 4) {
        // Check if there's a clear path to player (no walls in between)
        if (hasClearPath(doug.r, doug.c, player.r, player.c)) {
          // Make sure Doug has valid moves available (not stuck against wall)
          const availableMoves = neighbors(doug.r, doug.c);
          if (availableMoves.length > 0) {
            // Recalculate A* for close-range precision
            doug.path = astar({ r: doug.r, c: doug.c }, { r: player.r, c: player.c });
            console.log('Doug close-range A* path:', doug.path.length, 'steps');
          } else {
            console.log('Doug is stuck against wall, skipping close-range recalculation');
          }
        }
      }
      
      // Normal path recalculation when path is exhausted
      if (doug.path.length <= 1) {
        // Make sure Doug has valid moves available (not stuck against wall)
        const availableMoves = neighbors(doug.r, doug.c);
        if (availableMoves.length > 0) {
          // Recalculate path to player
          doug.path = astar({ r: doug.r, c: doug.c }, { r: player.r, c: player.c });
          console.log('Doug A* path:', doug.path.length, 'steps');
        } else {
          console.log('Doug is stuck against wall, cannot recalculate path');
        }
      }
      
      if (doug.path.length > 1) {
        // Move to next step in path
        const nextStep = doug.path[1];
        console.log('Doug moving from', doug.r, doug.c, 'to', nextStep.r, nextStep.c);
        doug.r = nextStep.r;
        doug.c = nextStep.c;
        doug.path.shift(); // Remove current position from path
      } else {
        console.log('Doug has no valid path, staying at', doug.r, doug.c);
      }
    }
  }
  

  function resetAfterDeath() {
    player.r = startPos.r; player.c = startPos.c; player.dir = { r: 0, c: 0 }; player.pending = { r: 0, c: 0 };
    invincibleMs = 2000; // 2 seconds of invincibility after spawn
    
    // Reset ghosts to their starting positions and reset their behavior
    for (let i = 0; i < ghosts.length; i++) {
      ghosts[i].r = ghostStartPositions[i].r;
      ghosts[i].c = ghostStartPositions[i].c;
      ghosts[i].lastDirection = { r: 0, c: 0 };
      if (ghosts[i].name === 'Kevin') {
        ghosts[i].mode = 'wander'; // Reset Kevin to wandering mode
      } else if (ghosts[i].name === 'Doug') {
        ghosts[i].path = []; // Clear Doug's path
      }
    }
    
    messageEl.textContent = lives > 0 ? 'Ouch! Be careful.' : 'Game Over';
  }

  function checkWin() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === 2 || grid[r][c] === 3) return false;
      }
    }
    messageEl.textContent = 'You cleared the maze!';
    return true;
  }

  // Fixed timesteps: player vs ghost speeds
  const PLAYER_STEP_MS = 100; // player moves every 100ms
  const GHOST_STEP_MS = 133;  // ~75% player speed (John & Kevin)
  const DOUG_STEP_MS = 166;   // ~60% player speed (Doug is slower)
  let lastNow = 0;
  let playerAcc = 0;
  let ghostAcc = 0;
  let dougAcc = 0;
  let gameOver = false;

  function tick(now) {
    if (lastNow === 0) lastNow = now;
    const delta = Math.min(50, now - lastNow); // clamp to avoid big jumps
    lastNow = now;

    if (!gameOver) {
      playerAcc += delta;
      ghostAcc += delta;
      dougAcc += delta;
      powerMs = Math.max(0, powerMs - delta);
      invincibleMs = Math.max(0, invincibleMs - delta);

      while (playerAcc >= PLAYER_STEP_MS) {
        updatePlayer();
        playerAcc -= PLAYER_STEP_MS;
      }
      while (ghostAcc >= GHOST_STEP_MS) {
        updateGhosts();
        ghostAcc -= GHOST_STEP_MS;
      }
      while (dougAcc >= DOUG_STEP_MS) {
        updateDoug();
        dougAcc -= DOUG_STEP_MS;
      }

      // Check collisions every frame for smooth detection
      checkCollisions();

      scoreEl.textContent = String(score);
      livesEl.textContent = String(lives);
      gameOver = lives <= 0 || checkWin();
    }

    draw();
    if (!gameOver) requestAnimationFrame(tick);
  }

  // input
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') player.pending = { r: -1, c: 0 };
    if (key === 'arrowdown' || key === 's') player.pending = { r: 1, c: 0 };
    if (key === 'arrowleft' || key === 'a') player.pending = { r: 0, c: -1 };
    if (key === 'arrowright' || key === 'd') player.pending = { r: 0, c: 1 };
  });

  restartBtn.addEventListener('click', () => {
    window.location.reload();
  });

  draw();
  requestAnimationFrame(tick);
});