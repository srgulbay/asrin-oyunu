const admin = require("firebase-admin");

let dbAdmin = null;
let authAdmin = null;
let FieldValue = null;

try {
    if (!process.env.FIREBASE_ADMIN_SDK_CONFIG) {
        throw new Error("FIREBASE_ADMIN_SDK_CONFIG ortam değişkeni bulunamadı!");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);

    if (!admin.apps.length) {
         admin.initializeApp({
           credential: admin.credential.cert(serviceAccount)
         });
         console.log("Firebase Admin SDK başarıyla başlatıldı.");
    } else {
         admin.app();
    }
    dbAdmin = admin.firestore();
    authAdmin = admin.auth();
    FieldValue = admin.firestore.FieldValue;

} catch (error) {
    console.error("Firebase Admin SDK başlatılırken HATA:", error.message);
}

module.exports = {
    dbAdmin,
    authAdmin,
    FieldValue,
    isAdminSDKInitialized: admin.apps.length > 0 && dbAdmin !== null && authAdmin !== null
};