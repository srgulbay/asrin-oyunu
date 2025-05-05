require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

// Oluşturduğumuz modülleri import edelim
const { pool } = require('./config/db'); // DB bağlantısını başlatmak için (içindeki console.log'lar çalışır)
const { isAdminSDKInitialized } = require('./config/firebaseAdmin'); // Sadece başlatıldığını kontrol etmek için
const adminRoutes = require('./routes/adminRoutes'); // Admin API rotaları
const setupSocketHandlers = require('./socketHandlers'); // Socket.IO oyun mantığı

const app = express();

// Genel Middleware'ler
const corsOptions = {
  origin: process.env.FRONTEND_URL,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// HTTP Sunucusunu Oluştur
const server = http.createServer(app);

// Socket.IO Sunucusunu Oluştur ve Ayarla
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket.IO Olay Yöneticilerini Başlat
setupSocketHandlers(io); // io nesnesini handler modülüne gönder

// API Rotalarını Bağla
app.use('/api/admin', adminRoutes);

// Kök Route (Sunucunun çalıştığını kontrol etmek için)
app.get('/', (req, res) => {
    // Oyun durumunu almak için socketHandlers modülünden bir fonksiyon çağırabiliriz
    // veya şimdilik basit bir mesaj döndürebiliriz.
    // Örnek: const gameState = require('./socketHandlers').getCurrentGameState();
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`Asrin Oyunu Backend Çalışıyor!`);
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda dinleniyor...`);
    if (!process.env.DATABASE_URL) {
        console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı.");
    }
    if (!process.env.FIREBASE_ADMIN_SDK_CONFIG) {
        console.error("HATA: FIREBASE_ADMIN_SDK_CONFIG çevre değişkeni bulunamadı! Firestore işlemleri çalışmayabilir.");
    } else if (!isAdminSDKInitialized) {
         console.error("HATA: Firebase Admin SDK doğru şekilde başlatılamadı! Firestore işlemleri çalışmayabilir.");
    }
});