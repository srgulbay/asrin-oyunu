const express = require('express');
const { pool } = require('../config/db'); // DB pool'u import et
const { authAdmin, dbAdmin, isAdminSDKInitialized } = require('../config/firebaseAdmin'); // Firebase Admin'i import et

const adminRouter = express.Router();

const checkAdminAuth = async (req, res, next) => {
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
        req.user = decodedToken;
        req.userData = userData;
        next();
    } catch (error) {
        console.error('[Admin Auth] Token doğrulama hatası:', error.message);
        return res.status(401).send({ error: 'Yetkilendirme başarısız: Geçersiz token.' });
    }
};

adminRouter.get('/questions', checkAdminAuth, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        const totalResult = await pool.query('SELECT COUNT(*) FROM questions');
        const totalItems = parseInt(totalResult.rows[0].count, 10);
        const query = 'SELECT * FROM questions ORDER BY id DESC LIMIT $1 OFFSET $2';
        const result = await pool.query(query, [limit, offset]);
        res.status(200).send({
            questions: result.rows,
            pagination: { currentPage: page, limit: limit, totalItems: totalItems, totalPages: Math.ceil(totalItems / limit) }
        });
    } catch (error) {
        console.error('API Soru Listeleme Hatası:', error);
        res.status(500).send({ error: 'Sorular listelenirken bir hata oluştu.' });
    }
});

adminRouter.post('/questions', checkAdminAuth, async (req, res) => {
    const { question_text, options, correct_answer, grade, branch } = req.body;
    if (!question_text || !options || !correct_answer || !grade || !branch) { return res.status(400).send({ error: 'Eksik alanlar var.' }); }
    if (!Array.isArray(options) || options.length < 2) { return res.status(400).send({ error: 'Seçenekler en az 2 elemanlı dizi olmalı.' }); }
    if (!options.includes(correct_answer)) { return res.status(400).send({ error: 'Doğru cevap seçeneklerde olmalı.' }); }
    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        const query = `INSERT INTO questions (question_text, options, correct_answer, grade, branch) VALUES ($1, $2, $3, $4, $5) RETURNING *;`;
        const optionsValue = options;
        const result = await pool.query(query, [ question_text, optionsValue, correct_answer, grade, branch ]);
        console.log("[Admin API] Yeni soru eklendi:", result.rows[0]);
        res.status(201).send(result.rows[0]);
    } catch (error) {
        console.error('API Yeni Soru Ekleme Hatası:', error);
        res.status(500).send({ error: 'Soru eklenirken sunucu hatası oluştu.' });
    }
});

adminRouter.get('/questions/:id', checkAdminAuth, async (req, res) => {
    const { id } = req.params;
    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        const query = 'SELECT * FROM questions WHERE id = $1';
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) { return res.status(404).send({ error: 'Soru bulunamadı.' }); }
        res.status(200).send(result.rows[0]);
    } catch (error) { console.error(`API Soru Getirme Hatası (ID: ${id}):`, error); res.status(500).send({ error: 'Soru getirilirken bir hata oluştu.' }); }
});

adminRouter.put('/questions/:id', checkAdminAuth, async (req, res) => {
    const { id } = req.params;
    const { question_text, options, correct_answer, grade, branch } = req.body;
    if (!question_text || !options || !correct_answer || !grade || !branch) { return res.status(400).send({ error: 'Eksik alanlar var.' }); }
    if (!Array.isArray(options) || options.length < 2) { return res.status(400).send({ error: 'Seçenekler en az 2 elemanlı dizi olmalı.' }); }
    if (!options.includes(correct_answer)) { return res.status(400).send({ error: 'Doğru cevap seçeneklerde olmalı.' }); }
    if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
    try {
        const query = `UPDATE questions SET question_text = $1, options = $2, correct_answer = $3, grade = $4, branch = $5 WHERE id = $6 RETURNING *;`;
        const optionsValue = options;
        const result = await pool.query(query, [ question_text, optionsValue, correct_answer, grade, branch, id ]);
        if (result.rows.length === 0) { return res.status(404).send({ error: 'Güncellenecek soru bulunamadı.' }); }
        console.log(`[Admin API] Soru güncellendi (ID: ${id}):`, result.rows[0]);
        res.status(200).send(result.rows[0]);
    } catch (error) { console.error(`API Soru Güncelleme Hatası (ID: ${id}):`, error); res.status(500).send({ error: 'Soru güncellenirken bir sunucu hatası oluştu.' }); }
});

adminRouter.delete('/questions/:id', checkAdminAuth, async (req, res) => {
     const { id } = req.params;
     if (!pool) { return res.status(500).send({ error: 'Veritabanı bağlantısı yok.' }); }
     try {
         const query = 'DELETE FROM questions WHERE id = $1 RETURNING id;';
         const result = await pool.query(query, [id]);
         if (result.rowCount === 0) { return res.status(404).send({ error: 'Silinecek soru bulunamadı.' }); }
         console.log(`[Admin API] Soru silindi (ID: ${id})`);
         res.status(200).send({ message: `Soru (ID: ${id}) başarıyla silindi.` });
     } catch (error) { console.error(`API Soru Silme Hatası (ID: ${id}):`, error); res.status(500).send({ error: 'Soru silinirken bir sunucu hatası oluştu.' }); }
 });


module.exports = adminRouter; // Router'ı export et