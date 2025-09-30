const path = require('path');
const express = require('express');
const fs = require('fs');
const https = require('https');

const app = express();
/*
app.use(helmet({
  strictTransportSecurity: false, // This line disables HSTS
}));
*/
const PORT = process.env.PORT || 80;

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

// Basic 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).send('Not Found');
});

app.listen(80, () => {
      console.log(`Example app listening on port 80`);
    });
