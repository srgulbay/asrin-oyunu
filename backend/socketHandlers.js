const crypto = require('crypto');
const { pool } = require('./config/db');
const { dbAdmin, FieldValue, isAdminSDKInitialized } = require('./config/firebaseAdmin');
const { getNumericGrade } = require('./utils/helpers');
const {
    GAME_MODES, TOURNAMENT_ROOM, MIN_PLAYERS_TO_INFORM, QUESTION_TIME_LIMIT,
    BASE_SCORE, MAX_TIME_BONUS, COMBO_BONUS_MULTIPLIER, MAX_COMBO_BONUS,
    GRADE_DIFFICULTY_FACTOR, MAX_DIFFICULTY_BONUS_MULTIPLIER, MIN_DIFFICULTY_PENALTY_MULTIPLIER,
    SIGNIFICANT_GRADE_DIFFERENCE, XP_PER_CORRECT_ANSWER, BRANCH_RESOURCE_MAP, DEFAULT_RESOURCES
} = require('./config/constants');

let currentGameState = GAME_MODES.IDLE;
let tournamentPlayers = new Map();
let gameQuestions = [];
let currentQuestionIndex = -1;
let questionTimer = null;
let questionStartTime = 0;
let currentQuestionAnswers = new Map();

function setupSocketHandlers(ioInstance) { // Parametre adı ioInstance olarak değiştirildi

    function getSortedPlayerList() {
        return Array.from(tournamentPlayers.entries())
            .map(([id, data]) => ({ id, name: data.name, score: data.score, isReady: data.isReady, grade: data.grade, uid: data.uid }))
            .sort((a, b) => b.score - a.score);
    }

    function broadcastTournamentState() {
        const playersForBroadcast = getSortedPlayerList().map(p => ({id: p.id, name: p.name, score: p.score, isReady: p.isReady, grade: p.grade}));
        ioInstance.to(TOURNAMENT_ROOM).emit('tournament_state_update', { // io yerine ioInstance
            gameState: currentGameState, players: playersForBroadcast,
            currentQuestionIndex: currentQuestionIndex, totalQuestions: gameQuestions.length
        });
    }

    function sendAnnouncerMessage(message, type = 'info') {
        const formattedMessage = String(message);
        const messageId = crypto.randomUUID();
        console.log(`[Announcer][${messageId}] ${formattedMessage}`);
        ioInstance.to(TOURNAMENT_ROOM).emit('announcer_message', { id: messageId, text: formattedMessage, type: type, timestamp: Date.now() }); // io yerine ioInstance
    }

    function generateQuestionSummaryAnnouncements(qIndex) {
        if (qIndex < 0 || qIndex >= gameQuestions.length) return;
        if (currentQuestionAnswers.size === 0 && currentGameState === GAME_MODES.TOURNAMENT_RUNNING) { sendAnnouncerMessage(`Soru ${qIndex + 1} için kimse cevap vermedi! 🤷`, "warning"); return; }
        if (currentQuestionAnswers.size === 0) return;
        let correctCount = 0; let fastestTimeMs = Infinity; let fastestPlayerId = null; let submittedAnswerCount = currentQuestionAnswers.size;
        currentQuestionAnswers.forEach((answerData, playerId) => { if (answerData.correct) { correctCount++; if (answerData.timeMs < fastestTimeMs) { fastestTimeMs = answerData.timeMs; fastestPlayerId = playerId; } } });
        const totalPlayersInRoom = tournamentPlayers.size;
        if (correctCount === submittedAnswerCount && submittedAnswerCount === totalPlayersInRoom && totalPlayersInRoom > 1) { sendAnnouncerMessage(`Mükemmel tur! Herkes doğru bildi! 🏆 (${correctCount}/${totalPlayersInRoom})`, "all_correct"); }
        else if (correctCount === 0 && submittedAnswerCount > 0) { sendAnnouncerMessage(`Bu soruda doğru cevap veren olmadı! 🤔 (${correctCount}/${submittedAnswerCount} cevap)`, "none_correct"); }
        else if (correctCount > 0 && correctCount < submittedAnswerCount) { sendAnnouncerMessage(`${correctCount} oyuncu doğru cevabı buldu.`, "info"); }
        else if (correctCount > 0 && correctCount === submittedAnswerCount && submittedAnswerCount < totalPlayersInRoom) { sendAnnouncerMessage(`Cevap veren ${correctCount} oyuncunun hepsi doğru bildi!`, "info"); }
        if (fastestPlayerId && tournamentPlayers.has(fastestPlayerId)) { const fastestPlayerName = tournamentPlayers.get(fastestPlayerId).name; sendAnnouncerMessage(`En hızlı doğru cevap ${fastestPlayerName}'dan geldi! (${(fastestTimeMs / 1000).toFixed(1)}sn) ⚡️`, "speed"); }
        let maxCombo = 0; let comboPlayerName = null;
        tournamentPlayers.forEach((player) => { if (player.combo > maxCombo) { maxCombo = player.combo; comboPlayerName = player.name; } });
        if (maxCombo >= 3 && maxCombo % 2 !== 0) { sendAnnouncerMessage(`${comboPlayerName} ${maxCombo} maçlık galibiyet serisiyle coştu! 🔥`, "combo"); }
        const sortedPlayersForLead = getSortedPlayerList();
        if (sortedPlayersForLead.length > 0 && ( (qIndex + 1) % 3 === 0 || qIndex === gameQuestions.length -1 )) { sendAnnouncerMessage(`Şu anki lider ${sortedPlayersForLead[0].name} (${sortedPlayersForLead[0].score}p)! 👑`, "lead"); }
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
            if (!pool) { console.warn("UYARI: DB yok, örnek sorular kullanılıyor."); gameQuestions = sampleQuestions; }
            else {
                try {
                    const result = await pool.query('SELECT id, question_text, options, correct_answer, grade, branch FROM questions ORDER BY RANDOM() LIMIT 5');
                    if (result.rows.length === 0) { console.warn("UYARI: Veritabanında uygun soru bulunamadı, örnek sorular kullanılıyor."); gameQuestions = sampleQuestions; }
                    else { gameQuestions = result.rows; console.log(`${gameQuestions.length} adet soru veritabanından çekildi.`); }
                } catch (dbError) { console.error("Veritabanından soru çekme hatası:", dbError); sendAnnouncerMessage("Sorular yüklenirken bir hata oluştu.", "error"); gameQuestions = sampleQuestions; }
            }
            currentQuestionIndex = -1;
            tournamentPlayers.forEach(player => {
                 player.score = 0; player.combo = 0; player.isReady = false;
                 player.currentTournamentXP = 0; player.currentTournamentResources = { ...DEFAULT_RESOURCES };
                 player.maxComboAchieved = 0; player.minCorrectAnswerTimeMs = Infinity;
                 player.maxDifficultyBonusAchieved = 0; player.correctAnswerCount = 0;
                 player.totalAnswerCount = 0; player.totalCorrectAnswerTimeMs = 0; player.bonusResourcesEarned = 0;
            });
            broadcastTournamentState();
            setTimeout(sendNextQuestion, 3000);
        } catch (error) {
            console.error("Turnuva başlatılırken hata:", error); sendAnnouncerMessage(`Oyun başlatılamadı: ${error.message}.`, "error");
            currentGameState = GAME_MODES.IDLE; tournamentPlayers.forEach(p => p.isReady = false); broadcastTournamentState();
        }
    }

    function sendNextQuestion() {
        clearTimeout(questionTimer);
        if (currentQuestionIndex >= 0 && currentQuestionIndex < gameQuestions.length) { generateQuestionSummaryAnnouncements(currentQuestionIndex); }
        currentQuestionAnswers.clear(); currentQuestionIndex++;
        if (currentQuestionIndex >= gameQuestions.length) { endTournament(); return; }
        const question = gameQuestions[currentQuestionIndex];
        if (!question || !question.question_text || !question.options || typeof question.correct_answer === 'undefined' || typeof question.grade === 'undefined' || typeof question.branch === 'undefined') {
            console.error("HATA: Geçersiz soru formatı!", question); sendAnnouncerMessage("Sıradaki soru yüklenirken hata oluştu!", "error"); endTournament(); return;
        }
        const questionData = { index: currentQuestionIndex, total: gameQuestions.length, text: question.question_text, options: question.options, timeLimit: QUESTION_TIME_LIMIT, grade: question.grade, branch: question.branch };
        const questionAnnounceText = `Soru ${currentQuestionIndex + 1}/${gameQuestions.length}: ${question.question_text}`;
        setTimeout(() => {
            sendAnnouncerMessage(questionAnnounceText, "question"); console.log(`Soru ${currentQuestionIndex + 1} (Sınıf: ${question.grade}) gönderiliyor...`);
            questionStartTime = Date.now(); ioInstance.to(TOURNAMENT_ROOM).emit('new_question', questionData); // io yerine ioInstance
        }, 1000);
        questionTimer = setTimeout(() => {
            console.log(`Soru ${currentQuestionIndex + 1} için süre doldu.`); ioInstance.to(TOURNAMENT_ROOM).emit('question_timeout', { questionIndex: currentQuestionIndex }); sendNextQuestion(); // io yerine ioInstance
        }, QUESTION_TIME_LIMIT * 1000 + 1000);
    }

    async function endTournament() {
        clearTimeout(questionTimer);
        if(currentQuestionIndex >= 0 && gameQuestions.length > 0 && currentQuestionIndex < gameQuestions.length) { generateQuestionSummaryAnnouncements(currentQuestionIndex); }
        console.log("Turnuva bitti!"); currentGameState = GAME_MODES.GAME_OVER;
        const finalPlayerData = Array.from(tournamentPlayers.entries());
        const sortedFinalPlayerData = finalPlayerData.filter(([id, data]) => data.uid).sort(([, dataA], [, dataB]) => dataB.score - dataA.score);
        const detailedResults = sortedFinalPlayerData.map(([id, data], index) => {
            const rank = index + 1; const achievements = [];
            if (rank === 1 && sortedFinalPlayerData.length > 1) achievements.push({ id: 'winner', name: 'Şampiyon!', value: '1.' });
            else if (rank <= 3 && sortedFinalPlayerData.length >= 3) achievements.push({ id: 'top3', name: 'Podyum!', value: `${rank}.` });
            if (data.maxComboAchieved >= 5) achievements.push({ id: 'combo_master', name: 'Kombo Ustası', value: `${data.maxComboAchieved}x` });
            else if (data.maxComboAchieved >= 3) achievements.push({ id: 'combo_streak', name: 'Kombo Serisi', value: `${data.maxComboAchieved}x` });
            if (data.minCorrectAnswerTimeMs <= 3000 && data.minCorrectAnswerTimeMs !== Infinity) achievements.push({ id: 'super_sonic', name: 'Süper Sonik', value: `<3sn` });
            else if (data.minCorrectAnswerTimeMs <= 7000 && data.minCorrectAnswerTimeMs !== Infinity) achievements.push({ id: 'quick_reflex', name: 'Hızlı Refleks', value: `<7sn` });
            if (data.maxDifficultyBonusAchieved > BASE_SCORE * 0.3) achievements.push({ id: 'giant_slayer', name: 'Dev Avcısı', value: `+${data.maxDifficultyBonusAchieved}p` });
            const accuracy = data.totalAnswerCount > 0 ? Math.round((data.correctAnswerCount / data.totalAnswerCount) * 100) : 0;
            if (accuracy >= 90 && data.totalAnswerCount >= gameQuestions.length * 0.8) achievements.push({ id: 'sharp_mind', name: 'Keskin Zeka', value: `%${accuracy}` });
            else if (accuracy >= 70 && data.totalAnswerCount >= gameQuestions.length * 0.6) achievements.push({ id: 'good_accuracy', name: 'İyi Odaklanma', value: `%${accuracy}` });
            achievements.push({ id: 'participant', name: 'Katılımcı', value: '👍' });
            return { id: id, uid: data.uid, name: data.name, rank: rank, finalScore: data.score, xpEarned: data.currentTournamentXP, resourcesEarned: data.currentTournamentResources, achievements: achievements };
        });
        const winnerName = detailedResults[0]?.name || 'belli değil';
        sendAnnouncerMessage(`Yarışma sona erdi! Kazanan ${winnerName}! 🏆 İşte sonuçlar:`, "gameover");
        ioInstance.to(TOURNAMENT_ROOM).emit('game_over', { results: detailedResults }); // io yerine ioInstance
        if (isAdminSDKInitialized && dbAdmin) {
            const updatePromises = detailedResults.map(playerResult => {
                const userDocRefAdmin = dbAdmin.collection("users").doc(playerResult.uid); const updates = {};
                if (playerResult.xpEarned > 0) { updates.xp = FieldValue.increment(playerResult.xpEarned); }
                for (const [resource, amount] of Object.entries(playerResult.resourcesEarned)) { if (amount > 0) { updates[`resources.${resource}`] = FieldValue.increment(amount); } }
                if (Object.keys(updates).length > 0) { console.log(`Firestore güncelleniyor: User ${playerResult.uid}`, updates); return userDocRefAdmin.update(updates).catch(err => console.error(`Firestore güncelleme hatası (UID: ${playerResult.uid}):`, err)); }
                else { console.log(`Kullanıcı ${playerResult.uid} için güncelleme gerektirecek kazanç yok.`); return Promise.resolve(); }
            });
            try { await Promise.all(updatePromises); console.log("Tüm oyuncu verileri Firestore'da güncellendi."); }
            catch (error) { console.error("Firestore güncellemeleri sırasında toplu hata:", error); }
        } else { console.warn("Firebase Admin SDK başlatılmadığı için Firestore güncellemeleri yapılamadı."); }
        setTimeout(() => {
            console.log("Oyun durumu IDLE'a dönüyor."); currentGameState = GAME_MODES.IDLE; tournamentPlayers.clear(); gameQuestions = []; currentQuestionIndex = -1;
            ioInstance.to(TOURNAMENT_ROOM).emit('reset_game', { message: 'Oyun bitti. Yeni oyun bekleniyor.' }); // io yerine ioInstance
        }, 15000);
    }

    // Ana Bağlantı Olay Yöneticisi
    ioInstance.on('connection', (socket) => { // io yerine ioInstance
        console.log(`Bağlandı: ${socket.id}, Durum: ${currentGameState}`);
        socket.emit('initial_state', { gameState: currentGameState, players: getSortedPlayerList() });

        socket.on('join_tournament', (data) => {
            const playerName = data?.name?.trim() || `Oyuncu_${socket.id.substring(0, 4)}`;
            const playerGrade = data?.grade; const playerUid = data?.uid;
            if (!playerUid) { console.error(`Katılma isteği reddedildi: Oyuncu ${playerName} (${socket.id}) için UID gelmedi.`); socket.emit('error_message', { message: 'Kimlik bilgileri eksik, katılamazsınız.' }); return; }
            if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.GAME_OVER ) { socket.emit('error_message', { message: 'Devam eden oyun var veya yeni bitti.' }); return; }
            if (tournamentPlayers.has(socket.id)) { console.log(`${playerName} (${socket.id}) zaten listede.`); socket.join(TOURNAMENT_ROOM); return; }
            console.log(`Oyuncu ${socket.id} (${playerName}, Sınıf: ${playerGrade || 'Belirtilmemiş'}, UID: ${playerUid}) turnuvaya katılıyor.`); socket.join(TOURNAMENT_ROOM);
            tournamentPlayers.set(socket.id, { name: playerName, score: 0, combo: 0, isReady: false, grade: playerGrade, uid: playerUid, currentTournamentXP: 0, currentTournamentResources: { ...DEFAULT_RESOURCES }, maxComboAchieved: 0, minCorrectAnswerTimeMs: Infinity, maxDifficultyBonusAchieved: 0, correctAnswerCount: 0, totalAnswerCount: 0, totalCorrectAnswerTimeMs: 0, bonusResourcesEarned: 0 });
            if (currentGameState === GAME_MODES.IDLE) { currentGameState = GAME_MODES.WAITING_TOURNAMENT; }
            sendAnnouncerMessage(`${playerName} yarışmaya katıldı! Aramıza hoş geldin! 👋`, "join"); broadcastTournamentState();
            if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && tournamentPlayers.size >= MIN_PLAYERS_TO_INFORM) {
                 ioInstance.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Oyuncular bekleniyor. Hazır olduğunuzda belirtin.' }); // io yerine ioInstance
            }
        });

        socket.on('player_ready', () => {
            if (currentGameState !== GAME_MODES.WAITING_TOURNAMENT || !tournamentPlayers.has(socket.id)) return;
            const player = tournamentPlayers.get(socket.id);
            if (!player.isReady) {
                player.isReady = true; console.log(`Oyuncu ${player.name} (${socket.id}) hazır.`); sendAnnouncerMessage(`${player.name} hazır! 👍`, "info"); broadcastTournamentState();
                const allPlayersArray = Array.from(tournamentPlayers.values()); const readyPlayerCount = allPlayersArray.filter(p => p.isReady).length; const totalPlayerCount = allPlayersArray.length;
                if (totalPlayerCount >= 1 && readyPlayerCount === totalPlayerCount) { console.log("Tüm oyuncular hazır, turnuva başlatılıyor..."); sendAnnouncerMessage("Herkes hazır görünüyor! Geri sayım başlasın!", "info"); setTimeout(startTournament, 1000); }
                else { ioInstance.to(TOURNAMENT_ROOM).emit('waiting_update', { message: 'Diğer oyuncuların hazır olması bekleniyor...' }); } // io yerine ioInstance
            }
        });

        socket.on('submit_answer', (data) => {
            const answerTime = Date.now();
            if (currentGameState !== GAME_MODES.TOURNAMENT_RUNNING || !tournamentPlayers.has(socket.id)) return;
            if (typeof data.questionIndex !== 'number' || data.questionIndex !== currentQuestionIndex) { return; }
            const player = tournamentPlayers.get(socket.id);
            if (currentQuestionAnswers.has(socket.id)) { console.log(`${player.name} (${socket.id}) bu soruya zaten cevap verdi.`); return; }
            const question = gameQuestions[currentQuestionIndex];
            if (!question || typeof question.correct_answer === 'undefined' || typeof question.grade === 'undefined' || typeof question.branch === 'undefined') { console.error(`HATA: Soru ${currentQuestionIndex} için cevap kontrolü yapılamadı!`); return; }
            const correctAnswer = question.correct_answer; const timeDiffMs = answerTime - questionStartTime;
            let pointsAwarded = 0; let correct = false; let comboBroken = false; let currentCombo = player.combo || 0; let adjustedBaseScore = BASE_SCORE; let gradeDifference = 0; let difficultyBonusPoints = 0;
            player.totalAnswerCount++;
            if (data.answer === correctAnswer) {
                correct = true; player.correctAnswerCount++; player.totalCorrectAnswerTimeMs += timeDiffMs; if (timeDiffMs < player.minCorrectAnswerTimeMs) { player.minCorrectAnswerTimeMs = timeDiffMs; }
                const timeRatio = Math.max(0, (QUESTION_TIME_LIMIT * 1000 - timeDiffMs) / (QUESTION_TIME_LIMIT * 1000)); const timeBonus = Math.round(timeRatio * MAX_TIME_BONUS);
                player.combo = currentCombo + 1; if (player.combo > player.maxComboAchieved) { player.maxComboAchieved = player.combo; } const comboBonus = Math.min(MAX_COMBO_BONUS, Math.max(0, player.combo - 1) * COMBO_BONUS_MULTIPLIER);
                const playerGradeNum = getNumericGrade(player.grade); const questionGradeNum = getNumericGrade(question.grade);
                if (playerGradeNum !== null && questionGradeNum !== null) {
                    gradeDifference = questionGradeNum - playerGradeNum; const difficultyMultiplier = 1.0 + (gradeDifference * GRADE_DIFFICULTY_FACTOR); const cappedMultiplier = Math.max(MIN_DIFFICULTY_PENALTY_MULTIPLIER, Math.min(difficultyMultiplier, MAX_DIFFICULTY_BONUS_MULTIPLIER)); adjustedBaseScore = BASE_SCORE * cappedMultiplier; difficultyBonusPoints = Math.max(0, Math.round(adjustedBaseScore - BASE_SCORE)); if (difficultyBonusPoints > player.maxDifficultyBonusAchieved) { player.maxDifficultyBonusAchieved = difficultyBonusPoints; }
                } else { adjustedBaseScore = BASE_SCORE; }
                pointsAwarded = Math.round(adjustedBaseScore + timeBonus + comboBonus); player.score += pointsAwarded; player.currentTournamentXP += XP_PER_CORRECT_ANSWER;
                const resourceType = BRANCH_RESOURCE_MAP[question.branch];
                if (resourceType && player.currentTournamentResources.hasOwnProperty(resourceType)) { player.currentTournamentResources[resourceType]++; if (comboBonus > 0 || difficultyBonusPoints > 0) { player.currentTournamentResources[resourceType]++; player.bonusResourcesEarned++; console.log(`Bonus kaynak kazanıldı: +1 ${resourceType}`); } }
                console.log(`Doğru! ${player.name} (${socket.id}) +${pointsAwarded}p.`);
                if (gradeDifference >= SIGNIFICANT_GRADE_DIFFERENCE && difficultyBonusPoints > 0) { setTimeout(() => sendAnnouncerMessage(`İnanılmaz! ${player.name}, ${gradeDifference} sınıf üstü soruyu doğru cevapladı! +${difficultyBonusPoints} zorluk bonusu kazandı! 🚀`, "bonus"), 500); }
                if (player.combo >= 2) { setTimeout(()=> sendAnnouncerMessage(`${player.name} ${player.combo}x Kombo! 💪 +${comboBonus} bonus!`, "combo"), 300); }
            } else {
                comboBroken = player.combo > 0; player.combo = 0; console.log(`Yanlış! ${player.name} (${socket.id}).`); if (comboBroken) { setTimeout(()=> sendAnnouncerMessage(`${player.name}'in ${currentCombo}x kombosu sona erdi! 💥`, "combo_break"), 300); }
            }
            currentQuestionAnswers.set(socket.id, { answer: data.answer, timeMs: timeDiffMs, correct: correct });
            socket.emit('answer_result', { correct, score: player.score, pointsAwarded, combo: player.combo, comboBroken, questionIndex: currentQuestionIndex, submittedAnswer: data.answer }); broadcastTournamentState();
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Disconnect] ID: ${socket.id}, Sebep: ${reason}`);
            if (tournamentPlayers.has(socket.id)) {
                const player = tournamentPlayers.get(socket.id); const wasReady = player.isReady; const playerName = player.name;
                tournamentPlayers.delete(socket.id); console.log(`[Disconnect] Oyuncu ${socket.id} (${playerName}) silindi. Kalan: ${tournamentPlayers.size}`); sendAnnouncerMessage(`${playerName} yarışmadan ayrıldı.`, "leave");
                if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING || currentGameState === GAME_MODES.WAITING_TOURNAMENT) {
                    broadcastTournamentState();
                    if (currentGameState === GAME_MODES.WAITING_TOURNAMENT && wasReady) {
                        const allPlayersArray = Array.from(tournamentPlayers.values()); const remainingPlayerCount = allPlayersArray.length; const allRemainingReady = remainingPlayerCount >= 1 && allPlayersArray.every(p => p.isReady);
                        if (allRemainingReady) { console.log("[Disconnect] Hazır oyuncu ayrıldı, kalanlar hazır. Turnuva başlatılıyor..."); setTimeout(startTournament, 1000); }
                    }
                    if (currentGameState === GAME_MODES.TOURNAMENT_RUNNING && tournamentPlayers.size < 1) { console.log("[Disconnect] Oyuncu kalmadı, turnuva bitiriliyor."); endTournament(); }
                }
            } else { console.log(`[Disconnect] Ayrılan socket ${socket.id} turnuva listesinde değildi.`); }
        });
    }); // io.on('connection') sonu
} // setupSocketHandlers sonu

module.exports = setupSocketHandlers; // Fonksiyonu export et