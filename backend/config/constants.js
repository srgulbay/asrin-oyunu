const GAME_MODES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const TOURNAMENT_ROOM = 'global_tournament_room';
const MIN_PLAYERS_TO_INFORM = 1;
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

module.exports = {
    GAME_MODES,
    TOURNAMENT_ROOM,
    MIN_PLAYERS_TO_INFORM,
    QUESTION_TIME_LIMIT,
    BASE_SCORE,
    MAX_TIME_BONUS,
    COMBO_BONUS_MULTIPLIER,
    MAX_COMBO_BONUS,
    GRADE_DIFFICULTY_FACTOR,
    MAX_DIFFICULTY_BONUS_MULTIPLIER,
    MIN_DIFFICULTY_PENALTY_MULTIPLIER,
    SIGNIFICANT_GRADE_DIFFERENCE,
    XP_PER_CORRECT_ANSWER,
    BRANCH_RESOURCE_MAP,
    DEFAULT_RESOURCES
};