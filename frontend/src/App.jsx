import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'; // Genel stiller burada kalabilir
import { io } from "socket.io-client";

// Componentleri import et
import JoinScreen from './components/JoinScreen';
import WaitingLobby from './components/WaitingLobby';
import GameInterface from './components/GameInterface';
import ResultsScreen from './components/ResultsScreen';
import PlayerList from './components/PlayerList';
import AnnouncerLog from './components/AnnouncerLog';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL;
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const MAX_LOG_MESSAGES = 15;

function App() {
  // === State Hookları ===
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameResults, setGameResults] = useState(null);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [announcerLog, setAnnouncerLog] = useState([]);

  const questionTimerIntervalRef = useRef(null);

  // === Socket Bağlantısı ve Olayları ===
  useEffect(() => {
    if (!SERVER_URL) { console.error("HATA: VITE_BACKEND_URL tanımlanmamış!"); setConnectionMessage('HATA: Backend adresi yapılandırılmamış!'); return; }
    console.log("Bağlanılacak Backend URL:", SERVER_URL);
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    // --- Bağlantı Olayları ---
    newSocket.on("connect", () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log("Socket ID:", newSocket.id);});
    newSocket.on("connect_error", (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); });
    newSocket.on("disconnect", (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); setGameState(GAME_STATES.IDLE); /* Diğer state resetleri */ setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); });
    newSocket.on('error_message', (data) => { alert(`Sunucu Hatası: ${data.message}`); });
    newSocket.on('reset_game', (data) => { setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); });
    newSocket.on('initial_state', (data) => { setGameState(data.gameState); setPlayers(data.players || []); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); setAnnouncerLog([]); });

    // --- Turnuva Olayları ---
    const handleStateUpdate = (data) => { setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) setCurrentQuestion(null); if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) setIsPlayerReady(false); if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING) if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleNewQuestion = (questionData) => { setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); };
    const handleQuestionTimeout = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === newSocket?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleAnswerResult = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) setLastAnswerResult(data); };
    const handleGameOver = (data) => { setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleWaitingUpdate = (data) => { if (gameState === GAME_STATES.WAITING_TOURNAMENT) setWaitingMessage(data.message); };
    const handleAnnouncerMessage = (newMessage) => { setAnnouncerLog(prevLog => [newMessage, ...prevLog].slice(0, MAX_LOG_MESSAGES)); };

    // Dinleyicileri Ekle
    newSocket.on('tournament_state_update', handleStateUpdate);
    newSocket.on('new_question', handleNewQuestion);
    newSocket.on('question_timeout', handleQuestionTimeout);
    newSocket.on('answer_result', handleAnswerResult);
    newSocket.on('game_over', handleGameOver);
    newSocket.on('waiting_update', handleWaitingUpdate);
    newSocket.on('announcer_message', handleAnnouncerMessage);

    // Temizlik Fonksiyonu
    return () => {
      newSocket.off('tournament_state_update', handleStateUpdate);
      newSocket.off('new_question', handleNewQuestion);
      newSocket.off('question_timeout', handleQuestionTimeout);
      newSocket.off('answer_result', handleAnswerResult);
      newSocket.off('game_over', handleGameOver);
      newSocket.off('waiting_update', handleWaitingUpdate);
      newSocket.off('announcer_message', handleAnnouncerMessage);
      if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
      newSocket.disconnect();
    };
  }, []); // Sadece component mount olduğunda çalışır

  // === Kullanıcı Eylemleri (Callback Hookları) ===
  const handleJoinTournament = useCallback(() => { if (socket && isConnected && playerName.trim()) { socket.emit('join_tournament', { name: playerName.trim() }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); } else if (!playerName.trim()){ alert('Lütfen katılmak için bir isim girin.'); } else { setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, playerName]);
  const handleAnswerSubmit = useCallback((answer) => { if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);
  const handlePlayerReady = useCallback(() => { if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) { socket.emit('player_ready'); setIsPlayerReady(true); setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...'); } }, [socket, isConnected, gameState, isPlayerReady]);

  // === Render Edilecek Component'i Belirleme ===
  const renderCurrentScreen = () => {
      // Oyuncu bağlı değilse veya IDLE durumundaysa ve henüz oyuncu listesinde yoksa Katılma Ekranı
       if (!isConnected || gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) {
         return <JoinScreen
                    playerName={playerName}
                    setPlayerName={setPlayerName}
                    handleJoinTournament={handleJoinTournament}
                    isConnected={isConnected}
                    waitingMessage={waitingMessage}
                />;
       }
       // Bekleme durumundaysa ve oyuncu listedeyse Bekleme Lobisi
       if (gameState === GAME_STATES.WAITING_TOURNAMENT && players.find(p=>p.id === socket?.id)) {
            return <WaitingLobby
                        players={players} // PlayerList sidebar'da olacak ama belki lobbye de lazım olur?
                        handlePlayerReady={handlePlayerReady}
                        isPlayerReady={isPlayerReady}
                        waitingMessage={waitingMessage}
                        currentSocketId={socket?.id}
                    />;
        }
        // Oyun चल रहा हैsa Oyun Arayüzü
        if (gameState === GAME_STATES.TOURNAMENT_RUNNING) {
             return <GameInterface
                         currentQuestion={currentQuestion}
                         timeRemaining={timeRemaining}
                         handleAnswerSubmit={handleAnswerSubmit}
                         lastAnswerResult={lastAnswerResult}
                     />;
         }
         // Oyun bittiyse Sonuç Ekranı
         if (gameState === GAME_STATES.GAME_OVER) {
             return <ResultsScreen
                         gameResults={gameResults}
                         waitingMessage={waitingMessage}
                         currentSocketId={socket?.id}
                     />;
         }
         // Varsayılan olarak null veya bir yükleniyor ekranı döndür
         return <p>Yükleniyor...</p>;
  };

  // === Ana Render ===
  return (
    <div className="App"> {/* Ana layout için class */}
      <h1>Asrın Oyunu - Turnuva Modu</h1>
      <p>Bağlantı: {connectionMessage} {isConnected ? `(ID: ${socket?.id})` : ''}</p>
      <hr />

       <div className="layout-container"> {/* Flex veya Grid için kapsayıcı */}
            {/* Ana İçerik Alanı */}
            <div className="main-content">
                {renderCurrentScreen()}
            </div>

            {/* Kenar Paneli (Oyun başladığında veya bittiğinde göster) */}
            {(gameState === GAME_STATES.WAITING_TOURNAMENT || gameState === GAME_STATES.TOURNAMENT_RUNNING || gameState === GAME_STATES.GAME_OVER) && players.length > 0 && (
                 <div className="sidebar">
                    <PlayerList players={players} gameState={gameState} currentSocketId={socket?.id} />
                    <AnnouncerLog announcerLog={announcerLog} />
                 </div>
             )}
        </div>
    </div>
  );
}

export default App;
