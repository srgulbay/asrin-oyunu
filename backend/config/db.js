const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    pool.connect((err, client, release) => {
      if (err) {
          console.error('DB Bağlantı Hatası:', err.stack);
          pool = null; // Bağlantı hatası varsa pool'u null yap
          return;
      }
      client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            console.error('DB Test Sorgu Hatası:', err.stack);
            pool = null; // Sorgu hatası varsa pool'u null yap
            return;
        };
        console.log('Veritabanına Bağlandı:', result.rows[0].now);
      });
    });
} else {
     console.warn("UYARI: DATABASE_URL yok, DB bağlantısı kurulmadı.");
}


module.exports = { pool };