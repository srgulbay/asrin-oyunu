// terminal_test.js
const { io } = require("socket.io-client");

// --- Yapılandırma ---
const SERVER_URL = "https://asrin-oyunu-production.up.railway.app"; // Railway URL'si
const TEST_USER = {
    // ===> GÜNCELLENDİ: Gerçek UID eklendi <===
    uid: "aXy8U4ilqYPz5qR74M1kZVLli482", // i@i.com kullanıcısının UID'si
    name: "Terminal Test (i@i.com)", // İsmi de güncelleyelim
    grade: "7" // Örnek sınıf (eğer bu kullanıcının sınıfı farklıysa değiştirebilirsin)
};
// -------------------

console.log(`Bağlanılıyor: ${SERVER_URL}...`);
const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling']
});

let isConnected = false;

socket.on("connect", () => {
    isConnected = true;
    console.log(`✅ BAĞLANDI! Socket ID: ${socket.id}`);
    console.log(`\n--- 'join_tournament' gönderiliyor ---`);
    const payload = { name: TEST_USER.name, grade: TEST_USER.grade, uid: TEST_USER.uid };
    console.log(`Gönderilen Veri:`, payload);

    socket.emit("join_tournament", payload);

    console.log("--- Sunucu yanıtı bekleniyor... ---");
});

socket.on("connect_error", (err) => {
    console.error(`❌ BAĞLANTI HATASI: ${err.message}`);
});

socket.on("disconnect", (reason) => {
    isConnected = false;
    console.log(`🔌 BAĞLANTI KESİLDİ: ${reason}`);
});

socket.on("error_message", (data) => {
    console.error(`❌ SUNUCU HATASI ALINDI: "${data.message}"`);
});

socket.on("tournament_state_update", (data) => {
    console.log("\n✅ TURNUVA DURUM GÜNCELLEMESİ ALINDI:");
    console.log(`   Oyun Durumu: ${data.gameState}`);
    console.log(`   Oyuncular (${data.players?.length || 0}):`);
    let foundMe = false;
    if (data.players && data.players.length > 0) {
        data.players.forEach(p => {
            const meSuffix = (p.id === socket.id) ? " <-- BU BİZİM TEST KULLANICISI!" : "";
            console.log(`     - ${p.name} (ID: ${p.id})${meSuffix}`);
            if (p.id === socket.id) foundMe = true;
        });
    } else {
        console.log("      (Listede oyuncu yok)");
    }
    if(foundMe) {
        console.log("      🎉 Test kullanıcısı başarıyla katıldı!");
    } else {
        console.log("      ⚠️ Test kullanıcısı listede görünmüyor (henüz).");
    }
});

socket.on("announcer_message", (data) => {
     console.log(`📢 Sunucu Mesajı [${data.type}]: ${data.text}`);
});

socket.on("error", (err) => {
    console.error("💥 BEKLENMEDİK SOCKET HATASI:", err);
});

setTimeout(() => {
    console.log("\n--- Test süresi doldu. Bağlantı kesiliyor. ---");
    socket.disconnect();
}, 15000); // 15 saniye sonra bağlantıyı kes