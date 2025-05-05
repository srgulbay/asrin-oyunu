import { auth } from '../firebaseConfig';

const API_BASE_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000') + '/api/admin';
console.log(">>> adminApi.js: Oluşturulan API_BASE_URL:", API_BASE_URL);

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

const handleResponse = async (response) => {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Sunucu hatası: ${response.statusText}` }));
        console.error(`API Hatası (${response.status}):`, errorData);
        throw new Error(errorData.error || `HTTP Hata Kodu: ${response.status}`);
    }
    return response.json();
};

// --- Question API Functions ---

export const getQuestions = async (page = 1, limit = 10) => {
    console.log(`>>> API CALL: getQuestions (page: ${page}, limit: ${limit})`);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/questions?page=${page}&limit=${limit}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', ...headers },
        });
        const data = await handleResponse(response);
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
        const newQuestion = await handleResponse(response);
        console.log(">>> API RESPONSE: addQuestion:", newQuestion);
        return newQuestion;
    } catch (error) {
         console.error('addQuestion API çağrısı başarısız:', error);
         throw new Error(error.message || 'Soru eklenirken bir hata oluştu.');
    }
};

export const getQuestionById = async (id) => {
    console.log(`>>> API CALL: getQuestionById (ID: ${id})`);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/questions/${id}`, {
            method: 'GET',
            headers: { ...headers },
        });
        const data = await handleResponse(response);
        console.log(">>> API RESPONSE: getQuestionById:", data);
        return data;
    } catch (error) {
        console.error('getQuestionById API çağrısı başarısız:', error);
        throw new Error(error.message || 'Soru detayları alınırken bir hata oluştu.');
    }
};

export const updateQuestion = async (id, questionData) => {
    console.log(`>>> API CALL: updateQuestion (ID: ${id})`, questionData);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/questions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...headers, },
            body: JSON.stringify(questionData),
        });
        const updatedQuestion = await handleResponse(response);
        console.log(">>> API RESPONSE: updateQuestion:", updatedQuestion);
        return updatedQuestion;
    } catch (error) {
         console.error('updateQuestion API çağrısı başarısız:', error);
         throw new Error(error.message || 'Soru güncellenirken bir hata oluştu.');
    }
};

export const deleteQuestion = async (id) => {
    console.log(`>>> API CALL: deleteQuestion (ID: ${id})`);
     try {
         const headers = await getAuthHeader();
         const response = await fetch(`${API_BASE_URL}/questions/${id}`, {
             method: 'DELETE',
             headers: { ...headers },
         });
         // DELETE genellikle 200 veya 204 döndürür, body olmayabilir
         if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: `Sunucu hatası: ${response.statusText}` }));
              console.error(`API Hatası (${response.status}):`, errorData);
              throw new Error(errorData.error || `HTTP Hata Kodu: ${response.status}`);
         }
         const data = await response.json().catch(() => ({})); // Body boş olabilir
         console.log(">>> API RESPONSE: deleteQuestion:", data);
         return data;
     } catch (error) {
          console.error('deleteQuestion API çağrısı başarısız:', error);
          throw new Error(error.message || 'Soru silinirken bir hata oluştu.');
     }
 };

// --- Tournament API Functions ---

export const getTournaments = async () => {
    console.log(`>>> API CALL: getTournaments`);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/tournaments`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', ...headers },
        });
        const data = await handleResponse(response);
        console.log(">>> API RESPONSE: getTournaments:", data);
        return data; // Array of tournaments
    } catch (error) {
        console.error('getTournaments API çağrısı başarısız:', error);
        throw new Error(error.message || 'Turnuvalar alınırken bir hata oluştu.');
    }
};

export const addTournament = async (tournamentData) => {
    console.log(">>> API CALL: addTournament", tournamentData);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/tournaments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(tournamentData),
        });
        const newTournament = await handleResponse(response);
        console.log(">>> API RESPONSE: addTournament:", newTournament);
        return newTournament;
    } catch (error) {
        console.error('addTournament API çağrısı başarısız:', error);
        throw new Error(error.message || 'Turnuva eklenirken bir hata oluştu.');
    }
};

export const getTournamentById = async (id) => {
    console.log(`>>> API CALL: getTournamentById (ID: ${id})`);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/tournaments/${id}`, {
            method: 'GET',
            headers: { ...headers },
        });
        const data = await handleResponse(response);
        console.log(">>> API RESPONSE: getTournamentById:", data);
        return data; // Tournament object with questions array
    } catch (error) {
        console.error('getTournamentById API çağrısı başarısız:', error);
        throw new Error(error.message || 'Turnuva detayları alınırken bir hata oluştu.');
    }
};

export const updateTournament = async (id, tournamentData) => {
    console.log(`>>> API CALL: updateTournament (ID: ${id})`, tournamentData);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/tournaments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(tournamentData),
        });
        const updatedTournament = await handleResponse(response);
        console.log(">>> API RESPONSE: updateTournament:", updatedTournament);
        return updatedTournament;
    } catch (error) {
        console.error('updateTournament API çağrısı başarısız:', error);
        throw new Error(error.message || 'Turnuva güncellenirken bir hata oluştu.');
    }
};

export const addQuestionToTournament = async (tournamentId, questionId) => {
    console.log(`>>> API CALL: addQuestionToTournament (TID: ${tournamentId}, QID: ${questionId})`);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/tournaments/${tournamentId}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ question_id: questionId }),
        });
        const data = await handleResponse(response); // Returns the added relation
        console.log(">>> API RESPONSE: addQuestionToTournament:", data);
        return data;
    } catch (error) {
        console.error('addQuestionToTournament API çağrısı başarısız:', error);
        throw new Error(error.message || 'Turnuvaya soru eklenirken bir hata oluştu.');
    }
};

export const removeQuestionFromTournament = async (tournamentId, questionId) => {
    console.log(`>>> API CALL: removeQuestionFromTournament (TID: ${tournamentId}, QID: ${questionId})`);
    try {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_BASE_URL}/tournaments/${tournamentId}/questions/${questionId}`, {
            method: 'DELETE',
            headers: { ...headers },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Sunucu hatası: ${response.statusText}` }));
            console.error(`API Hatası (${response.status}):`, errorData);
            throw new Error(errorData.error || `HTTP Hata Kodu: ${response.status}`);
        }
        const data = await response.json().catch(() => ({}));
        console.log(">>> API RESPONSE: removeQuestionFromTournament:", data);
        return data;
    } catch (error) {
        console.error('removeQuestionFromTournament API çağrısı başarısız:', error);
        throw new Error(error.message || 'Turnuvadan soru silinirken bir hata oluştu.');
    }
};