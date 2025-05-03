// Çevre değişkenlerini .env dosyasından yükle
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

// Veritabanı bağlantı havuzu
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
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

const allowedOrigins = [ process.env.FRONTEND_URL /*, process.env.FRONTEND_PRODUCTION_URL */ ].filter(Boolean);
// VERCEL DEPLOYMENT NOTU: Vercel frontend ve backend'i aynı domain altında (.vercel.app) sunuyorsa
// CORS ayarları daha basit olabilir veya gerekmeyebilir. Ama farklı domainlerdeyse (örn. custom domain)
// production frontend URL'ini buraya eklemek veya Vercel env var'dan okumak gerekir.
console.log("İzin verilen kaynaklar (CORS):", allowedOrigins);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Vercel preview/branch deployları için origin kontrolünü esnetmek gerekebilir.
      if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app')) {
           callback(null, true);
      } else {
           callback(new Error('CORS İzin Vermiyor'), false);
       }
    },
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000; // Vercel PORT'u otomatik yönetir.

// === Oyun State Yönetimi ===
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
let currentGameState = GAME_MODES.IDLE;
// Oyuncu bilgisi: { score: 0, name: 'Oyuncu Adi', isReady: false }
let tournamentPlayers = new Map();
const TOURNAMENT_ROOM = 'global_tournament_room';
// MIN_PLAYERS_TO_START artık sadece bir gösterge, başlatma onaya bağlı.
const MIN_PLAYERS_TO_INFORM = 1; // En az kaç oyuncu olunca bekleme mesajı gösterilsin
let gameQuestions = [];
let currentQuestionIndex = -1;
let questionTimer = null;
const QUESTION_TIME_LIMIT = 15;

// === Yardımcı Fonksiyonlar ===
function broadcastTournamentState() {
     const playersForFrontend = Array.from(tournamentPlayers.entries()).map(([id, data]) => ({
         id,
         name: data.name,
         score: data.score,
         isReady: data.isReady // Hazır bilgisini de gönder
     }));
    io.to(TOURNAMENT_ROOM).emit('tournament_state_update', {
        gameState: currentGameState,
        players: playersForFrontend,
        currentQuestionIndex: currentQuestionIndex,
        totalQuestions: gameQuestions.length
    });
}

// ASYNC olarak güncellendi - veritabanı sorgusu için
async function startTournament() {
    // Başlatma koşulu: Beklemede olmalı ve HERKES hazır olmalı (ve en az 1 kişi olmalı)
    const allPlayers = Array.from(tournamentPlayers.values());
    if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT ||
        allPlayers.length < 1 || // En az 1 oyuncu
        !allPlayers.every(p => p.isReady)) { // Herkes hazır mı?
        console.log("Turnuva başlatılamadı - durum veya hazır olmayan oyuncu var.");
        io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Tüm oyuncuların hazır olması bekleniyor...' });
        return;
    }

    console.log("Tüm oyuncular hazır. Turnuva başlıyor!");
    currentGameState = GAME_MODES.TOURNAMENT_RUNNING;

    try {
        // Soruları veritabanından çek
        if (!pool) throw new Error("Veritabanı bağlantısı yok!");

        // TODO: Kategorilere göre filtreleme ileride eklenecek. Şimdilik tümünü veya rastgele 5 tane alalım.
        // const categoryFilter = 'Genel Kültür'; // Örnek
        // const result = await pool.query('SELECT * FROM questions WHERE category = $1 ORDER BY RANDOM() LIMIT 5', [categoryFilter]);
        const result = await pool.query('SELECT id, question_text, options, correct_answer FROM questions ORDER BY RANDOM() LIMIT 5'); // Örnek: Rastgele 5 soru

        if (result.rows.length === 0) {
            throw new Error("Veritabanında yeterli soru bulunamadı!");
        }

        gameQuestions = result.rows;
        console.log(`${gameQuestions.length} adet soru veritabanından çekildi.`);
        currentQuestionIndex = -1;
        // Oyuncuların skorunu ve hazır durumunu sıfırla
        tournamentPlayers.forEach(player => {
            player.score = 0;
            player.isReady = false; // Oyun başlayınca hazır durumu kalkar
        });

        broadcastTournamentState(); // Oyunun başladığını ve oyuncu listesini gönder
        sendNextQuestion();

    } catch (error) {
        console.error("Turnuva başlatılırken hata (soru çekme vb.):", error);
        io.to(TOURNAMENT_ROOM).emit('error_message', { message: 'Oyun başlatılırken bir sorun oluştu. Lütfen tekrar deneyin.' });
        // Oyunu IDLE durumuna geri döndür
        currentGameState = GAME_MODES.IDLE;
        tournamentPlayers.forEach(p => p.isReady = false); // Hazır durumlarını sıfırla
        broadcastTournamentState(); // Hata durumunu yansıt
    }
}

function sendNextQuestion() { /* ... önceki kodla aynı ... */ clearTimeout(questionTimer); currentQuestionIndex++; if (currentQuestionIndex >= gameQuestions.length) { endTournament(); return; } const question = gameQuestions[currentQuestionIndex]; const questionData = { index: currentQuestionIndex, total: gameQuestions.length, text: question.question_text, options: question.options, timeLimit: QUESTION_TIME_LIMIT }; console.log(`Soru <span class="math-inline">\{currentQuestionIndex \+ 1\}/</span>{gameQuestions.length} gönderiliyor: ${question.question_text}`); io.to(TOURNAMENT_ROOM).emit('new_question', questionData); questionTimer = setTimeout(() => { console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`); io.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex }); sendNextQuestion(); }, QUESTION_TIME_LIMIT * 1000); }
function endTournament() { /* ... önceki kodla aynı ... */ clearTimeout(questionTimer); console.log("Turnuva bitti!"); currentGameState = GAME_MODES.GAME_OVER; const results = Array.from(tournamentPlayers.entries()).map(([id, data]) => ({ id, name: data.name, score: data.score })).sort((a, b) => b.score - a.score); io.to(TOURNAMENT_ROOM).emit('game_over', { results }); setTimeout(() => { console.log("Oyun durumu IDLE'a dönüyor."); currentGameState = GAME_MODES.IDLE; tournamentPlayers.clear(); gameQuestions = []; currentQuestionIndex = -1; io.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun bekleniyor.' }); }, 15000); }


// === Socket Olayları ===
io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}, Durum: ${currentGameState}`);

  // Oyuncu katıldığında mevcut durumu gönderelim
  socket.emit('initial_state', {
       gameState: currentGameState,
       players: Array.from(tournamentPlayers.entries()).map(([id, data]) => ({ id, name: data.name, score: data.score, isReady: data.isReady })),
       // Belki aktif soru bilgisi de gönderilebilir? Ama genellikle state_update yeterli.
  });


  socket.on('join_tournament', (data) => {
    const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`;

    if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) {
         socket.emit('error_message', { message: 'Devam eden oyun var veya yeni bitti.' }); return;
    }
    if (tournamentPlayers.has(socket.id)) { /* ... Zaten listede ise tekrar ekleme ... */ console.log(`${playerName} zaten listede.`); socket.join(TOURNAMENT_ROOM); return; } // Sadece odaya ekle ve çık

    console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{playerName}) turnuvaya katılıyor.`);
    socket.join(TOURNAMENT_ROOM);
    tournamentPlayers.set(socket.id, { score: 0, name: playerName, isReady: false }); // isReady: false olarak ekle

    if (currentGameState === GAME_MODES.IDLE) {
         currentGameState = GAME_MODES.WAITING_TOURNAMENT;
    }

    console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys()));
    broadcastTournamentState(); // Yeni oyuncu listesini (hazır değil olarak) herkese gönder

    // Otomatik başlatma yok. Bekleme mesajı gönder.
    if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_INFORM) {
         io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Oyuncular bekleniyor. Hazır olduğunuzda belirtin.' });
    }
  });

  // YENİ OLAY: Oyuncu Hazır
  socket.on('player_ready', () => {
      if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || !tournamentPlayers.has(socket.id)) {
           console.log("Oyuncu hazır olamaz (durum veya oyuncu geçersiz).");
           return;
      }

      const player = tournamentPlayers.get(socket.id);
      if (!player.isReady) { // Sadece hazır değilse güncelle
          player.isReady = true;
          console.log(`Oyuncu <span class="math-inline">\{player\.name\} \(</span>{socket.id}) hazır.`);
          broadcastTournamentState(); // Güncel hazır listesini herkese gönder

          // Herkes hazır mı kontrol et
          const allPlayersArray = Array.from(tournamentPlayers.values());
          if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) {
               console.log("Tüm oyuncular hazır, turnuva başlatılıyor...");
               // Başlatmadan önce kısa bir gecikme eklenebilir
               // setTimeout(startTournament, 1000);
               startTournament(); // Hemen başlat
          } else {
               io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Diğer oyuncuların hazır olması bekleniyor...' });
          }
      }
  });


   socket.on('submit_answer', (data) => { /* ... önceki kodla aynı, isReady kontrolü gereksiz ... */ if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return; if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) { console.warn(`Geçersiz veya eski soru index'i: Gelen ${data.questionIndex}, Beklenen ${currentQuestionIndex}`); return; } const player = tournamentPlayers.get(socket.id); const question = gameQuestions[currentQuestionIndex]; const correctAnswer = question?.correct_answer; console.log(`Cevap alındı: Oyuncu <span class="math-inline">\{player\.name\} \(</span>{socket.id}), Soru ${currentQuestionIndex+1}, Cevap: ${data.answer}`); if (correctAnswer && data.answer === correctAnswer) { player.score += 10; console.log(`Doğru! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) skoru: ${player.score}`); socket.emit('answer_result', { correct: true, score: player.score, questionIndex: currentQuestionIndex }); broadcastTournamentState(); } else { console.log(`Yanlış! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) cevap: ${data.answer}, Doğru: ${correctAnswer}`); socket.emit('answer_result', { correct: false, score: player.score, questionIndex: currentQuestionIndex }); } });


  socket.on('disconnect', (reason) => { /* ... önceki kodla aynı, isReady kontrolü ... */ console.log(`Ayrıldı: ${socket.id}. Sebep: ${reason}`); if (tournamentPlayers.has(socket.id)) { const player = tournamentPlayers.get(socket.id); const wasReady = player.isReady; // Ayrılmadan önceki hazır durumu tournamentPlayers.delete(socket.id); console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{player.name}) turnuvadan ayrıldı.`); console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys())); if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) { broadcastTournamentState(); // Ayrılan oyuncu sonrası listeyi güncelle // Eğer bekleme durumundayken hazır olan bir oyuncu ayrıldıysa ve kalanlar hazırsa oyunu başlatmayı tekrar dene? if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && wasReady) { const allPlayersArray = Array.from(tournamentPlayers.values()); if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) { console.log("Hazır oyuncu ayrıldı, kalanlar hazır. Turnuva başlatılıyor..."); startTournament(); } } // Oyun devam ederken minimumun altına düşerse bitir if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING && tournamentPlayers.size < 1) { /* MIN_PLAYERS_TO_START yerine 1 daha mantıklı olabilir */ console.log("Oyuncu kalmadı, turnuva bitiriliyor."); endTournament(); } } } });

});

server.listen(PORT, () => { /* ... önceki kodla aynı ... */ console.log(`Sunucu ${PORT} portunda dinleniyor...`); if (!process.env.DATABASE_URL) console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı."); if (!process.env.FRONTEND_URL && !process.env.FRONTEND_PRODUCTION_URL) console.warn("UYARI: FRONTEND URL çevre değişkenleri bulunamadı."); });
