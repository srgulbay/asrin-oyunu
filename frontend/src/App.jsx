import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_BACKEND_URL;
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const MAX_LOG_MESSAGES = 15;

function App() {
  // Socket & Bağlantı
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');

  // Oyun State'leri
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameResults, setGameResults] = useState(null);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [highlightMessages, setHighlightMessages] = useState([]);
  const [announcerLog, setAnnouncerLog] = useState([]);

  const questionTimerIntervalRef = useRef(null);
  const announcerLogRef = useRef(null);

  // --- Otomatik Kaydırma ---
   useEffect(() => { if (announcerLogRef.current) { announcerLogRef.current.scrollTop = 0; } }, [announcerLog]);

  // --- Socket Bağlantısı ve Temel Olaylar ---
  useEffect(() => { if (!SERVER_URL) { console.error("HATA: VITE_BACKEND_URL tanımlanmamış!"); setConnectionMessage('HATA: Backend adresi yapılandırılmamış!'); return; } console.log("Bağlanılacak Backend URL:", SERVER_URL); const newSocket = io(SERVER_URL); setSocket(newSocket); newSocket.on("connect", () => { console.log("Socket.IO'ya bağlandı! ID:", newSocket.id); setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); }); newSocket.on("connect_error", (err) => { console.error("Bağlantı hatası:", err.message); setConnectionMessage(`Bağlantı hatası: ${err.message}`); setIsConnected(false); }); newSocket.on("disconnect", (reason) => { console.log("Bağlantı kesildi:", reason); setConnectionMessage('Bağlantı kesildi.'); setIsConnected(false); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); }); newSocket.on('error_message', (data) => { console.error("Sunucudan Hata:", data.message); alert(`Sunucu Hatası: ${data.message}`); }); newSocket.on('reset_game', (data) => { console.log("Oyun sıfırlandı:", data.message); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); }); newSocket.on('initial_state', (data) => { console.log('Başlangıç durumu alındı:', data); setGameState(data.gameState); setPlayers(data.players || []); const myPlayerData = data.players.find(p => p.id === newSocket.id); if (myPlayerData && data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setIsPlayerReady(myPlayerData.isReady); } else { setIsPlayerReady(false); } setAnnouncerLog([]); }); return () => { newSocket.disconnect(); }; }, []);

  // --- Turnuva Olay Dinleyicileri ---
  useEffect(() => { if (!socket) return; const handleStateUpdate = (data) => { console.log('Turnuva Durumu Güncellemesi:', data); setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) { setCurrentQuestion(null); } if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayerData = data.players.find(p => p.id === socket.id); setIsPlayerReady(myPlayerData ? myPlayerData.isReady : false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) { setIsPlayerReady(false); } if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING){ if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);} }; const handleNewQuestion = (questionData) => { console.log('Yeni Soru Geldi:', questionData); setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); }; const handleQuestionTimeout = (data) => { console.log(`Soru ${data.questionIndex + 1} için süre doldu.`); if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === socket?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleAnswerResult = (data) => { console.log('Cevap Sonucu:', data); if (currentQuestion && data.questionIndex === currentQuestion.index) { setLastAnswerResult(data); } }; const handleGameOver = (data) => { console.log('Oyun Bitti! Sonuçlar:', data.results); setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleWaitingUpdate = (data) => { console.log('Bekleme Güncellemesi:', data.message); if (gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(data.message); } }; const handleHighlight = (data) => { console.log('Highlight Geldi:', data.messages); setHighlightMessages(data.messages || []); setTimeout(() => { setHighlightMessages([]); }, 6000); }; const handleAnnouncerMessage = (newMessage) => { console.log(`[Announcer] ${newMessage.text}`); setAnnouncerLog(prevLog => [newMessage, ...prevLog].slice(0, MAX_LOG_MESSAGES) ); }; socket.on('tournament_state_update', handleStateUpdate); socket.on('new_question', handleNewQuestion); socket.on('question_timeout', handleQuestionTimeout); socket.on('answer_result', handleAnswerResult); socket.on('game_over', handleGameOver); socket.on('waiting_update', handleWaitingUpdate); socket.on('game_highlight', handleHighlight); socket.on('announcer_message', handleAnnouncerMessage); return () => { socket.off('tournament_state_update', handleStateUpdate); socket.off('new_question', handleNewQuestion); socket.off('question_timeout', handleQuestionTimeout); socket.off('answer_result', handleAnswerResult); socket.off('game_over', handleGameOver); socket.off('waiting_update', handleWaitingUpdate); socket.off('game_highlight', handleHighlight); socket.off('announcer_message', handleAnnouncerMessage); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; }, [socket, gameState, currentQuestion, players]);

  // --- Kullanıcı Eylemleri ---
  const handleJoinTournament = useCallback(() => { if (socket && isConnected && playerName.trim()) { console.log(`'${playerName}' ismiyle join_tournament gönderiliyor...`); socket.emit('join_tournament', { name: playerName.trim() }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); } else if (!playerName.trim()){ alert('Lütfen katılmak için bir isim girin.'); } else { console.log("Socket bağlı değil."); setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, playerName]);
  const handleAnswerSubmit = useCallback((answer) => { if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { console.log(`Cevap gönderiliyor: Soru ${currentQuestion.index + 1}, Cevap: ${answer}`); socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);
  const handlePlayerReady = useCallback(() => { if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) { console.log("'player_ready' olayı gönderiliyor..."); socket.emit('player_ready'); setIsPlayerReady(true); setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...'); } }, [socket, isConnected, gameState, isPlayerReady]);

  // --- Render Fonksiyonları (JSX) ---
  const PlayerList = () => (<div className="player-list"><h3>Oyuncular ({players.length})</h3><ol>{players.map((p, index) => (<li key={p.id} style={p.id === socket?.id ? { fontWeight: 'bold', color: 'dodgerblue' } : {}}><span className="rank">{index + 1}.</span> {p.name}: {p.score} puan {gameState === GAME_STATES.WAITING_TOURNAMENT ? (p.isReady ? '✅' : '⏳') : ''}</li>))}</ol></div>);
  const QuestionDisplay = () => { if (!currentQuestion) return null; const { index, total, text, options, answered, timedOut } = currentQuestion; const relevantResult = (lastAnswerResult && lastAnswerResult.questionIndex === index) ? lastAnswerResult : null; const showFeedback = !!relevantResult; return (<div className="question-display"><h3>Soru {index + 1} / {total} <span className="timer">(Kalan Süre: {timeRemaining}sn)</span></h3><p className="question-text">{text}</p><div className="options">{options.map((option, i) => (<button key={i} onClick={() => handleAnswerSubmit(option)} disabled={answered || timedOut} >{option}</button>))}</div> {showFeedback && (<p className={`answer-feedback ${relevantResult.correct ? 'correct' : (relevantResult.timeout ? 'timeout' : 'incorrect')}`}>{relevantResult.timeout ? 'Süre Doldu!' : (relevantResult.correct ? `Doğru! +${relevantResult.pointsAwarded || 0} Puan` : 'Yanlış!')}{(relevantResult.correct && relevantResult.combo > 1) ? ` (${relevantResult.combo}x Kombo! 🔥)` : ''}{relevantResult.comboBroken ? ' (Kombo Bozuldu!)' : ''}</p>)}</div> ); };
  const ResultsDisplay = () => { if (!gameResults) return null; return (<div className="results-display"><h2>Oyun Bitti! Sonuçlar:</h2><ol>{gameResults.map((result, i) => (<li key={result.id} style={result.id === socket?.id ? { fontWeight: 'bold' } : {}}>{i + 1}. {result.name} - {result.score} puan</li>))}</ol><p>{waitingMessage || 'Yeni oyun yakında başlayabilir...'}</p></div> ); };
  const HighlightsDisplay = () => { if (highlightMessages.length === 0 || (gameState !== GAME_STATES.WAITING_TOURNAMENT && gameState !== GAME_STATES.TOURNAMENT_RUNNING)) return null; return (<div className="highlights-area"><h4>Öne Çıkanlar</h4>{highlightMessages.map((msg, index) => (<p key={index}>✨ {msg} ✨</p>))}</div> ); };
  const AnnouncerLogDisplay = () => { if (gameState !== GAME_STATES.WAITING_TOURNAMENT && gameState !== GAME_STATES.TOURNAMENT_RUNNING) return null; return (<div className="announcer-log" ref={announcerLogRef}><h4>🎤 Sunucu</h4>{announcerLog.length === 0 && <p>Oyunla ilgili mesajlar burada görünecek...</p>}{announcerLog.map((log, index) => (<p key={`<span class="math-inline">\{log\.timestamp\}\-</span>{index}`} className={`log-message log-${log.type || 'info'}`}><span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.text}</p>))}</div> ); };


  // --- Ana Render (PlayerList Düzeltmesiyle) ---
  return (
    <div className="App">
      <h1>Asrın Oyunu - Turnuva Modu</h1>
      <p>Bağlantı: {connectionMessage} {isConnected ? `(ID: ${socket?.id})` : ''}</p>
      <hr />

       <div className="main-content">

            {/* IDLE veya Bağlı Değil: Katılma Ekranı */}
            {(!isConnected || gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) && ( <div className="join-section"><h3>Turnuvaya Katıl</h3><input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="İsminizi Girin" maxLength={20} disabled={!isConnected} /><button onClick={handleJoinTournament} disabled={!isConnected || !playerName.trim()}>Katıl</button><p>{gameState === GAME_STATES.IDLE ? (waitingMessage || 'Turnuvaya katılmak için isim girin.') : ''}</p></div>)}

            {/* WAITING: Bekleme Ekranı - PlayerList BURADAN KALDIRILDI */}
            {gameState === GAME_STATES.WAITING_TOURNAMENT && players.find(p=>p.id === socket?.id) && ( <div className="waiting-section"><h2>Oyuncular Bekleniyor...</h2>{/*<PlayerList />*/}{/* KALDIRILDI */} <button onClick={handlePlayerReady} disabled={isPlayerReady} className={`ready-button ${isPlayerReady ? 'ready' : ''}`}>{isPlayerReady ? 'Hazırsın!' : 'Hazırım'}</button><p>{waitingMessage}</p><HighlightsDisplay /></div>)}

            {/* RUNNING: Oyun Ekranı - PlayerList BURADAN KALDIRILDI */}
            {gameState === GAME_STATES.TOURNAMENT_RUNNING && ( <div className="game-running-section">{/*<PlayerList />*/}{/* KALDIRILDI */} <QuestionDisplay /><HighlightsDisplay /></div>)}

            {/* GAME_OVER: Sonuç Ekranı */}
            {gameState === GAME_STATES.GAME_OVER && ( <div className="game-over-section"><ResultsDisplay /></div>)}

       </div>

        {/* Kenar Paneli (Liderlik Tablosu ve Sunucu Logu) - PlayerList SADECE BURADA */}
        {(gameState === GAME_STATES.WAITING_TOURNAMENT || gameState === GAME_STATES.TOURNAMENT_RUNNING || gameState === GAME_STATES.GAME_OVER) && players.length > 0 && (
             <div className="sidebar">
                <PlayerList /> {/* SADECE BURADA KALDI */}
                <AnnouncerLogDisplay />
             </div>
         )}

    </div>
  );
}

export default App;
