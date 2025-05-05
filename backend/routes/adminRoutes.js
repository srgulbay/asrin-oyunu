const express = require('express');
const { pool } = require('../config/db');
const { authAdmin, dbAdmin, isAdminSDKInitialized } = require('../config/firebaseAdmin');

const adminRouter = express.Router();

// --- checkAdminAuth Middleware (önceki kod) ---
const checkAdminAuth = async (req, res, next) => { /* ... önceki kod ... */
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) { return res.status(401).send({ error: 'Yetkilendirme başarısız: Token bulunamadı.' }); }
    if (!isAdminSDKInitialized || !authAdmin) { console.error("[Admin Auth] Firebase Admin SDK başlatılmamış."); return res.status(500).send({ error: 'Sunucu yapılandırma hatası.' }); }
    try {
        const decodedToken = await authAdmin.verifyIdToken(idToken);
        const userDoc = await dbAdmin.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) { console.warn(`[Admin Auth] Firestore'da kullanıcı bulunamadı: ${decodedToken.uid}`); return res.status(403).send({ error: 'Yetkilendirme başarısız: Kullanıcı bulunamadı.' }); }
        const userData = userDoc.data();
        const isAdmin = userData.roles?.includes('admin');
        if (!isAdmin) { console.warn(`[Admin Auth] Yetkisiz erişim denemesi (admin değil): ${decodedToken.email || decodedToken.uid}`); return res.status(403).send({ error: 'Yetkilendirme başarısız: Admin yetkisi gerekli.' }); }
        req.user = decodedToken; req.userData = userData; next();
    } catch (error) { console.error('[Admin Auth] Token doğrulama hatası:', error.message); return res.status(401).send({ error: 'Yetkilendirme başarısız: Geçersiz token.' }); }
};
// -------------------------------------------


// --- Soru Rotaları (önceki kod) ---
adminRouter.get('/questions', checkAdminAuth, async (req, res) => { /* ... önceki kod ... */ });
adminRouter.post('/questions', checkAdminAuth, async (req, res) => { /* ... önceki kod ... */ });
adminRouter.get('/questions/:id', checkAdminAuth, async (req, res) => { /* ... önceki kod ... */ });
adminRouter.put('/questions/:id', checkAdminAuth, async (req, res) => { /* ... önceki kod ... */ });
adminRouter.delete('/questions/:id', checkAdminAuth, async (req, res) => { /* ... önceki kod ... */ });
// ------------------------------------


// --- YENİ: Turnuva Rotaları ---

// GET /api/admin/tournaments - Turnuvaları Listele
adminRouter.get('/tournaments', checkAdminAuth, async (req, res) => {
    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        // TODO: Sayfalama eklenebilir
        const result = await pool.query('SELECT * FROM tournaments ORDER BY created_at DESC');
        res.status(200).send(result.rows);
    } catch (error) {
        console.error('API Turnuva Listeleme Hatası:', error);
        res.status(500).send({ error: 'Turnuvalar listelenirken bir hata oluştu.' });
    }
});

// POST /api/admin/tournaments - Yeni Turnuva Oluştur
adminRouter.post('/tournaments', checkAdminAuth, async (req, res) => {
    const { name, description = null, status = 'draft', allowed_grades = null } = req.body;
    if (!name) { return res.status(400).send({ error: 'Turnuva adı zorunludur.' }); }
    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        const query = `INSERT INTO tournaments (name, description, status, allowed_grades) VALUES ($1, $2, $3, $4) RETURNING *;`;
        // allowed_grades'in null veya dizi olduğundan emin ol
        const gradesValue = Array.isArray(allowed_grades) ? allowed_grades : null;
        const result = await pool.query(query, [name, description, status, gradesValue]);
        console.log("[Admin API] Yeni turnuva oluşturuldu:", result.rows[0]);
        res.status(201).send(result.rows[0]);
    } catch (error) {
        console.error('API Yeni Turnuva Oluşturma Hatası:', error);
        res.status(500).send({ error: 'Turnuva oluşturulurken bir sunucu hatası oluştu.' });
    }
});

// GET /api/admin/tournaments/:id - Tek Turnuva Detayı (Sorularıyla Birlikte)
adminRouter.get('/tournaments/:id', checkAdminAuth, async (req, res) => {
     const { id } = req.params;
     if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
     try {
         const tournamentResult = await pool.query('SELECT * FROM tournaments WHERE tournament_id = $1', [id]);
         if (tournamentResult.rows.length === 0) {
             return res.status(404).send({ error: 'Turnuva bulunamadı.' });
         }
         const tournament = tournamentResult.rows[0];

         // Turnuvaya bağlı soruları çek
         const questionsResult = await pool.query(
            `SELECT q.* FROM questions q JOIN tournament_questions tq ON q.id = tq.question_id WHERE tq.tournament_id = $1 ORDER BY q.id ASC`, // Veya tq.order'a göre sırala
             [id]
         );
         tournament.questions = questionsResult.rows; // Soruları turnuva objesine ekle

         res.status(200).send(tournament);
     } catch (error) {
         console.error(`API Turnuva Detay Hatası (ID: ${id}):`, error);
         res.status(500).send({ error: 'Turnuva detayları getirilirken bir hata oluştu.' });
     }
 });

// PUT /api/admin/tournaments/:id - Turnuva Bilgilerini Güncelle (Sorular hariç)
adminRouter.put('/tournaments/:id', checkAdminAuth, async (req, res) => {
    const { id } = req.params;
    const { name, description, status, allowed_grades } = req.body;
    if (!name || !status) { return res.status(400).send({ error: 'Turnuva adı ve durumu zorunludur.' }); }
    // Status değerini kontrol et (opsiyonel)
     if (!['draft', 'active', 'archived'].includes(status)) { return res.status(400).send({ error: 'Geçersiz durum değeri.' }); }
     // Eğer 'active' yapılıyorsa, diğer tüm turnuvaları 'archived' yap (opsiyonel kural)
     if (status === 'active') {
          console.log(`Turnuva ${id} aktif ediliyor, diğerleri arşivleniyor...`);
          try { await pool.query('UPDATE tournaments SET status = $1 WHERE status = $2 AND tournament_id != $3', ['archived', 'active', id]); }
          catch(e){ console.error("Diğer aktif turnuvaları arşivleme hatası:", e); /* devam et */ }
      }

    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        const query = `UPDATE tournaments SET name = $1, description = $2, status = $3, allowed_grades = $4, updated_at = NOW() WHERE tournament_id = $5 RETURNING *;`;
        const gradesValue = Array.isArray(allowed_grades) ? allowed_grades : null;
        const result = await pool.query(query, [name, description, status, gradesValue, id]);
        if (result.rows.length === 0) { return res.status(404).send({ error: 'Güncellenecek turnuva bulunamadı.' }); }
        console.log(`[Admin API] Turnuva güncellendi (ID: ${id}):`, result.rows[0]);
        res.status(200).send(result.rows[0]);
    } catch (error) {
        console.error(`API Turnuva Güncelleme Hatası (ID: ${id}):`, error);
        res.status(500).send({ error: 'Turnuva güncellenirken bir sunucu hatası oluştu.' });
    }
});

// POST /api/admin/tournaments/:id/questions - Turnuvaya Soru Ekle
adminRouter.post('/tournaments/:id/questions', checkAdminAuth, async (req, res) => {
    const { id: tournamentId } = req.params;
    const { question_id } = req.body; // Eklenecek sorunun ID'si
    if (!question_id) { return res.status(400).send({ error: 'question_id gereklidir.' }); }
    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        // TODO: question_id'nin geçerli bir soru olup olmadığını kontrol et
        const query = `INSERT INTO tournament_questions (tournament_id, question_id) VALUES ($1, $2) RETURNING *;`;
        const result = await pool.query(query, [tournamentId, question_id]);
        console.log(`[Admin API] Turnuva ${tournamentId}'e soru ${question_id} eklendi.`);
        res.status(201).send(result.rows[0]);
    } catch (error) {
        // Unique constraint hatası (zaten ekliyse)
        if (error.code === '23505') { return res.status(409).send({ error: 'Bu soru zaten turnuvada mevcut.'}); }
        console.error(`API Turnuvaya Soru Ekleme Hatası (TID: ${tournamentId}, QID: ${question_id}):`, error);
        res.status(500).send({ error: 'Turnuvaya soru eklenirken bir hata oluştu.' });
    }
});

// DELETE /api/admin/tournaments/:id/questions/:questionId - Turnuvadan Soru Sil
adminRouter.delete('/tournaments/:id/questions/:questionId', checkAdminAuth, async (req, res) => {
     const { id: tournamentId, questionId } = req.params;
     if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
     try {
         const query = 'DELETE FROM tournament_questions WHERE tournament_id = $1 AND question_id = $2 RETURNING id;';
         const result = await pool.query(query, [tournamentId, questionId]);
         if (result.rowCount === 0) {
             return res.status(404).send({ error: 'Turnuvada silinecek belirtilen soru bulunamadı.' });
         }
         console.log(`[Admin API] Turnuva ${tournamentId}'den soru ${questionId} silindi.`);
         res.status(200).send({ message: `Soru başarıyla turnuvadan kaldırıldı.` });
     } catch (error) {
         console.error(`API Turnuvadan Soru Silme Hatası (TID: ${tournamentId}, QID: ${questionId}):`, error);
         res.status(500).send({ error: 'Turnuvadan soru silinirken bir sunucu hatası oluştu.' });
     }
 });

module.exports = adminRouter;