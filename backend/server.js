console.log("--- [DEBUG] server.js script starting ---");

const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  console.log(`[DEBUG] Request received for ${req.url}`);
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Basic Backend OK');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

try {
  console.log(`--- [DEBUG] Attempting to listen on port: ${PORT} ---`);
  server.listen(PORT, () => {
    console.log(`--- [SUCCESS] Server listening on port ${PORT} ---`);
  });
} catch (error) {
   console.error("--- [ERROR] Failed to start server:", error);
   process.exit(1); // Hata durumunda çık
}

// Express, Socket.IO, DB kodları şimdilik kaldırıldı.
console.log("--- [DEBUG] server.js script finished initial execution ---");
