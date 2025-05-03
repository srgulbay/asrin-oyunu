import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_BACKEND_URL;
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };

function App() {
  // Socket & Bağlantı
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');

  // Oyun State'leri
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  // Oyuncular: {id, name, score, isReady}
  const [players, setPlayers] = useState([]);
  // Soru: {index, total, text, options, timeLimit, answered, timedOut}
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameResults, setGameResults] = useState(null);
  const [waitingMessage, setWaitingMessage] = useState('');
  // Cevap Sonucu: {correct, score, questionIndex, timeout}
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false); // Bu oyuncu hazır mı?

  const questionTimerIntervalRef = useRef(null);

  // --- Socket Bağlantısı ve Temel Olaylar ---
  useEffect(() => {
    if (!SERVER_URL) { /* ... Hata ... */ console.error("HATA: VITE_BACKEND_URL tanımlanmamış!"); setConnectionMessage('HATA: Backend adresi yapılandırılmamış!'); return; }
    console.log("Bağlanılacak Backend URL:", SERVER_URL);
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);
    newSocket.on("connect", () => { /* ... Bağlandı ... */ console.log("Socket.IO'ya bağlandı! ID:", newSocket.id); setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); });
    newSocket.on("connect_error", (err) => { /* ... Hata ... */ console.error("Bağlantı hatası:", err.message); setConnectionMessage(`Bağlantı hatası: ${err.message}`); setIsConnected(false); });
    newSocket.on("disconnect", (reason) => { /* ... Kesildi ... */ console.log("Bağlantı kesildi:", reason); setConnectionMessage('Bağlantı kesildi.'); setIsConnected(false); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); /* State'leri sıfırla */ });
    newSocket.on('error_message', (data) => { /* ... Hata ... */ console.error("Sunucudan Hata:", data.message); alert(`Sunucu Hatası: ${data.message}`); });
    newSocket.on('reset_game', (data) => { /* ... Reset ... */ console.log("Oyun sıfırlandı:", data.message); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); });
    // YENİ: Başlangıç durumunu al
    newSocket.on('initial_state', (data) => {
        console.log('Başlangıç durumu alındı:', data);
        setGameState(data.gameState);
        setPlayers(data.players || []);
        // Eğer bekleme durumundaysa ve oyuncu listedeyse, hazır durumunu al
        const myPlayerData = data.players.find(p => p.id === newSocket.id);
        if (myPlayerData && data.gameState === GAME_STATES.WAITING_TOURNAMENT) {
            setIsPlayerReady(myPlayerData.isReady);
        } else {
            setIsPlayerReady(false); // Diğer durumlarda hazır değil
        }
    });
    return () => { newSocket.disconnect(); };
  }, []);


  // --- Turnuva Olay Dinleyicileri ---
  useEffect(() => {
    if (!socket) return;
    const handleStateUpdate = (data) => { /* ... önceki kod ... */ console.log('Turnuva Durumu Güncellemesi:', data); setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) { setCurrentQuestion(null); } if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); /* Belki backend mesajı kullanılır? */ const myPlayerData = data.players.find(p => p.id === socket.id); setIsPlayerReady(myPlayerData ? myPlayerData.isReady : false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) { setIsPlayerReady(false); /* Oyun başlayınca hazır durumu kalkar */ } if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING){ if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);} };
    const handleNewQuestion = (questionData) => { /* ... önceki kod (timer dahil)... */ console.log('Yeni Soru Geldi:', questionData); setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); };
    const handleQuestionTimeout = (data) => { /* ... önceki kod ... */ console.log(`Soru ${data.questionIndex + 1} için süre doldu.`); if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleAnswerResult = (data) => { /* ... önceki kod ... */ console.log('Cevap Sonucu:', data); setLastAnswerResult(data); };
    const handleGameOver = (data) => { /* ... önceki kod ... */ console.log('Oyun Bitti! Sonuçlar:', data.results); setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleWaitingUpdate = (data) => { /* ... önceki kod ... */ console.log('Bekleme Güncellemesi:', data.message); if (gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(data.message); } };

    socket.on('tournament_state_update', handleStateUpdate);
    socket.on('new_question', handleNewQuestion);
    socket.on('question_timeout', handleQuestionTimeout);
    socket.on('answer_result', handleAnswerResult);
    socket.on('game_over', handleGameOver);
    socket.on('waiting_update', handleWaitingUpdate);

    return () => { /* ... dinleyicileri kaldır ... */ socket.off('tournament_state_update', handleStateUpdate); socket.off('new_question', handleNewQuestion); socket.off('question_timeout', handleQuestionTimeout); socket.off('answer_result', handleAnswerResult); socket.off('game_over', handleGameOver); socket.off('waiting_update', handleWaitingUpdate); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
  }, [socket, gameState, currentQuestion]);

  // --- Kullanıcı Eylemleri ---
  const handleJoinTournament = useCallback(() => { /* ... önceki kod ... */ if (socket && isConnected && playerName.trim()) { console.log(`'${playerName}' ismiyle join_tournament gönderiliyor...`); socket.emit('join_tournament', { name: playerName.trim() }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); /* Katılırken hazır değil */ } else if (!playerName.trim()){ alert('Lütfen katılmak için bir isim girin.'); } else { console.log("Socket bağlı değil."); setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, playerName]);
  const handleAnswerSubmit = useCallback((answer) => { /* ... önceki kod ... */ if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { console.log(`Cevap gönderiliyor: Soru ${currentQuestion.index + 1}, Cevap: ${answer}`); socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);

  // YENİ: Hazırım Butonu Eylemi
  const handlePlayerReady = useCallback(() => {
      if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) {
           console.log("'player_ready' olayı gönderiliyor...");
           socket.emit('player_ready');
           setIsPlayerReady(true); // Optimistic UI update
           setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...');
      }
  }, [socket, isConnected, gameState, isPlayerReady]);


  // --- Render Fonksiyonları (JSX) ---
  // PlayerList'e hazır durumu eklendi
  const PlayerList = () => (<div className="player-list"><h3>Oyuncular ({players.length})</h3><ul>{players.map(p => (<li key={p.id} style={p.id === socket?.id ? { fontWeight: 'bold' } : {}}>{p.name}: {p.score} puan {p.isReady ? '✅' : '⏳'}</li>))}</ul></div>);
  const QuestionDisplay = () => { /* ... önceki kod (timer gösterimi güncellendi)... */ if (!currentQuestion) return null; const { index, total, text, options, answered, timedOut } = currentQuestion; const showFeedback = lastAnswerResult && lastAnswerResult.questionIndex === index; return (<div className="question-display"><h3>Soru {index + 1} / {total} <span className="timer">(Kalan Süre: {timeRemaining}sn)</span></h3><p className="question-text">{text}</p><div className="options">{options.map((option, i) => (<button key={i} onClick={() => handleAnswerSubmit(option)} disabled={answered || timedOut} >{option}</button>))}</div> {showFeedback && (<p className={`answer-feedback ${lastAnswerResult.correct ? 'correct' : (lastAnswerResult.timeout ? 'timeout' : 'incorrect')}`}>{lastAnswerResult.timeout ? 'Süre Doldu!' : (lastAnswerResult.correct ? 'Doğru!' : 'Yanlış!')}</p>)}</div> ); };
  const ResultsDisplay = () => { /* ... önceki kod ... */ if (!gameResults) return null; return (<div className="results-display"><h2>Oyun Bitti! Sonuçlar:</h2><ol>{gameResults.map((result, i) => (<li key={result.id} style={result.id === socket?.id ? { fontWeight: 'bold' } : {}}>{i + 1}. {result.name} - {result.score} puan</li>))}</ol><p>{waitingMessage || 'Yeni oyun yakında başlayabilir...'}</p></div> ); };


  // Ana Render
  return (
    <div className="App">
      <h1>Asrın Oyunu - Turnuva Modu</h1>
      <p>Bağlantı: {connectionMessage} {isConnected ? `(ID: ${socket?.id})` : ''}</p>
      <hr />

      {/* IDLE veya Bağlı Değil: Katılma Ekranı */}
      {(!isConnected || gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) && (
          <div className="join-section">
              <h3>Turnuvaya Katıl</h3>
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="İsminizi Girin" maxLength={20} disabled={!isConnected} />
              <button onClick={handleJoinTournament} disabled={!isConnected || !playerName.trim()}>Katıl</button>
              <p>{waitingMessage}</p>
          </div>
      )}

      {/* WAITING: Bekleme Ekranı, Oyuncu Listesi ve Hazırım Butonu */}
      {gameState === GAME_STATES.WAITING_TOURNAMENT && players.find(p=>p.id === socket?.id) && (
          <div className="waiting-section">
              <h2>Oyuncular Bekleniyor...</h2>
              <PlayerList />
              <button onClick={handlePlayerReady} disabled={isPlayerReady}>
                  {isPlayerReady ? 'Hazırsın!' : 'Hazırım'}
              </button>
               <p>{waitingMessage}</p>
          </div>
      )}

      {/* RUNNING: Oyun Ekranı */}
      {gameState === GAME_STATES.TOURNAMENT_RUNNING && (
          <div className="game-running-section">
              <PlayerList />
              <QuestionDisplay />
          </div>
      )}

      {/* GAME_OVER: Sonuç Ekranı */}
      {gameState === GAME_STATES.GAME_OVER && (
          <div className="game-over-section">
              <ResultsDisplay />
              {/* Belki IDLE'a dönmek için buton */}
               <button onClick={() => { setGameState(GAME_STATES.IDLE); setWaitingMessage('Yeni oyun bekleniyor.'); setIsPlayerReady(false); /* Manuel reset? */ }}>
                   Ana Ekrana Dön
               </button>
          </div>
      )}
    </div>
  );
}

export default App;
