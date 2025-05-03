// Çevre değişkenlerini .env dosyasından yükle
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

// Veritabanı bağlantı havuzu
const pool = process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    // Railway veya diğer platformlar için SSL gerekebilir
    // ssl: { rejectUnauthorized: false }
 }) : null;
if (pool) {
  pool.connect((err, client, release) => {
    if (err) return console.error('DB Bağlantı Hatası:', err.stack);
    client.query('SELECT NOW()', (err, result) => {
      release();
      if (err) return console.error('DB Test Sorgu Hatası:', err.stack);
      console.log('Veritabanına Bağlandı:', result.rows[0].now);
    });
  });
} else { console.warn("UYARI: DATABASE_URL yok, DB bağlantısı kurulmadı."); }

// FRONTEND_URL çevre değişkeninden okunacak
const allowedOrigins = [ process.env.FRONTEND_URL ].filter(Boolean);
console.log("İzin verilen kaynaklar (CORS):", allowedOrigins);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Gelen isteğin kaynağını logla (debug için)
      // console.log(`[CORS Check] Origin: ${origin}, Allowed: ${allowedOrigins}`);
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
           callback(null, true);
      } else {
           console.warn(`CORS Engeli: ${origin} kaynağına izin verilmedi.`);
           callback(new Error('CORS İzin Vermiyor'), false);
       }
    },
    methods: ["GET", "POST"]
  }
});

// PORT çevre değişkeni Railway tarafından sağlanır
const PORT = process.env.PORT || 3000; // Lokal için fallback

// === Oyun State Yönetimi ===
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
let currentGameState = GAME_STATES.IDLE;
// Oyuncu bilgisi: { score: 0, name: 'Oyuncu Adi', isReady: false }
let tournamentPlayers = new Map();
const TOURNAMENT_ROOM = 'global_tournament_room';
const MIN_PLAYERS_TO_INFORM = 1; // En az kaç oyuncu olunca bekleme mesajı gösterilsin
let gameQuestions = [];
let currentQuestionIndex = -1;
let questionTimer = null;
const QUESTION_TIME_LIMIT = 15;

// === Yardımcı Fonksiyonlar ===
function broadcastTournamentState() {
     const playersForFrontend = Array.from(tournamentPlayers.entries()).map(([id, data]) => ({
         id, name: data.name, score: data.score, isReady: data.isReady
     }));
    io.to(TOURNAMENT_ROOM).emit('tournament_state_update', {
        gameState: currentGameState, players: playersForFrontend,
        currentQuestionIndex: currentQuestionIndex, totalQuestions: gameQuestions.length
    });
}

async function startTournament() {
    const allPlayers = Array.from(tournamentPlayers.values());
    // Başlatma koşulu: Beklemede olmalı ve HERKES hazır olmalı (ve en az 1 kişi olmalı)
    if (currentGameState !== GAME_STATES.WAITING_TOURNAMENT || allPlayers.length < 1 || !allPlayers.every(p => p.isReady)) {
        console.log("Turnuva başlatılamadı - durum veya hazır olmayan oyuncu var.");
        io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Tüm oyuncuların hazır olması bekleniyor...' }); return;
    }
    console.log("Tüm oyuncular hazır. Turnuva başlıyor!");
    currentGameState = GAME_MODES.TOURNAMENT_RUNNING;
    try {
        if (!pool) throw new Error("Veritabanı bağlantısı yok!");
        // Örnek: Rastgele 5 soru çek (tablo ve sütun adları doğru olmalı)
        const result = await pool.query('SELECT id, question_text, options, correct_answer FROM questions ORDER BY RANDOM() LIMIT 5');
        if (result.rows.length === 0) {
             // Hata vermek yerine belki örnek soruları kullan?
             console.warn("UYARI: Veritabanında soru bulunamadı, örnek sorular kullanılıyor.");
             gameQuestions = [
                 { id: 1, question_text: '1+1 Kaç Yapar?', options: ['1', '2', '3', '4'], correct_answer: '2' },
                 { id: 2, question_text: 'Türkiye\'nin başkenti?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara' },
                 { id: 3, question_text: 'React bir ...?', options: ['Framework', 'Kütüphane', 'Dil', 'Veritabanı'], correct_answer: 'Kütüphane' }
             ];
             // throw new Error("Veritabanında yeterli soru bulunamadı!");
         } else {
             gameQuestions = result.rows;
             console.log(`${gameQuestions.length} adet soru veritabanından çekildi.`);
         }

        currentQuestionIndex = -1;
        tournamentPlayers.forEach(player => { player.score = 0; player.isReady = false; });
        broadcastTournamentState();
        sendNextQuestion();
    } catch (error) {
        console.error("Turnuva başlatılırken hata (soru çekme vb.):", error);
        io.to(TOURNAMENT_ROOM).emit('error_message', { message: `Oyun başlatılırken bir sorun oluştu: ${error.message}` });
        currentGameState = GAME_MODES.IDLE;
        tournamentPlayers.forEach(p => p.isReady = false);
        broadcastTournamentState();
    }
}

function sendNextQuestion() { /* ... önceki kod ... */ clearTimeout(questionTimer); currentQuestionIndex++; if (currentQuestionIndex >= gameQuestions.length) { endTournament(); return; } const question = gameQuestions[currentQuestionIndex]; const questionData = { index: currentQuestionIndex, total: gameQuestions.length, text: question.question_text, options: question.options, timeLimit: QUESTION_TIME_LIMIT }; console.log(`Soru <span class="math-inline">\{currentQuestionIndex \+ 1\}/</span>{gameQuestions.length} gönderiliyor: ${question.question_text}`); io.to(TOURNAMENT_ROOM).emit('new_question', questionData); questionTimer = setTimeout(() => { console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`); io.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex }); sendNextQuestion(); }, QUESTION_TIME_LIMIT * 1000); }
function endTournament() { /* ... önceki kod ... */ clearTimeout(questionTimer); console.log("Turnuva bitti!"); currentGameState = GAME_MODES.GAME_OVER; const results = Array.from(tournamentPlayers.entries()).map(([id, data]) => ({ id, name: data.name, score: data.score })).sort((a, b) => b.score - a.score); io.to(TOURNAMENT_ROOM).emit('game_over', { results }); setTimeout(() => { console.log("Oyun durumu IDLE'a dönüyor."); currentGameState = GAME_MODES.IDLE; tournamentPlayers.clear(); gameQuestions = []; currentQuestionIndex = -1; io.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun bekleniyor.' }); }, 15000); }

// === Socket Olayları ===
io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}, Durum: ${currentGameState}`);
  socket.emit('initial_state', { gameState: currentGameState, players: Array.from(tournamentPlayers.entries()).map(([id, data]) => ({ id, name: data.name, score: data.score, isReady: data.isReady })) });

  socket.on('join_tournament', (data) => { /* ... önceki kod ... */ const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`; if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) { socket.emit('error_message', { message: 'Devam eden oyun var veya yeni bitti.' }); return; } if (tournamentPlayers.has(socket.id)) { console.log(`${playerName} zaten listede.`); socket.join(TOURNAMENT_ROOM); return; } console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{playerName}) turnuvaya katılıyor.`); socket.join(TOURNAMENT_ROOM); tournamentPlayers.set(socket.id, { score: 0, name: playerName, isReady: false }); if (currentGameState === GAME_MODES.IDLE) { currentGameState = GAME_MODES.WAITING_TOURNAMENT; } console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys())); broadcastTournamentState(); if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_INFORM) { io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Oyuncular bekleniyor. Hazır olduğunuzda belirtin.' }); } });
  socket.on('player_ready', () => { /* ... önceki kod ... */ if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || !tournamentPlayers.has(socket.id)) return; const player = tournamentPlayers.get(socket.id); if (!player.isReady) { player.isReady = true; console.log(`Oyuncu <span class="math-inline">\{player\.name\} \(</span>{socket.id}) hazır.`); broadcastTournamentState(); const allPlayersArray = Array.from(tournamentPlayers.values()); if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) { console.log("Tüm oyuncular hazır, turnuva başlatılıyor..."); startTournament(); } else { io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Diğer oyuncuların hazır olması bekleniyor...' }); } } });
  socket.on('submit_answer', (data) => { /* ... önceki kod ... */ if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return; if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) { console.warn(`Geçersiz veya eski soru index'i: Gelen ${data.questionIndex}, Beklenen ${currentQuestionIndex}`); return; } const player = tournamentPlayers.get(socket.id); const question = gameQuestions[currentQuestionIndex]; const correctAnswer = question?.correct_answer; console.log(`Cevap alındı: Oyuncu <span class="math-inline">\{player\.name\} \(</span>{socket.id}), Soru ${currentQuestionIndex+1}, Cevap: ${data.answer}`); if (correctAnswer && data.answer === correctAnswer) { player.score += 10; console.log(`Doğru! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) skoru: ${player.score}`); socket.emit('answer_result', { correct: true, score: player.score, questionIndex: currentQuestionIndex }); broadcastTournamentState(); } else { console.log(`Yanlış! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) cevap: ${data.answer}, Doğru: ${correctAnswer}`); socket.emit('answer_result', { correct: false, score: player.score, questionIndex: currentQuestionIndex }); } });
  socket.on('disconnect', (reason) => { /* ... önceki kod ... */ console.log(`Ayrıldı: ${socket.id}. Sebep: ${reason}`); if (tournamentPlayers.has(socket.id)) { const player = tournamentPlayers.get(socket.id); const wasReady = player.isReady; tournamentPlayers.delete(socket.id); console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{player.name}) turnuvadan ayrıldı.`); console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys())); if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) { broadcastTournamentState(); if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && wasReady) { const allPlayersArray = Array.from(tournamentPlayers.values()); if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) { console.log("Hazır oyuncu ayrıldı, kalanlar hazır. Turnuva başlatılıyor..."); startTournament(); } } if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING && tournamentPlayers.size < 1) { console.log("Oyuncu kalmadı, turnuva bitiriliyor."); endTournament(); } } } });
});

// '/' route'unu ekleyelim (Railway sağlık kontrolü veya basit test için)
app.get('/', (req, res) => {
   res.setHeader('Content-Type', 'text/plain');
   res.status(200).send(`Asrin Oyunu Backend Çalışıyor! Durum: ${currentGameState}, Oyuncular: ${tournamentPlayers.size}`);
 });

server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda dinleniyor...`);
  if (!process.env.DATABASE_URL) console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı.");
  if (!process.env.FRONTEND_URL) console.warn("UYARI: FRONTEND_URL çevre değişkeni bulunamadı.");
});
