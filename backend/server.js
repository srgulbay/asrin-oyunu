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

const allowedOrigins = [ process.env.FRONTEND_URL /*, process.env.FRONTEND_PRODUCTION_URL*/ ].filter(Boolean);
console.log("İzin verilen kaynaklar (CORS):", allowedOrigins);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) callback(null, true);
      else callback(new Error('CORS İzin Vermiyor'), false);
    },
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// === Oyun State Yönetimi ===
const GAME_MODES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
let currentGameState = GAME_MODES.IDLE;
let tournamentPlayers = new Map(); // socket.id -> { score: 0, name: 'Oyuncu ' + socket.id.substring(0,4) }
const TOURNAMENT_ROOM = 'global_tournament_room';
const MIN_PLAYERS_TO_START = 2; // Turnuvayı başlatmak için gereken min oyuncu
let gameQuestions = []; // Aktif oyunun soruları
let currentQuestionIndex = -1;
let questionTimer = null;
const QUESTION_TIME_LIMIT = 15; // Saniye

// === Yardımcı Fonksiyonlar ===
function broadcastTournamentState() {
    // Sadece gerekli bilgiyi gönder, tüm oyuncu verisi yerine belki sadece isim/skor/id
     const playersForFrontend = Array.from(tournamentPlayers.entries()).map(([id, data]) => ({
         id,
         name: data.name,
         score: data.score
     }));

    io.to(TOURNAMENT_ROOM).emit('tournament_state_update', {
        gameState: currentGameState,
        players: playersForFrontend,
        currentQuestionIndex: currentQuestionIndex,
        totalQuestions: gameQuestions.length
    });
}

function startTournament() {
    if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || tournamentPlayers.size < MIN_PLAYERS_TO_START) {
        console.log("Turnuva başlatılamadı - durum veya oyuncu sayısı uygun değil.");
        return;
    }
    console.log("Turnuva başlıyor!");
    currentGameState = GAME_MODES.TOURNAMENT_RUNNING;

    // TODO: Soruları veritabanından çek (`pool.query`)
    // Şimdilik örnek sorular:
    gameQuestions = [
        { id: 1, question_text: '1+1 Kaç Yapar?', options: ['1', '2', '3', '4'], correct_answer: '2' },
        { id: 2, question_text: 'Türkiye\'nin başkenti?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara' },
        { id: 3, question_text: 'React bir ...?', options: ['Framework', 'Kütüphane', 'Dil', 'Veritabanı'], correct_answer: 'Kütüphane' }
    ];
    currentQuestionIndex = -1; // İlk sorudan önce -1

    // Tüm oyuncuların skorunu sıfırla (yeni oyun)
     tournamentPlayers.forEach(player => player.score = 0);


    broadcastTournamentState(); // Oyunun başladığını ve oyuncu listesini gönder
    sendNextQuestion(); // İlk soruyu gönder
}

function sendNextQuestion() {
    clearTimeout(questionTimer); // Önceki zamanlayıcıyı temizle

    currentQuestionIndex++;
    if (currentQuestionIndex >= gameQuestions.length) {
        endTournament();
        return;
    }

    const question = gameQuestions[currentQuestionIndex];
    // Doğru cevabı frontend'e gönderme! Sadece seçenekleri gönder.
    const questionData = {
        index: currentQuestionIndex,
        total: gameQuestions.length,
        text: question.question_text,
        options: question.options,
        timeLimit: QUESTION_TIME_LIMIT
    };

    console.log(`Soru <span class="math-inline">\{currentQuestionIndex \+ 1\}/</span>{gameQuestions.length} gönderiliyor: ${question.question_text}`);
    io.to(TOURNAMENT_ROOM).emit('new_question', questionData);

    // Cevap süresini başlat
    questionTimer = setTimeout(() => {
        console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`);
        io.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex });
        // Süre dolduğunda otomatik olarak sonraki soruya geç
        sendNextQuestion();
    }, QUESTION_TIME_LIMIT * 1000); // ms cinsinden
}

function endTournament() {
    clearTimeout(questionTimer);
    console.log("Turnuva bitti!");
    currentGameState = GAME_MODES.GAME_OVER;

    // Sonuçları hesapla/sırala
    const results = Array.from(tournamentPlayers.entries())
        .map(([id, data]) => ({ id, name: data.name, score: data.score }))
        .sort((a, b) => b.score - a.score); // Puana göre büyükten küçüğe sırala

    io.to(TOURNAMENT_ROOM).emit('game_over', { results });

    // Oyunu sıfırlama veya yeni oyun için bekleme durumuna geçme
    setTimeout(() => {
        console.log("Oyun durumu IDLE'a dönüyor.");
        currentGameState = GAME_MODES.IDLE;
        // Oyuncuları listeden temizle ama odadan çıkarma, bağlantılarını koparma
        tournamentPlayers.clear();
        gameQuestions = [];
        currentQuestionIndex = -1;
        // Odadaki herkese oyunun sıfırlandığını ve yeni oyun beklediklerini bildir.
        io.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun yakında başlayabilir.' });
    }, 15000); // 15 saniye sonra sıfırla
}


// === Socket Olayları ===
io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}`);

  // Oyuncu turnuvaya katılmak istediğinde
  socket.on('join_tournament', (data) => {
    const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`; // İsim gelmezse varsayılan ata, boşlukları temizle

    // Oyun zaten चल रहा है ise veya bittiyse katılamaz (şimdilik)
    if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) {
         socket.emit('error_message', { message: 'Üzgünüz, şu anda devam eden bir oyun var veya oyun yeni bitti. Daha sonra tekrar deneyin.' });
         console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{playerName}) devam eden oyuna katılamadı.`);
         return;
     }
     // Oyuncu zaten listede mi kontrol et (sayfa yenileme durumu vb.)
     if (tournamentPlayers.has(socket.id)) {
         console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{playerName}) zaten turnuva listesinde.`);
         // Belki sadece odaya tekrar sokmak yeterli?
         socket.join(TOURNAMENT_ROOM);
         // Mevcut durumu tekrar gönder
         socket.emit('tournament_state_update', {
             gameState: currentGameState,
             players: Array.from(tournamentPlayers.entries()).map(([id, data]) => ({ id, name: data.name, score: data.score })),
             currentQuestionIndex: currentQuestionIndex,
             totalQuestions: gameQuestions.length
         });
         return;
     }


    console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{playerName}) turnuvaya katılıyor.`);
    socket.join(TOURNAMENT_ROOM); // Oyuncuyu turnuva odasına ekle
    tournamentPlayers.set(socket.id, { score: 0, name: playerName }); // Oyuncuyu listeye ekle

    // Durumu bekleme olarak ayarla (eğer zaten IDLE ise)
     if (currentGameState === GAME_MODES.IDLE) {
         currentGameState = GAME_MODES.WAITING_TOURNAMENT;
     }

    console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys()));
    broadcastTournamentState(); // Yeni oyuncu listesini herkese gönder

    // Yeterli oyuncu varsa oyunu başlatmayı dene
    if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_START) {
        console.log("Minimum oyuncu sayısına ulaşıldı, oyun başlatılacak...");
        // Kısa bir bekleme süresi verilebilir başlatmadan önce
        setTimeout(startTournament, 3000); // 3 saniye sonra başlat
    } else if (currentGameState === GAME_MODES.WAITING_TOURNAMENT) {
        const needed = MIN_PLAYERS_TO_START - tournamentPlayers.size;
        io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: `<span class="math-inline">\{needed\} oyuncu daha bekleniyor\.\.\. \(</span>{tournamentPlayers.size}/${MIN_PLAYERS_TO_START})` });
    }
  });

   // Oyuncu cevap gönderdiğinde
   socket.on('submit_answer', (data) => {
       // Doğrulamalar...
       if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return;
       // Geçerli soru index'i kontrolü (data.questionIndex sayı olmalı)
       if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) {
            console.warn(`Geçersiz veya eski soru index'i: Gelen ${data.questionIndex}, Beklenen ${currentQuestionIndex}`);
            return;
       }

       const player = tournamentPlayers.get(socket.id);
       const question = gameQuestions[currentQuestionIndex];
       const correctAnswer = question?.correct_answer; // Soru var mı kontrol et

       // Oyuncunun bu soruya zaten cevap verip vermediğini kontrol et (isteğe bağlı)
       // if (player.lastAnsweredIndex === currentQuestionIndex) return;

       console.log(`Cevap alındı: Oyuncu <span class="math-inline">\{player\.name\} \(</span>{socket.id}), Soru ${currentQuestionIndex+1}, Cevap: ${data.answer}`);

       // Cevabı kontrol et
       if (correctAnswer && data.answer === correctAnswer) {
           // TODO: Süreye göre bonus puan ekle
           player.score += 10; // Şimdilik sabit puan
           // player.lastAnsweredIndex = currentQuestionIndex; // Cevap verdi işaretle
           console.log(`Doğru! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) skoru: ${player.score}`);
           socket.emit('answer_result', { correct: true, score: player.score, questionIndex: currentQuestionIndex });
           // Skoru güncellediğimiz için genel durumu tekrar yayınlayabiliriz.
           broadcastTournamentState();
       } else {
           // player.lastAnsweredIndex = currentQuestionIndex; // Cevap verdi işaretle
           console.log(`Yanlış! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) cevap: ${data.answer}, Doğru: ${correctAnswer}`);
           socket.emit('answer_result', { correct: false, score: player.score, questionIndex: currentQuestionIndex });
       }

   });


  socket.on('disconnect', (reason) => {
    console.log(`Ayrıldı: ${socket.id}. Sebep: ${reason}`);
    // Turnuva listesinden çıkar
    if (tournamentPlayers.has(socket.id)) {
      const player = tournamentPlayers.get(socket.id);
      tournamentPlayers.delete(socket.id);
      console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{player.name}) turnuvadan ayrıldı.`);
      console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys()));
       // Eğer oyun devam ediyorsa veya beklemedeyse durumu güncelle
      if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) {
          broadcastTournamentState(); // Oyuncu listesini güncelle
           // Eğer oyun devam ediyorken oyuncu sayısı minimumun altına düşerse oyunu bitir?
           if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING && tournamentPlayers.size < MIN_PLAYERS_TO_START) {
               console.log("Oyuncu sayısı minimumun altına düştü, turnuva bitiriliyor.");
               endTournament();
            }
      }
    }
  });

});

server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda dinleniyor...`);
  if (!process.env.DATABASE_URL) console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı.");
  if (!process.env.FRONTEND_URL && !process.env.FRONTEND_PRODUCTION_URL) console.warn("UYARI: FRONTEND URL çevre değişkenleri bulunamadı.");
});
