require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Pool } = require('pg');
const crypto = require('crypto');
const { doc, updateDoc, increment, getFirestore } = require("firebase/firestore"); // Firestore update için
const { initializeApp } = require("firebase/app"); // app'i doğrudan kullanmak yerine

// Firebase'i burada da başlatmamız gerekebilir (eğer db export edilmediyse)
// VEYA db'yi firebaseConfig'den import etmeliyiz.
// ÖNEMLİ: Eğer firebaseConfig.js backend'de yoksa, onu oluşturup db'yi export etmelisin.
// Varsayım: firebaseConfig.js var ve db'yi export ediyor.
// const { db } = require('./firebaseConfig'); // Veya yolu ayarla

// ---- GEÇİCİ: Eğer firebaseConfig yoksa manuel başlatma (önerilmez) ----
let db;
try {
    // Bu kısmı kendi firebaseConfig import'una göre düzenle
    // db = getFirestore(); // Eğer firebaseConfig'de app export ediliyorsa
    console.log("Firestore bağlantısı (varsa) hazır.");
} catch (e) {
    console.error("Firestore başlatılamadı! Kullanıcı verileri GÜNCELLENEMEYECEK.", e);
    db = null; // Firestore kullanılamazsa db null olsun
}
//-------------------------------------------------------------------


const app = express();
const server = http.createServer(app);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

// ... (pool bağlantı kontrolü ve CORS ayarları aynı kalıyor) ...
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

const allowedOrigins = [ process.env.FRONTEND_URL ].filter(Boolean);
console.log("İzin verilen kaynaklar (CORS):", allowedOrigins);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
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


const PORT = process.env.PORT || 3000;

const GAME_MODES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
let currentGameState = GAME_MODES.IDLE;
let tournamentPlayers = new Map();
const TOURNAMENT_ROOM = 'global_tournament_room';
const MIN_PLAYERS_TO_INFORM = 1;

let gameQuestions = [];
let currentQuestionIndex = -1;
let questionTimer = null;
let questionStartTime = 0;
let currentQuestionAnswers = new Map();

const QUESTION_TIME_LIMIT = 15;
const BASE_SCORE = 1000;
const MAX_TIME_BONUS = 500;
const COMBO_BONUS_MULTIPLIER = 50;
const MAX_COMBO_BONUS = 300;

const GRADE_DIFFICULTY_FACTOR = 0.10;
const MAX_DIFFICULTY_BONUS_MULTIPLIER = 1.5;
const MIN_DIFFICULTY_PENALTY_MULTIPLIER = 0.5;
const SIGNIFICANT_GRADE_DIFFERENCE = 3;

// --- YENİ: Kaynak ve XP Sabitleri ---
const XP_PER_CORRECT_ANSWER = 10; // Doğru cevap başına XP
const BRANCH_RESOURCE_MAP = {
    'Matematik': 'zekaKristali',
    'Türkçe': 'bilgelik',
    'Fen Bilimleri': 'enerji',
    'Sosyal Bilgiler': 'kultur',
    'Tarih': 'kultur',
    'Coğrafya': 'kultur',
    'İngilizce': 'bilgelik',
    'Teknoloji': 'zekaKristali',
    // Diğer branşları buraya ekle
};
const DEFAULT_RESOURCES = { bilgelik: 0, zekaKristali: 0, enerji: 0, kultur: 0 };
// ---------------------------------

function getNumericGrade(gradeString) {
    if (!gradeString) return null;
    if (String(gradeString).toLowerCase() === 'okul öncesi') return 0;
    const gradeNum = parseInt(gradeString, 10);
    return isNaN(gradeNum) ? null : gradeNum;
}

function getSortedPlayerList() {
    return Array.from(tournamentPlayers.entries())
        .map(([id, data]) => ({
             id,
             name: data.name,
             score: data.score,
             isReady: data.isReady,
             grade: data.grade,
             // Analiz için ek bilgiler eklenebilir
             xpEarned: data.currentTournamentXP,
             resourcesEarned: data.currentTournamentResources
        }))
        .sort((a, b) => b.score - a.score);
}

function broadcastTournamentState() {
    io.to(TOURNAMENT_ROOM).emit('tournament_state_update', {
        gameState: currentGameState,
        players: getSortedPlayerList(), // Artık XP ve kaynakları da içerebilir (ama genellikle finalde gönderilir)
        currentQuestionIndex: currentQuestionIndex,
        totalQuestions: gameQuestions.length
    });
}

function sendAnnouncerMessage(message, type = 'info') {
    const formattedMessage = String(message);
    const messageId = crypto.randomUUID();
    console.log(`[Announcer][${messageId}] ${formattedMessage}`);
    io.to(TOURNAMENT_ROOM).emit('announcer_message', {
        id: messageId,
        text: formattedMessage,
        type: type,
        timestamp: Date.now()
    });
}

// ... (generateQuestionSummaryAnnouncements aynı kalabilir) ...
function generateQuestionSummaryAnnouncements(qIndex) {
    if (qIndex < 0 || qIndex >= gameQuestions.length) return;
    if (currentQuestionAnswers.size === 0 && currentGameState === GAME_MODES.TOURNAMENT_RUNNING) { sendAnnouncerMessage(`Soru ${qIndex + 1} için kimse cevap vermedi! 🤷`, "warning"); return; }
    if (currentQuestionAnswers.size === 0) return;

    let correctCount = 0; let fastestTimeMs = Infinity;
    let fastestPlayerId = null; let submittedAnswerCount = currentQuestionAnswers.size;
    currentQuestionAnswers.forEach((answerData, playerId) => { if (answerData.correct) { correctCount++; if (answerData.timeMs < fastestTimeMs) { fastestTimeMs = answerData.timeMs; fastestPlayerId = playerId; } } });

    const totalPlayersInRoom = tournamentPlayers.size;
    if (correctCount === submittedAnswerCount && submittedAnswerCount === totalPlayersInRoom && totalPlayersInRoom > 1) { sendAnnouncerMessage(`Mükemmel tur! Herkes doğru bildi! 🏆 (${correctCount}/${totalPlayersInRoom})`, "all_correct"); }
    else if (correctCount === 0 && submittedAnswerCount > 0) { sendAnnouncerMessage(`Bu soruda doğru cevap veren olmadı! 🤔 (${correctCount}/${submittedAnswerCount} cevap)`, "none_correct"); }
    else if (correctCount > 0 && correctCount < submittedAnswerCount) { sendAnnouncerMessage(`${correctCount} oyuncu doğru cevabı buldu.`, "info"); }
    else if (correctCount > 0 && correctCount === submittedAnswerCount && submittedAnswerCount < totalPlayersInRoom) { sendAnnouncerMessage(`Cevap veren ${correctCount} oyuncunun hepsi doğru bildi!`, "info"); }

    if (fastestPlayerId && tournamentPlayers.has(fastestPlayerId)) { const fastestPlayerName = tournamentPlayers.get(fastestPlayerId).name; sendAnnouncerMessage(`En hızlı doğru cevap ${fastestPlayerName}'dan geldi! (${(fastestTimeMs / 1000).toFixed(1)}sn) ⚡️`, "speed"); }

    let maxCombo = 0;
    let comboPlayerName = null; tournamentPlayers.forEach((player) => { if (player.combo > maxCombo) { maxCombo = player.combo; comboPlayerName = player.name; } });
    if (maxCombo >= 3 && maxCombo % 2 !== 0) { sendAnnouncerMessage(`${comboPlayerName} ${maxCombo} maçlık galibiyet serisiyle coştu! 🔥`, "combo"); }

    const sortedPlayers = getSortedPlayerList(); if (sortedPlayers.length > 0) { if ( (qIndex + 1) % 3 === 0 || qIndex === gameQuestions.length -1 ) { sendAnnouncerMessage(`Şu anki lider ${sortedPlayers[0].name} (${sortedPlayers[0].score}p)! 👑`, "lead"); } }
}

async function startTournament() {
    const allPlayers = Array.from(tournamentPlayers.values());
    if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || allPlayers.length < 1 || !allPlayers.every(p => p.isReady)) { sendAnnouncerMessage("Tüm oyuncular hazır olmadan oyun başlayamaz!", "warning"); return; }

    sendAnnouncerMessage("Tüm oyuncular hazır! Yarışma 3 saniye içinde başlıyor...", "info"); console.log("Tüm oyuncular hazır. Turnuva başlıyor!");
    currentGameState = GAME_MODES.TOURNAMENT_RUNNING;

    try {
        const sampleQuestions = [ // Örnek sorulara branch ve grade eklenmeli
            { id: 1, question_text: '1+1 Kaç Yapar?', options: ['1', '2', '3', '4'], correct_answer: '2', grade: '1', branch: 'Matematik' },
            { id: 2, question_text: 'Türkiye\'nin başkenti?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara', grade: '5', branch: 'Sosyal Bilgiler' },
            { id: 3, question_text: 'Fotosentez nedir?', options: ["Bitkilerin su içmesi", "Bitkilerin güneş enerjisiyle besin üretmesi", "Hayvanların uyuması"], correct_answer: 'Bitkilerin güneş enerjisiyle besin üretmesi', grade: '6', branch: 'Fen Bilimleri'},
            { id: 4, question_text: 'Üçgenin iç açıları toplamı?', options: ['90', '180', '270', '360'], correct_answer: '180', grade: '5', branch: 'Matematik'},
            { id: 5, question_text: 'What is the capital of Türkiye?', options: ['Istanbul', 'Izmir', 'Ankara', 'Bursa'], correct_answer: 'Ankara', grade: '4', branch: 'İngilizce' }
         ];

        if (!pool) {
            console.warn("UYARI: DB yok, örnek sorular kullanılıyor.");
            gameQuestions = sampleQuestions;
        } else {
            // TODO: Oyuncu sınıflarına göre daha akıllı soru seçimi
            const result = await pool.query('SELECT id, question_text, options, correct_answer, grade, branch FROM questions ORDER BY RANDOM() LIMIT 5');
            if (result.rows.length === 0) {
                console.warn("UYARI: Veritabanında uygun soru bulunamadı, örnek sorular kullanılıyor.");
                gameQuestions = sampleQuestions;
            } else {
                gameQuestions = result.rows;
                console.log(`${gameQuestions.length} adet soru veritabanından çekildi.`);
            }
        }

        currentQuestionIndex = -1;
        // --- GÜNCELLEME: Oyuncu turnuva verilerini sıfırla ---
        tournamentPlayers.forEach(player => {
             player.score = 0;
             player.combo = 0;
             player.isReady = false;
             player.currentTournamentXP = 0;
             player.currentTournamentResources = { ...DEFAULT_RESOURCES };
             // Diğer takip edilecek stat'lar sıfırlanabilir (correctAnswers, totalAnswerTimeMs etc.)
        });
        // --------------------------------------------------

        broadcastTournamentState(); // Oyuncuların sıfırlanmış skorlarını gönder
        setTimeout(sendNextQuestion, 3000);
    } catch (error) {
        console.error("Turnuva başlatılırken hata:", error);
        sendAnnouncerMessage(`Oyun başlatılamadı: ${error.message}.`, "error");
        currentGameState = GAME_MODES.IDLE;
        tournamentPlayers.forEach(p => p.isReady = false);
        broadcastTournamentState();
    }
}

// ... (sendNextQuestion aynı kalabilir, questionData'ya grade ve branch eklenmişti) ...
function sendNextQuestion() {
    clearTimeout(questionTimer);
    if (currentQuestionIndex >= 0 && currentQuestionIndex < gameQuestions.length) {
         generateQuestionSummaryAnnouncements(currentQuestionIndex);
    }
    currentQuestionAnswers.clear();
    currentQuestionIndex++;

    if (currentQuestionIndex >= gameQuestions.length) {
        endTournament();
        return;
    }

    const question = gameQuestions[currentQuestionIndex];
    if (!question || !question.question_text || !question.options || typeof question.correct_answer === 'undefined' || typeof question.grade === 'undefined') { // grade kontrolü eklendi
        console.error("HATA: Geçersiz soru formatı veya eksik sınıf bilgisi!", question);
        sendAnnouncerMessage("Sıradaki soru yüklenirken hata oluştu!", "error");
        endTournament();
        return;
    }

    const questionData = { index: currentQuestionIndex, total: gameQuestions.length, text: question.question_text, options: question.options, timeLimit: QUESTION_TIME_LIMIT, grade: question.grade, branch: question.branch }; // grade ve branch gönderiliyor
    const questionAnnounceText = `Soru ${currentQuestionIndex + 1}/${gameQuestions.length}: ${question.question_text}`;

    setTimeout(() => {
        sendAnnouncerMessage(questionAnnounceText, "question");
        console.log(`Soru ${currentQuestionIndex + 1}/${gameQuestions.length} (Sınıf: ${question.grade}) gönderiliyor...`);
        questionStartTime = Date.now();
        io.to(TOURNAMENT_ROOM).emit('new_question', questionData);
    }, 1000); // Özet mesajlarından sonra 1sn bekle

    questionTimer = setTimeout(() => {
        console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`);
        io.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex });
        sendNextQuestion();
    }, QUESTION_TIME_LIMIT * 1000 + 1000); // Soru gösterme + Süre
}


// --- GÜNCELLEME: endTournament Fonksiyonu ---
async function endTournament() {
    clearTimeout(questionTimer);
    if (currentQuestionIndex >= 0 && currentQuestionIndex < gameQuestions.length) {
        generateQuestionSummaryAnnouncements(currentQuestionIndex);
    }
    console.log("Turnuva bitti!");
    currentGameState = GAME_MODES.GAME_OVER;

    // 1. Detaylı Sonuçları Hazırla
    const finalPlayerData = Array.from(tournamentPlayers.entries());
    const detailedResults = finalPlayerData
        .map(([id, data], index) => ({
            id: id,
            name: data.name,
            rank: index + 1, // Sıralama (skora göre)
            finalScore: data.score,
            xpEarned: data.currentTournamentXP,
            resourcesEarned: data.currentTournamentResources,
            uid: data.uid // Firestore güncellemesi için UID gerekli
        }))
        .sort((a, b) => b.finalScore - a.finalScore); // Skora göre tekrar sırala (rank için)

    // Rank'ı tekrar ata
    detailedResults.forEach((player, index) => { player.rank = index + 1; });

    const winnerName = detailedResults[0]?.name || 'belli değil';
    sendAnnouncerMessage(`Yarışma sona erdi! Kazanan ${winnerName}! 🏆 İşte sonuçlar:`, "gameover");

    // 2. Frontend'e Detaylı Sonuçları Gönder
    io.to(TOURNAMENT_ROOM).emit('game_over', { results: detailedResults });

    // 3. Veritabanını Güncelle (Her oyuncu için XP ve Kaynaklar)
    if (db) { // Sadece Firestore bağlantısı varsa yap
        const updatePromises = detailedResults.map(playerResult => {
            if (!playerResult.uid) {
                 console.error(`Oyuncu ${playerResult.name} için UID bulunamadı, güncelleme atlanıyor.`);
                 return Promise.resolve(); // Bu oyuncuyu atla
            }
            const userDocRef = doc(db, "users", playerResult.uid);
            const updates = {
                xp: increment(playerResult.xpEarned),
                [`resources.bilgelik`]: increment(playerResult.resourcesEarned.bilgelik || 0),
                [`resources.zekaKristali`]: increment(playerResult.resourcesEarned.zekaKristali || 0),
                [`resources.enerji`]: increment(playerResult.resourcesEarned.enerji || 0),
                [`resources.kultur`]: increment(playerResult.resourcesEarned.kultur || 0),
                // TODO: Seviye atlama mantığı eklenebilir (yeni XP'ye göre)
            };
             console.log(`Firestore güncelleniyor: User ${playerResult.uid}, XP+=${playerResult.xpEarned}, Resources+=`, playerResult.resourcesEarned);
            return updateDoc(userDocRef, updates).catch(err => {
                console.error(`Firestore güncelleme hatası (${playerResult.uid}):`, err);
            });
        });

        try {
            await Promise.all(updatePromises);
            console.log("Tüm oyuncu verileri Firestore'da güncellendi.");
        } catch (error) {
            console.error("Firestore güncellemeleri sırasında toplu hata:", error);
        }
    } else {
        console.warn("Firestore bağlantısı yok, kullanıcı verileri güncellenemedi.");
    }

    // 4. Oyunu Sıfırla (Gecikmeli)
    setTimeout(() => {
        console.log("Oyun durumu IDLE'a dönüyor.");
        currentGameState = GAME_MODES.IDLE;
        tournamentPlayers.clear(); // Geçici turnuva verilerini temizle
        gameQuestions = [];
        currentQuestionIndex = -1;
        io.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun bekleniyor.' });
    }, 15000); // 15 saniye sonra sıfırla
}
// ---------------------------------------


io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}, Durum: ${currentGameState}`);
  socket.emit('initial_state', { gameState: currentGameState, players: getSortedPlayerList() });

  socket.on('join_tournament', (data) => {
    const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`;
    const playerGrade = data?.grade;
    const playerUid = data?.uid; // --- YENİ: UID bilgisini al ---

    if (!playerUid) {
        console.error(`Katılma isteği reddedildi: Oyuncu ${playerName} için UID gelmedi.`);
        socket.emit('error_message', { message: 'Kimlik bilgileri eksik, katılamazsınız.' });
        return;
    }

    if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) {
        socket.emit('error_message', { message: 'Devam eden oyun var veya yeni bitti.' });
        return;
    }
    if (tournamentPlayers.has(socket.id)) {
        console.log(`${playerName} zaten listede.`);
        socket.join(TOURNAMENT_ROOM);
        return;
    }

    console.log(`Oyuncu ${socket.id} (${playerName}, Sınıf: ${playerGrade || 'Belirtilmemiş'}, UID: ${playerUid}) turnuvaya katılıyor.`);
    socket.join(TOURNAMENT_ROOM);

    tournamentPlayers.set(socket.id, {
        name: playerName,
        score: 0,
        combo: 0,
        isReady: false,
        grade: playerGrade,
        uid: playerUid, // UID sakla
        currentTournamentXP: 0,
        currentTournamentResources: { ...DEFAULT_RESOURCES },
    });

    if (currentGameState === GAME_MODES.IDLE) {
        currentGameState = GAME_MODES.WAITING_TOURNAMENT;
    }
    console.log("Turnuva Oyuncuları:", Array.from(tournamentPlayers.keys()));
    sendAnnouncerMessage(`${playerName} yarışmaya katıldı! Aramıza hoş geldin! 👋`, "join");
    broadcastTournamentState();

    if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_INFORM) {
        io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Oyuncular bekleniyor. Hazır olduğunuzda belirtin.' });
    }
  });

  socket.on('player_ready', () => {
    if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || !tournamentPlayers.has(socket.id)) return;
    const player = tournamentPlayers.get(socket.id);
    if (!player.isReady) {
        player.isReady = true;
        console.log(`Oyuncu ${player.name} (${socket.id}) hazır.`);
        sendAnnouncerMessage(`${player.name} hazır! 👍`, "info");
        broadcastTournamentState();
        const allPlayersArray = Array.from(tournamentPlayers.values());
        if (allPlayersArray.length >= 1 && allPlayersArray.every(p => p.isReady)) {
            console.log("Tüm oyuncular hazır, turnuva başlatılıyor...");
            sendAnnouncerMessage("Herkes hazır görünüyor! Geri sayım başlasın!", "info");
            setTimeout(startTournament, 1000);
        } else {
            io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Diğer oyuncuların hazır olması bekleniyor...' });
        }
    }
  });

  socket.on('submit_answer', (data) => {
    const answerTime = Date.now();
    if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return;
    if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) { return; }

    const player = tournamentPlayers.get(socket.id);
    if (currentQuestionAnswers.has(socket.id)) { console.log(`${player.name} (${socket.id}) bu soruya zaten cevap verdi.`); return; }

    const question = gameQuestions[currentQuestionIndex];
    if (!question || typeof question.correct_answer === 'undefined' || typeof question.grade === 'undefined' || typeof question.branch === 'undefined') { // branch kontrolü eklendi
        console.error(`HATA: Soru ${currentQuestionIndex} için cevap kontrolü yapılamadı! Gerekli alanlar eksik.`);
        return;
    }

    const correctAnswer = question.correct_answer;
    const timeDiffMs = answerTime - questionStartTime;

    console.log(`Cevap alındı: ${player.name} (${socket.id}), Soru ${currentQuestionIndex+1}, Cevap: ${data.answer}, Süre: ${timeDiffMs}ms`);

    let pointsAwarded = 0;
    let correct = false;
    let comboBroken = false;
    let currentCombo = player.combo || 0;
    let adjustedBaseScore = BASE_SCORE;
    let gradeDifference = 0;
    let difficultyBonusPoints = 0;

    if (data.answer === correctAnswer) {
        correct = true;
        const timeRatio = Math.max(0, (QUESTION_TIME_LIMIT * 1000 - timeDiffMs) / (QUESTION_TIME_LIMIT * 1000));
        const timeBonus = Math.round(timeRatio * MAX_TIME_BONUS);
        player.combo = currentCombo + 1;
        const comboBonus = Math.min(MAX_COMBO_BONUS, Math.max(0, player.combo - 1) * COMBO_BONUS_MULTIPLIER);

        const playerGradeNum = getNumericGrade(player.grade);
        const questionGradeNum = getNumericGrade(question.grade);

        if (playerGradeNum !== null && questionGradeNum !== null) {
            gradeDifference = questionGradeNum - playerGradeNum;
            const difficultyMultiplier = 1.0 + (gradeDifference * GRADE_DIFFICULTY_FACTOR);
            const cappedMultiplier = Math.max(MIN_DIFFICULTY_PENALTY_MULTIPLIER, Math.min(difficultyMultiplier, MAX_DIFFICULTY_BONUS_MULTIPLIER));
            adjustedBaseScore = BASE_SCORE * cappedMultiplier;
            difficultyBonusPoints = Math.max(0, Math.round(adjustedBaseScore - BASE_SCORE));
        } else {
             adjustedBaseScore = BASE_SCORE; // Sınıf yoksa standart puan
        }

        pointsAwarded = Math.round(adjustedBaseScore + timeBonus + comboBonus);
        player.score += pointsAwarded;

        // --- YENİ: XP ve Kaynak Ekleme ---
        player.currentTournamentXP += XP_PER_CORRECT_ANSWER;
        const resourceType = BRANCH_RESOURCE_MAP[question.branch];
        if (resourceType && player.currentTournamentResources.hasOwnProperty(resourceType)) {
            player.currentTournamentResources[resourceType]++;
            console.log(`Kaynak kazanıldı: +1 ${resourceType}`);
        }
        // -----------------------------

        console.log(`Doğru! ${player.name} (${socket.id}) +${pointsAwarded}p. Skor: ${player.score}, Kombo: ${player.combo}`);

        if (gradeDifference >= SIGNIFICANT_GRADE_DIFFERENCE && difficultyBonusPoints > 0) {
             setTimeout(() => sendAnnouncerMessage(`İnanılmaz! ${player.name}, ${gradeDifference} sınıf üstü soruyu doğru cevapladı! +${difficultyBonusPoints} zorluk bonusu kazandı! 🚀`, "bonus"), 500);
        }
        if (player.combo >= 2) { setTimeout(()=> sendAnnouncerMessage(`${player.name} ${player.combo}x Kombo! 💪 +${comboBonus} bonus!`, "combo"), 300); }

    } else {
        comboBroken = player.combo > 0;
        player.combo = 0;
        console.log(`Yanlış! ${player.name} (${socket.id}). Kombo sıfırlandı.`);
        if (comboBroken) { setTimeout(()=> sendAnnouncerMessage(`${player.name}'in ${currentCombo}x kombosu sona erdi! 💥`, "combo_break"), 300); }
    }

    currentQuestionAnswers.set(socket.id, { answer: data.answer, timeMs: timeDiffMs, correct: correct });
    socket.emit('answer_result', { correct, score: player.score, pointsAwarded, combo: player.combo, comboBroken, questionIndex: currentQuestionIndex, submittedAnswer: data.answer });
    broadcastTournamentState(); // Skoru hemen güncelle
  });

  // ... (disconnect olayı aynı kalabilir) ...
  socket.on('disconnect', (reason) => {
      console.log(`[Disconnect] ID: ${socket.id}, Sebep: ${reason}, Mevcut Durum: ${currentGameState}`);
      if (tournamentPlayers.has(socket.id)) {
          const player = tournamentPlayers.get(socket.id);
          const wasReady = player.isReady;
          const playerName = player.name;
          const playerUid = player.uid; // UID al
          tournamentPlayers.delete(socket.id);
          console.log(`[Disconnect] Oyuncu ${socket.id} (${playerName}) silindi. Kalan Oyuncu Sayısı: ${tournamentPlayers.size}`);
          sendAnnouncerMessage(`${playerName} yarışmadan ayrıldı.`, "leave");

          if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) {
              broadcastTournamentState(); // Önce state'i güncelle
              if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && wasReady) {
                  const allPlayersArray = Array.from(tournamentPlayers.values());
                  const remainingPlayerCount = allPlayersArray.length;
                  const allRemainingReady = remainingPlayerCount >= 1 && allPlayersArray.every(p => p.isReady);
                   if (allRemainingReady) {
                      console.log("[Disconnect] Hazır oyuncu ayrıldı, kalanlar hazır. Turnuva başlatılıyor...");
                      setTimeout(startTournament, 1000);
                  }
              }
              if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING) {
                  if (tournamentPlayers.size < 1) {
                        console.log("[Disconnect] Oyuncu kalmadı, turnuva bitiriliyor.");
                        endTournament(); // Oyuncu kalmazsa bitir
                    }
               }
          } else {
               console.log(`[Disconnect] Oyuncu ${playerName} ayrıldı, oyun durumu ${currentGameState} olduğu için ek işlem yapılmadı.`);
          }
      } else {
          console.log(`[Disconnect] Ayrılan socket ${socket.id} turnuva listesinde değildi.`);
      }
    });

});

app.get('/', (req, res) => { res.setHeader('Content-Type', 'text/plain'); res.status(200).send(`Asrin Oyunu Backend Çalışıyor! Durum: ${currentGameState}, Oyuncular: ${tournamentPlayers.size}`); });
server.listen(PORT, () => { console.log(`Sunucu ${PORT} portunda dinleniyor...`); if (!process.env.DATABASE_URL) console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı."); });