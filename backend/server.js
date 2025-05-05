require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const { pool } = require('./config/db');
const { isAdminSDKInitialized } = require('./config/firebaseAdmin');
const adminRoutes = require('./routes/adminRoutes');
const setupSocketHandlers = require('./socketHandlers');

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

setupSocketHandlers(io);

app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`Asrin Oyunu Backend Çalışıyor!`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda dinleniyor...`);
    if (!process.env.DATABASE_URL) { console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı."); }
    if (!process.env.FIREBASE_ADMIN_SDK_CONFIG) { console.error("HATA: FIREBASE_ADMIN_SDK_CONFIG çevre değişkeni bulunamadı!"); }
    else if (!isAdminSDKInitialized) { console.error("HATA: Firebase Admin SDK doğru şekilde başlatılamadı!"); }
});