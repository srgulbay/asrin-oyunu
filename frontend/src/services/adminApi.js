import { auth } from '../firebaseConfig';

// --- GÜNCELLEME: Backend URL'sini .env'den al ---
const API_BASE_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000') + '/api/admin';
// ---------------------------------------------

const getAuthHeader = async () => {
    const user = auth.currentUser;
    if (!user) { throw new Error('Kullanıcı girişi yapılmamış.'); }
    try {
        const token = await user.getIdToken();
        return { Authorization: `Bearer ${token}` };
    } catch (error) {
        console.error("Token alınırken hata:", error);
        throw new Error('Kimlik doğrulama tokenı alınamadı.');
    }
};

export const getQuestions = async (page = 1, limit = 10) => {
    console.log(`>>> API CALL: getQuestions (page: ${page}, limit: ${limit}) URL: ${API_BASE_URL}/questions`); // URL'yi logla
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/questions?page=${page}&limit=${limit}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', ...headers, },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Bilinmeyen sunucu hatası' }));
            console.error(`API Hatası (${response.status}):`, errorData);
            throw new Error(errorData.error || `HTTP Hata Kodu: ${response.status}`);
        }
        const data = await response.json();
        console.log(">>> API RESPONSE: getQuestions:", data);
        return data;
    } catch (error) {
        console.error('getQuestions API çağrısı başarısız:', error);
        throw new Error(error.message || 'Sorular alınırken bir hata oluştu.');
    }
};

export const addQuestion = async (questionData) => {
    console.log(">>> API CALL: addQuestion", questionData);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers, },
            body: JSON.stringify(questionData),
        });
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ error: 'Bilinmeyen sunucu hatası' }));
             console.error(`API Hatası (${response.status}):`, errorData);
             throw new Error(errorData.error || `HTTP Hata Kodu: ${response.status}`);
        }
        const newQuestion = await response.json();
        console.log(">>> API RESPONSE: addQuestion:", newQuestion);
        return newQuestion;
    } catch (error) {
         console.error('addQuestion API çağrısı başarısız:', error);
         throw new Error(error.message || 'Soru eklenirken bir hata oluştu.');
    }
};