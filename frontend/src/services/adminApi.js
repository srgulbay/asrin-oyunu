import { auth } from '../firebaseConfig';

const API_BASE_URL = '/api/admin';

const getAuthHeader = async () => {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('Kullanıcı girişi yapılmamış.');
    }
    try {
        const token = await user.getIdToken();
        return { Authorization: `Bearer ${token}` };
    } catch (error) {
        console.error("Token alınırken hata:", error);
        throw new Error('Kimlik doğrulama tokenı alınamadı.');
    }
};

export const getQuestions = async (page = 1, limit = 10) => {
    console.log(`>>> API CALL: getQuestions (page: ${page}, limit: ${limit})`);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/questions?page=${page}&limit=${limit}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
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