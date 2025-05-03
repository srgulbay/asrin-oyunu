// Çevre değişkenleri, require'lar, pool, CORS, io kurulumu...
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Pool } = require('pg');
const app = express();
const server = http.createServer(app);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
if (pool) { pool.connect((err, client, release) => { if (err) return console.error('DB Bağlantı Hatası:', err.stack); client.query('SELECT NOW()', (err, result) => { release(); if (err) return console.error('DB Test Sorgu Hatası:', err.stack); console.log('Veritabanına Bağlandı:', result.rows[0].now); }); }); } else { console.warn("UYARI: DATABASE_URL yok, DB bağlantısı kurulmadı."); }
const allowedOrigins = [ process.env.FRONTEND_URL ].filter(Boolean);
console.log("İzin verilen kaynaklar (CORS):", allowedOrigins);
const io = new Server(server, { cors: { origin: (origin, callback) => { if (!origin || allowedOrigins.indexOf(origin) !== -1) callback(null, true); else { console.warn(`CORS Engeli: ${origin}`); callback(new Error('CORS İzin Vermiyor'), false); } }, methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

// === Oyun State Yönetimi ===
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
let currentGameState = GAME_STATES.IDLE;
let tournamentPlayers = new Map(); // { name, score, combo, isReady }
const TOURNAMENT_ROOM = 'global_tournament_room';
const MIN_PLAYERS_TO_INFORM = 1;
let gameQuestions = [];
let currentQuestionIndex = -1;
let questionTimer = null;
let questionStartTime = 0;
// Geçici: Mevcut soruya verilen cevapları tutar: Map<socketId, {answer, timeMs, correct}>
let currentQuestionAnswers = new Map();
const QUESTION_TIME_LIMIT = 15;
const BASE_SCORE = 1000;
const MAX_TIME_BONUS = 500;
const COMBO_BONUS_MULTIPLIER = 50;
const MAX_COMBO_BONUS = 300;

// === Yardımcı Fonksiyonlar ===
function getSortedPlayerList() { return Array.from(tournamentPlayers.entries()).map(([id, data]) => ({ id, name: data.name, score: data.score, isReady: data.isReady })).sort((a, b) => b.score - a.score); }
function broadcastTournamentState() { io.to(TOURNAMENT_ROOM).emit('tournament_state_update', { gameState: currentGameState, players: getSortedPlayerList(), currentQuestionIndex: currentQuestionIndex, totalQuestions: gameQuestions.length }); }
function sendAnnouncerMessage(message, type = 'info') { console.log(`[Announcer] ${message}`); io.to(TOURNAMENT_ROOM).emit('announcer_message', { text: message, type: type, timestamp: Date.now() }); }

// --- YENİ: Soru Özeti ve Yorum Üretme ---
function generateQuestionSummaryAnnouncements(qIndex) {
    if (currentQuestionAnswers.size === 0) {
        // Kimse cevaplamadıysa özel bir mesaj olabilir
         sendAnnouncerMessage(`Soru ${qIndex + 1} için kimse cevap vermedi veya süre doldu!`, "warning");
         return; // Hiç cevap yoksa analiz yapma
     }

    let correctCount = 0;
    let fastestTimeMs = Infinity;
    let fastestPlayerId = null;
    let submittedAnswerCount = currentQuestionAnswers.size; // Cevap veren oyuncu sayısı

    currentQuestionAnswers.forEach((answerData, playerId) => {
        if (answerData.correct) {
            correctCount++;
            if (answerData.timeMs < fastestTimeMs) {
                fastestTimeMs = answerData.timeMs;
                fastestPlayerId = playerId;
            }
        }
    });

    const totalPlayersInRoom = tournamentPlayers.size; // Odadaki toplam oyuncu sayısı

    // Yorumları oluştur
    if (correctCount === totalPlayersInRoom && totalPlayersInRoom > 0) {
        sendAnnouncerMessage(`İnanılmaz! Herkes doğru bildi! 🤩 (<span class="math-inline">\{correctCount\}/</span>{totalPlayersInRoom})`, "all_correct");
    } else if (correctCount === 0 && submittedAnswerCount > 0) {
         sendAnnouncerMessage(`Zor soruydu! Doğru cevap veren olmadı. 🤔 (<span class="math-inline">\{correctCount\}/</span>{submittedAnswerCount} cevap)`, "none_correct");
     } else if (correctCount > 0) {
         sendAnnouncerMessage(`${correctCount} kişi doğru cevap verdi!`, "info");
     }

    if (fastestPlayerId && tournamentPlayers.has(fastestPlayerId)) {
        sendAnnouncerMessage(`En hızlı cevap <span class="math-inline">\{tournamentPlayers\.get\(fastestPlayerId\)\.name\}'dan geldi\! \(</span>{(fastestTimeMs / 1000).toFixed(1)}sn) ⚡️`, "speed");
    }

    // En yüksek komboyu bul ve duyur
    let maxCombo = 0;
    let comboPlayerName = null;
    tournamentPlayers.forEach((player) => {
        if (player.combo > maxCombo) {
            maxCombo = player.combo;
            comboPlayerName = player.name;
        }
    });
    if (maxCombo >= 3) { // En az 3'lü kombo anlamlı
        sendAnnouncerMessage(`${comboPlayerName} ${maxCombo} soruluk harika bir seri yakaladı! 🔥`, "combo");
    }

    // Liderlik durumu (basit)
    const sortedPlayers = getSortedPlayerList();
    if (sortedPlayers.length > 0) {
         // Belirli aralıklarla lideri duyurabiliriz, her soru sonrası değil
         if ( (qIndex + 1) % 3 === 0 || qIndex === gameQuestions.length -1 ) { // Örn: Her 3 soruda bir veya son soruda
             sendAnnouncerMessage(`Liderlik koltuğunda <span class="math-inline">\{sortedPlayers\[0\]\.name\} \(</span>{sortedPlayers[0].score}p) oturuyor! 👑`, "lead");
         }
     }
}

async function startTournament() { /* ... önceki kod ... */ const allPlayers = Array.from(tournamentPlayers.values()); if (currentGameState !== GAME_STATES.WAITING_TOURNAMENT || allPlayers.length < 1 || !allPlayers.every(p => p.isReady)) { sendAnnouncerMessage("Tüm oyuncular hazır olmadan oyun başlayamaz!", "warning"); return; } sendAnnouncerMessage("Tüm oyuncular hazır! Yarışma 3 saniye içinde başlıyor...", "info"); console.log("Tüm oyuncular hazır. Turnuva başlıyor!"); currentGameState = GAME_MODES.TOURNAMENT_RUNNING; try { if (!pool) { console.warn("UYARI: DB yok, örnek sorular."); gameQuestions = [ { id: 1, question_text: '1+1 Kaç Yapar?', options: ['1', '2', '3', '4'], correct_answer: '2' }, { id: 2, question_text: 'Türkiye\'nin başkenti?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara' }, { id: 3, question_text: 'React bir ...?', options: ['Framework', 'Kütüphane', 'Dil', 'Veritabanı'], correct_answer: 'Kütüphane' } ]; } else { const result = await pool.query('SELECT id, question_text, options, correct_answer FROM questions ORDER BY RANDOM() LIMIT 5'); if (result.rows.length === 0) { console.warn("UYARI: DBde soru yok, örnek sorular."); gameQuestions = [ { id: 1, question_text: '1+1 Kaç Yapar?', options: ['1', '2', '3', '4'], correct_answer: '2' }, { id: 2, question_text: 'Türkiye\'nin başkenti?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara' }, { id: 3, question_text: 'React bir ...?', options: ['Framework', 'Kütüphane', 'Dil', 'Veritabanı'], correct_answer: 'Kütüphane' } ]; } else { gameQuestions = result.rows; console.log(`${gameQuestions.length} adet soru veritabanından çekildi.`); } } currentQuestionIndex = -1; tournamentPlayers.forEach(player => { player.score = 0; player.combo = 0; player.isReady = false; }); broadcastTournamentState(); // Oyunculara oyunun başladığını ve state'i gönder // 3 saniye bekleyip ilk soruyu gönderelim setTimeout(sendNextQuestion, 3000); } catch (error) { console.error("Turnuva başlatılırken hata:", error); sendAnnouncerMessage(`Oyun başlatılamadı: ${error.message}`, "error"); currentGameState = GAME_MODES.IDLE; tournamentPlayers.forEach(p => p.isReady = false); broadcastTournamentState(); } }

function sendNextQuestion() {
    clearTimeout(questionTimer);
    // --- YENİ: Önceki sorunun özetini gönder ---
    if (currentQuestionIndex >= 0) { // İlk soru değilse özet yap
        generateQuestionSummaryAnnouncements(currentQuestionIndex);
    }
    currentQuestionAnswers.clear(); // Yeni soru için cevapları temizle

    currentQuestionIndex++;
    if (currentQuestionIndex >= gameQuestions.length) { endTournament(); return; }
    const question = gameQuestions[currentQuestionIndex];
    const questionData = { index: currentQuestionIndex, total: gameQuestions.length, text: question.question_text, options: question.options, timeLimit: QUESTION_TIME_LIMIT };
    // Soru mesajını kısa bir gecikmeyle gönderelim, highlight'lardan sonra görünsün
    setTimeout(() => {
         sendAnnouncerMessage(`Soru <span class="math-inline">\{currentQuestionIndex \+ 1\}/</span>{gameQuestions.length}: ${question.question_text}`, "question");
         console.log(`Soru <span class="math-inline">\{currentQuestionIndex \+ 1\}/</span>{gameQuestions.length} gönderiliyor...`);
         questionStartTime = Date.now();
         io.to(TOURNAMENT_ROOM).emit('new_question', questionData);
    }, 500); // Önceki highlight mesajlarından 0.5 saniye sonra

    questionTimer = setTimeout(() => {
         console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`);
         io.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex });
         sendNextQuestion(); // Süre dolunca direkt sonraki soru (özet yine başta yapılacak)
         }, QUESTION_TIME_LIMIT * 1000 + 500); // Soru gösterme gecikmesini de ekle
}

function endTournament() { /* ... önceki kod (sıralı sonuçlar + reset_game)... */ clearTimeout(questionTimer); if(currentQuestionIndex >= 0) { generateQuestionSummaryAnnouncements(currentQuestionIndex); } console.log("Turnuva bitti!"); currentGameState = GAME_MODES.GAME_OVER; const results = getSortedPlayerList().map(({id, name, score}) => ({id, name, score})); sendAnnouncerMessage(`Yarışma bitti! Kazanan ${results[0]?.name || 'belli değil'}! 🏆 Tebrikler!`, "gameover"); io.to(TOURNAMENT_ROOM).emit('game_over', { results }); setTimeout(() => { console.log("Oyun durumu IDLE'a dönüyor."); currentGameState = GAME_MODES.IDLE; tournamentPlayers.clear(); gameQuestions = []; currentQuestionIndex = -1; io.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun bekleniyor.' }); }, 15000); }

// === Socket Olayları ===
io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}, Durum: ${currentGameState}`);
  socket.emit('initial_state', { gameState: currentGameState, players: getSortedPlayerList() });

  socket.on('join_tournament', (data) => { const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`; if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) { socket.emit('error_message', { message: 'Devam eden oyun var veya yeni bitti.' }); return; } if (tournamentPlayers.has(socket.id)) { console.log(`${playerName} zaten listede.`); socket.join(TOURNAMENT_ROOM); return; } console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{playerName}) turnuvaya katılıyor.`); socket.join(TOURNAMENT_ROOM); tournamentPlayers.set(socket.id, { name: playerName, score: 0, combo: 0, isReady: false }); if (currentGameState === GAME_MODES.IDLE) { currentGameState = GAME_MODES.WAITING_TOURNAMENT; } console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys())); sendAnnouncerMessage(`${playerName} yarışmaya katıldı! Aramıza hoş geldin! 👋`, "join"); broadcastTournamentState(); if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_INFORM) { io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Oyuncular bekleniyor. Hazır olduğunuzda belirtin.' }); } });
  socket.on('player_ready', () => { if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || !tournamentPlayers.has(socket.id)) return; const player = tournamentPlayers.get(socket.id); if (!player.isReady) { player.isReady = true; console.log(`Oyuncu <span class="math-inline">\{player\.name\} \(</span>{socket.id}) hazır.`); sendAnnouncerMessage(`${player.name} hazır! 👍`, "info"); broadcastTournamentState(); const allPlayersArray = Array.from(tournamentPlayers.values()); if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) { console.log("Tüm oyuncular hazır, turnuva başlatılıyor..."); sendAnnouncerMessage("Herkes hazır görünüyor! Geri sayım başlasın!", "info"); startTournament(); } else { io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Diğer oyuncuların hazır olması bekleniyor...' }); } } });

  // Cevap Gönderme - GÜNCELLENDİ (Yorumlar için cevapları sakla)
  socket.on('submit_answer', (data) => {
    const answerTime = Date.now();
    if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return;
    if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) { return; } // Eski soruya cevap

    const player = tournamentPlayers.get(socket.id);
    // Zaten cevaplamış mı kontrol et (basit)
     if (currentQuestionAnswers.has(socket.id)) {
          console.log(`<span class="math-inline">\{player\.name\} \(</span>{socket.id}) bu soruya zaten cevap verdi.`);
          return; // Tekrar işleme alma
      }

    const question = gameQuestions[currentQuestionIndex];
    const correctAnswer = question?.correct_answer;
    const timeDiffMs = answerTime - questionStartTime;

    console.log(`Cevap alındı: <span class="math-inline">\{player\.name\} \(</span>{socket.id}), Soru ${currentQuestionIndex+1}, Cevap: ${data.answer}, Süre: ${timeDiffMs}ms`);

    let pointsAwarded = 0;
    let correct = false;
    let comboBroken = false;
    let currentCombo = player.combo || 0;

    if (correctAnswer && data.answer === correctAnswer) {
        correct = true;
        const timeRatio = Math.max(0, (QUESTION_TIME_LIMIT * 1000 - timeDiffMs) / (QUESTION_TIME_LIMIT * 1000));
        const timeBonus = Math.round(timeRatio * MAX_TIME_BONUS);
        player.combo = currentCombo + 1;
        const comboBonus = Math.min(MAX_COMBO_BONUS, Math.max(0, player.combo - 1) * COMBO_BONUS_MULTIPLIER);
        pointsAwarded = BASE_SCORE + timeBonus + comboBonus;
        player.score += pointsAwarded;
        console.log(`Doğru! <span class="math-inline">\{player\.name\} \(</span>{socket.id}) +${pointsAwarded}p. Skor: ${player.score}, Kombo: ${player.combo}`);
        if (player.combo >= 2) {
             // Kombo mesajını biraz geciktirerek gönderelim, cevap sonucuyla karışmasın
             setTimeout(()=> sendAnnouncerMessage(`${player.name} <span class="math-inline">\{player\.combo\}x Kombo\! 💪 \+</span>{comboBonus} bonus!`, "combo"), 300);
         }
    } else {
        comboBroken = player.combo > 0;
        player.combo = 0;
        console.log(`Yanlış! <span class="math-inline">\{player\.name\} \(</span>{socket.id}). Kombo sıfırlandı.`);
        if (comboBroken) {
              setTimeout(()=> sendAnnouncerMessage(`${player.name}'in ${currentCombo}x kombosu sona erdi! 💥`, "combo_break"), 300);
         }
    }

    // Cevabı geçici haritada sakla (özet için)
     currentQuestionAnswers.set(socket.id, { answer: data.answer, timeMs: timeDiffMs, correct: correct });

    socket.emit('answer_result', { correct, score: player.score, pointsAwarded, combo: player.combo, comboBroken, questionIndex: currentQuestionIndex });
    broadcastTournamentState(); // Skorlar değiştiği için herkese gönder
  });

  socket.on('disconnect', (reason) => { console.log(`Ayrıldı: ${socket.id}. Sebep: ${reason}`); if (tournamentPlayers.has(socket.id)) { const player = tournamentPlayers.get(socket.id); const wasReady = player.isReady; tournamentPlayers.delete(socket.id); console.log(`Oyuncu <span class="math-inline">\{socket\.id\} \(</span>{player.name}) turnuvadan ayrıldı.`); sendAnnouncerMessage(`${player.name} yarışmadan ayrıldı.`, "leave"); console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys())); if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) { broadcastTournamentState(); if (currentGameState === GAME_STATES.WAITING_TOURNAMENT && wasReady) { const allPlayersArray = Array.from(tournamentPlayers.values()); if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) { console.log("Hazır oyuncu ayrıldı, kalanlar hazır. Turnuva başlatılıyor..."); startTournament(); } } if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING && tournamentPlayers.size < 1) { console.log("Oyuncu kalmadı, turnuva bitiriliyor."); endTournament(); } } } });
}); // io.on('connection') sonu

app.get('/', (req, res) => { res.setHeader('Content-Type', 'text/plain'); res.status(200).send(`Asrin Oyunu Backend Çalışıyor! Durum: ${currentGameState}, Oyuncular: ${tournamentPlayers.size}`); });
server.listen(PORT, () => { console.log(`Sunucu ${PORT} portunda dinleniyor...`); if (!process.env.DATABASE_URL) console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı."); });
