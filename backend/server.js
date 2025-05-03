// Çevre değişkenlerini .env dosyasından yükle
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

// --- Veritabanı Bağlantısı ---
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
if (pool) { /* ... Bağlantı testi ... */ pool.connect((err, client, release) => { if (err) return console.error('DB Bağlantı Hatası:', err.stack); client.query('SELECT NOW()', (err, result) => { release(); if (err) return console.error('DB Test Sorgu Hatası:', err.stack); console.log('Veritabanına Bağlandı:', result.rows[0].now); }); }); } else { console.warn("UYARI: DATABASE_URL yok, DB bağlantısı kurulmadı."); }

// --- CORS Ayarları ---
const allowedOrigins = [ process.env.FRONTEND_URL ].filter(Boolean);
console.log("İzin verilen kaynaklar (CORS):", allowedOrigins);
const io = new Server(server, { /* ... CORS ayarları ... */ cors: { origin: (origin, callback) => { if (!origin || allowedOrigins.indexOf(origin) !== -1) callback(null, true); else { console.warn(`CORS Engeli: ${origin}`); callback(new Error('CORS İzin Vermiyor'), false); } }, methods: ["GET", "POST"] } });

const PORT = process.env.PORT || 3000;

// === Oyun Ayarları ve State ===
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
let currentGameState = GAME_STATES.IDLE;
// Oyuncu Bilgisi: { name, score, combo, isReady, lastAnswerTime? }
let tournamentPlayers = new Map();
const TOURNAMENT_ROOM = 'global_tournament_room';
const MIN_PLAYERS_TO_INFORM = 1;
let gameQuestions = [];
let currentQuestionIndex = -1;
let questionTimer = null;
let questionStartTime = 0; // Soru gönderilme zamanı
const QUESTION_TIME_LIMIT = 15; // Saniye
const BASE_SCORE = 1000; // Doğru cevap temel puanı
const MAX_TIME_BONUS = 500; // Max zaman bonusu
const COMBO_BONUS_MULTIPLIER = 50; // Her kombo seviyesi için ek puan çarpanı
const MAX_COMBO_BONUS = 300; // Max kombo bonusu

// === Yardımcı Fonksiyonlar ===
function getSortedPlayerList() {
    return Array.from(tournamentPlayers.entries())
        .map(([id, data]) => ({ id, name: data.name, score: data.score, isReady: data.isReady }))
        .sort((a, b) => b.score - a.score); // Skora göre sırala
}

function broadcastTournamentState() {
    io.to(TOURNAMENT_ROOM).emit('tournament_state_update', {
        gameState: currentGameState,
        players: getSortedPlayerList(), // Sıralı listeyi gönder
        currentQuestionIndex: currentQuestionIndex,
        totalQuestions: gameQuestions.length
    });
}

async function startTournament() { /* ... önceki kod (DB'den soru çekme veya örnek kullanma) ... */ const allPlayers = Array.from(tournamentPlayers.values()); if (currentGameState !== GAME_STATES.WAITING_TOURNAMENT || allPlayers.length < 1 || !allPlayers.every(p => p.isReady)) { console.log("Turnuva başlatılamadı - durum veya hazır olmayan oyuncu var."); io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Tüm oyuncuların hazır olması bekleniyor...' }); return; } console.log("Tüm oyuncular hazır. Turnuva başlıyor!"); currentGameState = GAME_MODES.TOURNAMENT_RUNNING; try { if (!pool) { console.warn("UYARI: Veritabanı bağlantısı yok, örnek sorular kullanılıyor."); gameQuestions = [ { id: 1, question_text: '1+1 Kaç Yapar?', options: ['1', '2', '3', '4'], correct_answer: '2' }, { id: 2, question_text: 'Türkiye\'nin başkenti?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara' }, { id: 3, question_text: 'React bir ...?', options: ['Framework', 'Kütüphane', 'Dil', 'Veritabanı'], correct_answer: 'Kütüphane' } ]; } else { const result = await pool.query('SELECT id, question_text, options, correct_answer FROM questions ORDER BY RANDOM() LIMIT 5'); if (result.rows.length === 0) { console.warn("UYARI: Veritabanında soru bulunamadı, örnek sorular kullanılıyor."); gameQuestions = [ { id: 1, question_text: '1+1 Kaç Yapar?', options: ['1', '2', '3', '4'], correct_answer: '2' }, { id: 2, question_text: 'Türkiye\'nin başkenti?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara' }, { id: 3, question_text: 'React bir ...?', options: ['Framework', 'Kütüphane', 'Dil', 'Veritabanı'], correct_answer: 'Kütüphane' } ]; } else { gameQuestions = result.rows; console.log(`${gameQuestions.length} adet soru veritabanından çekildi.`); } } currentQuestionIndex = -1; tournamentPlayers.forEach(player => { player.score = 0; player.combo = 0; player.isReady = false; }); broadcastTournamentState(); sendNextQuestion(); } catch (error) { console.error("Turnuva başlatılırken hata:", error); io.to(TOURNAMENT_ROOM).emit('error_message', { message: `Oyun başlatılırken bir sorun oluştu: ${error.message}` }); currentGameState = GAME_MODES.IDLE; tournamentPlayers.forEach(p => p.isReady = false); broadcastTournamentState(); } }

function sendNextQuestion() {
    clearTimeout(questionTimer);
    currentQuestionIndex++;
    if (currentQuestionIndex >= gameQuestions.length) {
        endTournament(); return;
    }
    const question = gameQuestions[currentQuestionIndex];
    const questionData = { index: currentQuestionIndex, total: gameQuestions.length, text: question.question_text, options: question.options, timeLimit: QUESTION_TIME_LIMIT };
    console.log(`Soru <span class="math-inline">\{currentQuestionIndex \+ 1\}/</span>{gameQuestions.length} gönderiliyor: ${question.question_text}`);
    questionStartTime = Date.now(); // Soru gönderilme zamanını kaydet
    io.to(TOURNAMENT_ROOM).emit('new_question', questionData);
    questionTimer = setTimeout(() => {
        console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`);
        io.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex });
        // TODO: Süre dolduğunda highlight mesajları gönderilebilir
        // generateAndSendHighlights();
        sendNextQuestion();
    }, QUESTION_TIME_LIMIT * 1000);
}

function endTournament() { /* ... önceki kod (broadcast yerine sıralı gönderim) ... */ clearTimeout(questionTimer); console.log("Turnuva bitti!"); currentGameState = GAME_MODES.GAME_OVER; const results = getSortedPlayerList().map(({id, name, score}) => ({id, name, score})); // Sadece gerekli bilgiyi al io.to(TOURNAMENT_ROOM).emit('game_over', { results }); setTimeout(() => { console.log("Oyun durumu IDLE'a dönüyor."); currentGameState = GAME_MODES.IDLE; tournamentPlayers.clear(); gameQuestions = []; currentQuestionIndex = -1; io.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun bekleniyor.' }); }, 15000); }

// === Öne Çıkanlar (Highlight) Fonksiyonu (Taslak) ===
function generateAndSendHighlights() {
    if (tournamentPlayers.size === 0) return;

    const playersArray = getSortedPlayerList(); // Skora göre sıralı
    const highlights = [];

    // Lider
    if (playersArray.length > 0) {
        highlights.push(`${playersArray[0].name} ${playersArray[0].score} puanla lider! 👑`);
    }
    // En Yüksek Kombo? (Player objesinde combo tutuluyor varsayımıyla)
    let maxCombo = 0;
    let comboPlayerName = null;
    tournamentPlayers.forEach((player, id) => {
        if (player.combo > maxCombo) {
            maxCombo = player.combo;
            comboPlayerName = player.name;
        }
    });
    if (maxCombo >= 2) { // En az 2'li kombo anlamlı
         highlights.push(`${comboPlayerName} ${maxCombo} soruluk bir seriye ulaştı! 🔥`);
    }

    // TODO: En hızlı cevap? Sıralamada yükselen?

    // Rastgele bir veya iki highlight seçip gönderelim
    if (highlights.length > 0) {
        const selectedHighlights = highlights.sort(() => 0.5 - Math.random()).slice(0, 2); // Karıştır ve ilk 2'yi al
         console.log("Gönderilen Highlight'lar:", selectedHighlights);
         io.to(TOURNAMENT_ROOM).emit('game_highlight', { messages: selectedHighlights });
    }
}


// === Socket Olayları ===
io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}, Durum: ${currentGameState}`);
  socket.emit('initial_state', { gameState: currentGameState, players: getSortedPlayerList() });

  socket.on('join_tournament', (data) => { const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`; if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) { socket.emit('error_message', { message: 'Devam eden oyun var veya yeni bitti.' }); return; } if (tournamentPlayers.has(socket.id)) { console.log(`${playerName} zaten listede.`); socket.join(TOURNAMENT_ROOM); return; } console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{playerName}) turnuvaya katılıyor.`); socket.join(TOURNAMENT_ROOM); tournamentPlayers.set(socket.id, { name: playerName, score: 0, combo: 0, isReady: false }); if (currentGameState === GAME_MODES.IDLE) { currentGameState = GAME_MODES.WAITING_TOURNAMENT; } console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys())); broadcastTournamentState(); if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_INFORM) { io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Oyuncular bekleniyor. Hazır olduğunuzda belirtin.' }); } });
  socket.on('player_ready', () => { if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || !tournamentPlayers.has(socket.id)) return; const player = tournamentPlayers.get(socket.id); if (!player.isReady) { player.isReady = true; console.log(`Oyuncu <span class="math-inline">\{player\.name\} \(</span>{socket.id}) hazır.`); broadcastTournamentState(); const allPlayersArray = Array.from(tournamentPlayers.values()); if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) { console.log("Tüm oyuncular hazır, turnuva başlatılıyor..."); startTournament(); } else { io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Diğer oyuncuların hazır olması bekleniyor...' }); } } });

  // Cevap Gönderme - GÜNCELLENDİ (Puanlama)
  socket.on('submit_answer', (data) => {
    const answerTime = Date.now(); // Cevap zamanını kaydet
    if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return;
    if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) { console.warn(`Geçersiz veya eski soru index'i: Gelen ${data.questionIndex}, Beklenen ${currentQuestionIndex}`); return; }

    const player = tournamentPlayers.get(socket.id);
    // Belki oyuncunun bu soruya zaten cevap verip vermediğini kontrol edebiliriz (örn: player.lastAnsweredIndex)
    // if (player.lastAnsweredIndex === currentQuestionIndex) return;

    const question = gameQuestions[currentQuestionIndex];
    const correctAnswer = question?.correct_answer;
    const timeDiffMs = answerTime - questionStartTime; // Cevap süresi (ms)

    console.log(`Cevap alındı: <span class="math-inline">\{player\.name\} \(</span>{socket.id}), Soru ${currentQuestionIndex+1}, Cevap: ${data.answer}, Süre: ${timeDiffMs}ms`);

    let pointsAwarded = 0;
    let correct = false;
    let comboBroken = false;

    if (correctAnswer && data.answer === correctAnswer) {
        correct = true;
        // Zaman bonusu hesapla (lineer azalan)
        const timeRatio = Math.max(0, (QUESTION_TIME_LIMIT * 1000 - timeDiffMs) / (QUESTION_TIME_LIMIT * 1000));
        const timeBonus = Math.round(timeRatio * MAX_TIME_BONUS);

        // Kombo artır ve bonus hesapla
        player.combo = (player.combo || 0) + 1;
        const comboBonus = Math.min(MAX_COMBO_BONUS, Math.max(0, player.combo - 1) * COMBO_BONUS_MULTIPLIER);

        pointsAwarded = BASE_SCORE + timeBonus + comboBonus;
        player.score += pointsAwarded;
        // player.lastAnsweredIndex = currentQuestionIndex; // Cevap verdi işaretle
        console.log(`Doğru! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) +<span class="math-inline">\{pointsAwarded\} puan \(Temel\:</span>{BASE_SCORE}, Zaman:<span class="math-inline">\{timeBonus\}, Kombo\:</span>{comboBonus}). Yeni skor: ${player.score}, Kombo: ${player.combo}`);
    } else {
        comboBroken = player.combo > 0; // Eğer kombosu varsa ve yanlış cevap verdiyse, kombo kırıldı
        player.combo = 0; // Yanlış cevapta komboyu sıfırla
        // player.lastAnsweredIndex = currentQuestionIndex; // Cevap verdi işaretle
        console.log(`Yanlış! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) cevap: ${data.answer}, Doğru: ${correctAnswer}. Kombo sıfırlandı.`);
    }

    // Oyuncuya özel cevap sonucunu gönder
    socket.emit('answer_result', {
         correct: correct,
         score: player.score, // Güncel toplam skor
         pointsAwarded: pointsAwarded, // Bu sorudan kazanılan puan
         combo: player.combo, // Güncel kombo
         comboBroken: comboBroken,
         questionIndex: currentQuestionIndex
    });

    // Genel durumu (yeni skorlarla) herkese yayınla
    broadcastTournamentState();

    // TODO: Burada veya süre dolunca highlight'ları gönder
    // generateAndSendHighlights();
  });

  socket.on('disconnect', (reason) => { /* ... önceki kod (combo sıfırlama eklenebilir) ... */ console.log(`Ayrıldı: ${socket.id}. Sebep: ${reason}`); if (tournamentPlayers.has(socket.id)) { const player = tournamentPlayers.get(socket.id); const wasReady = player.isReady; tournamentPlayers.delete(socket.id); console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{player.name}) turnuvadan ayrıldı.`); console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys())); if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) { broadcastTournamentState(); if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && wasReady) { const allPlayersArray = Array.from(tournamentPlayers.values()); if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) { console.log("Hazır oyuncu ayrıldı, kalanlar hazır. Turnuva başlatılıyor..."); startTournament(); } } if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING && tournamentPlayers.size < 1) { console.log("Oyuncu kalmadı, turnuva bitiriliyor."); endTournament(); } } } });
});

app.get('/', (req, res) => { /* ... önceki kod ... */ res.setHeader('Content-Type', 'text/plain'); res.status(200).send(`Asrin Oyunu Backend Çalışıyor! Durum: ${currentGameState}, Oyuncular: ${tournamentPlayers.size}`); });
server.listen(PORT, () => { /* ... önceki kod ... */ console.log(`Sunucu ${PORT} portunda dinleniyor...`); if (!process.env.DATABASE_URL) console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı."); /* FRONTEND_URL uyarısı kaldırıldı */ });
