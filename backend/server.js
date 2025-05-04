require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Pool } = require('pg');
const crypto = require('crypto');

// --- Firebase Admin SDK import ve başlatma ---
const admin = require("firebase-admin");
let dbAdmin; // Firestore instance'ını global yapalım
let authAdmin; // Auth instance'ını global yapalım

try {
    if (!process.env.FIREBASE_ADMIN_SDK_CONFIG) {
        throw new Error("FIREBASE_ADMIN_SDK_CONFIG ortam değişkeni bulunamadı!");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);

    if (!admin.apps.length) {
         admin.initializeApp({
           credential: admin.credential.cert(serviceAccount)
         });
         console.log("Firebase Admin SDK başarıyla başlatıldı.");
    } else {
         admin.app();
    }
    dbAdmin = admin.firestore(); // Firestore instance'ı al
    authAdmin = admin.auth(); // Auth instance'ı al

} catch (error) {
    console.error("Firebase Admin SDK başlatılırken HATA:", error.message);
    dbAdmin = null; // Hata durumunda null yap
    authAdmin = null;
}
const FieldValue = admin.firestore.FieldValue;
// -----------------------------------------------


const app = express();
const server = http.createServer(app);
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
  },
  pingTimeout: 60000, // WebSocket stabilitesi için
  pingInterval: 25000 // WebSocket stabilitesi için
});

// --- YENİ: Socket.IO Authentication Middleware ---
io.use(async (socket, next) => {
  // Admin SDK başlatılamadıysa kimseyi bağlama (güvenlik)
  if (!authAdmin) {
       console.error("Auth Middleware: Firebase Admin SDK başlatılmadığı için bağlantı reddedildi.");
       return next(new Error('Server configuration error'));
  }

  const token = socket.handshake.auth?.token;
  console.log(`[Auth Middleware] Gelen bağlantı ID: ${socket.id}. Token var mı: ${!!token}`);

  if (!token) {
    console.warn(`[Auth Middleware] ${socket.id} için token yok. Bağlantı reddedildi.`);
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    console.log(`[Auth Middleware] Token doğrulanıyor: ${token.substring(0, 10)}...`);
    const decodedToken = await authAdmin.verifyIdToken(token);
    socket.userId = decodedToken.uid; // <-- UID'yi socket nesnesine ekle
    console.log(`[Auth Middleware] Token doğrulandı. UID: ${socket.userId} socket'e eklendi. Bağlantıya izin veriliyor.`);
    next(); // Token geçerli, bağlantıya izin ver
  } catch (err) {
    console.error(`[Auth Middleware] Token doğrulama hatası (${socket.id}):`, err.message);
    next(new Error('Authentication error: Invalid token')); // Token geçersiz, bağlantıyı reddet
  }
});
// -----------------------------------------------

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
const XP_PER_CORRECT_ANSWER = 10;
const BRANCH_RESOURCE_MAP = {
    'Matematik': 'zekaKristali', 'Türkçe': 'bilgelik', 'Fen Bilimleri': 'enerji',
    'Sosyal Bilgiler': 'kultur', 'Tarih': 'kultur', 'Coğrafya': 'kultur',
    'İngilizce': 'bilgelik', 'Teknoloji': 'zekaKristali',
};
const DEFAULT_RESOURCES = { bilgelik: 0, zekaKristali: 0, enerji: 0, kultur: 0 };

function getNumericGrade(gradeString) {
    if (!gradeString) return null;
    if (String(gradeString).toLowerCase() === 'okul öncesi') return 0;
    const gradeNum = parseInt(gradeString, 10);
    return isNaN(gradeNum) ? null : gradeNum;
}

function getSortedPlayerList() {
    return Array.from(tournamentPlayers.entries())
        .map(([id, data]) => ({
             id, name: data.name, score: data.score, isReady: data.isReady, grade: data.grade,
             // Sonuçlar için gerekli alanlar da eklenebilir veya ayrı hesaplanabilir
             // uid: data.uid, // Bu artık endTournament içinde eklenecek
             // xpEarned: data.currentTournamentXP,
             // resourcesEarned: data.currentTournamentResources
        }))
        .sort((a, b) => b.score - a.score);
}

function broadcastTournamentState() {
    io.to(TOURNAMENT_ROOM).emit('tournament_state_update', {
        gameState: currentGameState,
        players: getSortedPlayerList(), // Sadece temel bilgileri gönderir
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

    const sortedPlayersForLead = getSortedPlayerList();
    if (sortedPlayersForLead.length > 0) { if ( (qIndex + 1) % 3 === 0 || qIndex === gameQuestions.length -1 ) { sendAnnouncerMessage(`Şu anki lider ${sortedPlayersForLead[0].name} (${sortedPlayersForLead[0].score}p)! 👑`, "lead"); } }
}

async function startTournament() {
    const allPlayers = Array.from(tournamentPlayers.values());
    if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || allPlayers.length < 1 || !allPlayers.every(p => p.isReady)) { sendAnnouncerMessage("Tüm oyuncular hazır olmadan oyun başlayamaz!", "warning"); return; }

    sendAnnouncerMessage("Tüm oyuncular hazır! Yarışma 3 saniye içinde başlıyor...", "info"); console.log("Tüm oyuncular hazır. Turnuva başlıyor!");
    currentGameState = GAME_MODES.TOURNAMENT_RUNNING;

    try {
         const sampleQuestions = [
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
            try {
                // TODO: Oyuncu sınıflarına göre filtreleme ekle
                const result = await pool.query('SELECT id, question_text, options, correct_answer, grade, branch FROM questions ORDER BY RANDOM() LIMIT 5');
                if (result.rows.length === 0) {
                    console.warn("UYARI: Veritabanında uygun soru bulunamadı, örnek sorular kullanılıyor.");
                    gameQuestions = sampleQuestions;
                } else {
                    gameQuestions = result.rows;
                    console.log(`${gameQuestions.length} adet soru veritabanından çekildi.`);
                }
            } catch (dbError) {
                 console.error("Veritabanından soru çekme hatası:", dbError);
                 sendAnnouncerMessage("Sorular yüklenirken bir hata oluştu. Lütfen tekrar deneyin.", "error");
                 gameQuestions = sampleQuestions;
            }
        }

        currentQuestionIndex = -1;
        tournamentPlayers.forEach(player => {
             player.score = 0; player.combo = 0; player.isReady = false;
             player.currentTournamentXP = 0; player.currentTournamentResources = { ...DEFAULT_RESOURCES };
        });
        broadcastTournamentState();
        setTimeout(sendNextQuestion, 3000);
    } catch (error) {
        console.error("Turnuva başlatılırken hata:", error);
        sendAnnouncerMessage(`Oyun başlatılamadı: ${error.message}.`, "error");
        currentGameState = GAME_MODES.IDLE;
        tournamentPlayers.forEach(p => p.isReady = false);
        broadcastTournamentState();
    }
}

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
    if (!question || !question.question_text || !question.options || typeof question.correct_answer === 'undefined' || typeof question.grade === 'undefined' || typeof question.branch === 'undefined') {
        console.error("HATA: Geçersiz soru formatı veya eksik sınıf/branş bilgisi!", question);
        sendAnnouncerMessage("Sıradaki soru yüklenirken hata oluştu!", "error");
        endTournament();
        return;
    }

    const questionData = { index: currentQuestionIndex, total: gameQuestions.length, text: question.question_text, options: question.options, timeLimit: QUESTION_TIME_LIMIT, grade: question.grade, branch: question.branch };
    const questionAnnounceText = `Soru ${currentQuestionIndex + 1}/${gameQuestions.length}: ${question.question_text}`;

    setTimeout(() => {
        sendAnnouncerMessage(questionAnnounceText, "question");
        console.log(`Soru ${currentQuestionIndex + 1}/${gameQuestions.length} (Sınıf: ${question.grade}) gönderiliyor...`);
        questionStartTime = Date.now();
        io.to(TOURNAMENT_ROOM).emit('new_question', questionData);
    }, 1000);

    questionTimer = setTimeout(() => {
        console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`);
        io.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex });
        sendNextQuestion();
    }, QUESTION_TIME_LIMIT * 1000 + 1000);
}

async function endTournament() {
    clearTimeout(questionTimer);
    if(currentQuestionIndex >= 0 && gameQuestions.length > 0 && currentQuestionIndex < gameQuestions.length) {
         generateQuestionSummaryAnnouncements(currentQuestionIndex);
    }
    console.log("Turnuva bitti!");
    currentGameState = GAME_MODES.GAME_OVER;

    const finalPlayerData = Array.from(tournamentPlayers.entries());
    const sortedFinalPlayerData = finalPlayerData
        .filter(([id, data]) => data.uid)
        .sort(([, dataA], [, dataB]) => dataB.score - dataA.score);

    const detailedResults = sortedFinalPlayerData.map(([id, data], index) => ({
            id: id,
            uid: data.uid, // UID artık burada
            name: data.name,
            rank: index + 1,
            finalScore: data.score,
            xpEarned: data.currentTournamentXP,
            resourcesEarned: data.currentTournamentResources,
        }));

    const winnerName = detailedResults[0]?.name || 'belli değil';
    sendAnnouncerMessage(`Yarışma sona erdi! Kazanan ${winnerName}! 🏆 İşte sonuçlar:`, "gameover");

    io.to(TOURNAMENT_ROOM).emit('game_over', { results: detailedResults });

    if (admin.apps.length > 0 && dbAdmin) {
        const updatePromises = detailedResults.map(playerResult => {
            const userDocRefAdmin = dbAdmin.collection("users").doc(playerResult.uid);
            const updates = {};
            if (playerResult.xpEarned > 0) { updates.xp = FieldValue.increment(playerResult.xpEarned); }
            for (const [resource, amount] of Object.entries(playerResult.resourcesEarned)) {
                if (amount > 0) { updates[`resources.${resource}`] = FieldValue.increment(amount); }
            }
            if (Object.keys(updates).length > 0) {
                 console.log(`Firestore güncelleniyor: User ${playerResult.uid}`, updates);
                 return userDocRefAdmin.update(updates).catch(err => {
                    console.error(`Firestore güncelleme hatası (UID: ${playerResult.uid}):`, err);
                 });
            } else {
                 console.log(`Kullanıcı ${playerResult.uid} için güncelleme gerektirecek kazanç yok.`);
                 return Promise.resolve();
            }
        });
        try {
            await Promise.all(updatePromises);
            console.log("Tüm oyuncu verileri Firestore'da güncellendi (ya da güncelleme gerekmedi).");
        } catch (error) {
            console.error("Firestore güncellemeleri sırasında toplu hata:", error);
        }
    } else {
        console.warn("Firebase Admin SDK başlatılmadığı için Firestore güncellemeleri yapılamadı.");
    }

    setTimeout(() => {
        console.log("Oyun durumu IDLE'a dönüyor.");
        currentGameState = GAME_MODES.IDLE;
        tournamentPlayers.clear();
        gameQuestions = [];
        currentQuestionIndex = -1;
        io.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun bekleniyor.' });
    }, 15000);
}


io.on('connection', (socket) => {
  // Middleware tarafından userId eklendiği için burada erişilebilir olmalı
  console.log(`Bağlandı: ${socket.id}, Kullanıcı ID (Auth): ${socket.userId}, Durum: ${currentGameState}`);

  // Bağlantı başarılı olduğu anda (middleware'den geçtiyse) initial state gönder
  socket.emit('initial_state', { gameState: currentGameState, players: getSortedPlayerList() });

  socket.on('join_tournament', (data) => {
    const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`;
    const playerGrade = data?.grade;
    // --- UID'yi data'dan değil, socket nesnesinden al ---
    const playerUid = socket.userId;
    // --------------------------------------------------

    // Middleware zaten kimlik doğrulaması yaptığı için burada tekrar UID kontrolü GEREKSİZ
    // if (!playerUid) { ... } bloğu kaldırıldı.

    if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) {
        socket.emit('error_message', { message: 'Devam eden oyun var veya yeni bitti.' });
        return;
    }
    if (tournamentPlayers.has(socket.id)) {
        console.log(`${playerName} zaten listede.`);
        socket.join(TOURNAMENT_ROOM); // Odada olduğundan emin ol
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
        uid: playerUid, // Doğrulanmış UID'yi sakla
        currentTournamentXP: 0,
        currentTournamentResources: { ...DEFAULT_RESOURCES },
    });

    if (currentGameState === GAME_MODES.IDLE) {
        currentGameState = GAME_MODES.WAITING_TOURNAMENT;
    }
    sendAnnouncerMessage(`${playerName} yarışmaya katıldı! Aramıza hoş geldin! 👋`, "join");
    broadcastTournamentState();

    if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_INFORM) {
        io.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Oyuncular bekleniyor. Hazır olduğunuzda belirtin.' });
    }
  });

  socket.on('player_ready', () => {
    // Middleware tarafından kimlik doğrulaması yapıldığı için userId'nin var olduğunu varsayabiliriz
    if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || !tournamentPlayers.has(socket.id)) return;
    const player = tournamentPlayers.get(socket.id);
    if (!player.isReady) {
        player.isReady = true;
        console.log(`Oyuncu ${player.name} (${socket.id}) hazır.`);
        sendAnnouncerMessage(`${player.name} hazır! 👍`, "info");
        broadcastTournamentState();
        const allPlayersArray = Array.from(tournamentPlayers.values());
        const readyPlayerCount = allPlayersArray.filter(p => p.isReady).length;
        const totalPlayerCount = allPlayersArray.length;
        if (totalPlayerCount >= 1 && readyPlayerCount === totalPlayerCount) {
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
    // Middleware tarafından kimlik doğrulaması yapıldığı için userId'nin var olduğunu varsayabiliriz
    if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return;
    if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) { return; }

    const player = tournamentPlayers.get(socket.id);
    if (currentQuestionAnswers.has(socket.id)) { console.log(`${player.name} (${socket.id}) bu soruya zaten cevap verdi.`); return; }

    const question = gameQuestions[currentQuestionIndex];
    if (!question || typeof question.correct_answer === 'undefined' || typeof question.grade === 'undefined' || typeof question.branch === 'undefined') {
        console.error(`HATA: Soru ${currentQuestionIndex} için cevap kontrolü yapılamadı! Gerekli alanlar eksik.`);
        return;
    }

    const correctAnswer = question.correct_answer;
    const timeDiffMs = answerTime - questionStartTime;

    let pointsAwarded = 0; let correct = false; let comboBroken = false;
    let currentCombo = player.combo || 0; let adjustedBaseScore = BASE_SCORE;
    let gradeDifference = 0; let difficultyBonusPoints = 0;

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
             adjustedBaseScore = BASE_SCORE;
        }

        pointsAwarded = Math.round(adjustedBaseScore + timeBonus + comboBonus);
        player.score += pointsAwarded;
        player.currentTournamentXP += XP_PER_CORRECT_ANSWER;
        const resourceType = BRANCH_RESOURCE_MAP[question.branch];
        if (resourceType && player.currentTournamentResources.hasOwnProperty(resourceType)) {
            player.currentTournamentResources[resourceType]++;
        }

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
    broadcastTournamentState();
  });

  socket.on('disconnect', (reason) => {
      console.log(`[Disconnect] ID: ${socket.id}, Kullanıcı ID: ${socket.userId || 'yok'}, Sebep: ${reason}, Mevcut Durum: ${currentGameState}`);
      if (tournamentPlayers.has(socket.id)) {
          const player = tournamentPlayers.get(socket.id);
          const wasReady = player.isReady;
          const playerName = player.name;
          tournamentPlayers.delete(socket.id);
          console.log(`[Disconnect] Oyuncu ${socket.id} (${playerName}) silindi. Kalan Oyuncu Sayısı: ${tournamentPlayers.size}`);
          sendAnnouncerMessage(`${playerName} yarışmadan ayrıldı.`, "leave");

          if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) {
              broadcastTournamentState();
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
                        endTournament();
                    }
               }
          }
      } else {
          console.log(`[Disconnect] Ayrılan socket ${socket.id} turnuva listesinde değildi.`);
      }
    });
}); // io.on('connection') sonu


app.get('/', (req, res) => { res.setHeader('Content-Type', 'text/plain'); res.status(200).send(`Asrin Oyunu Backend Çalışıyor! Durum: ${currentGameState}, Oyuncular: ${tournamentPlayers.size}`); });
server.listen(PORT, () => { console.log(`Sunucu ${PORT} portunda dinleniyor...`); if (!process.env.DATABASE_URL) console.warn("UYARI: DATABASE_URL çevre değişkeni bulunamadı."); });