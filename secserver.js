const path = require('path');
const express = require('express');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 443;
const caKey = process.env.KEY;
const caCert = process.env.CERT;

// Load SSL certificates
const options = {
  key: fs.readFileSync(caKey),
  cert: fs.readFileSync(caCert)
};

// Serve all static files (HTML, CSS, JS, images) from the project root
app.use(express.static(__dirname));

// Route: Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

// Route: About
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'about.html'));
});

// Route: Game
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'game.html'));
});

// Route: Canvas
app.get('/canvas', (req, res) => {
  res.sendFile(path.join(__dirname, 'canvas.html'));
});

// Route: Projects
app.get('/projects', (req, res) => {
  res.sendFile(path.join(__dirname, 'projects.html'));
});

// Route: Impressions
app.get('/impressions', (req, res) => {
  res.sendFile(path.join(__dirname, 'impressions.html'));
});

// Basic 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// Create HTTPS server
https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS Server running at https://localhost:${PORT}`);
});