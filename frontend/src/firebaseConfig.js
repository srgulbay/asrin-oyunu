import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; // Authentication için
import { getFirestore } from "firebase/firestore"; // Firestore veritabanı için
// import { getAnalytics } from "firebase/analytics"; // Analytics isterseniz aktif edebilirsiniz

// Vite .env değişkenlerinden Firebase yapılandırmasını oku
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID // Opsiyonel
};

// Hata kontrolü: Değişkenlerin yüklenip yüklenmediğini kontrol et
if (!firebaseConfig.apiKey) {
    console.error("Hata: Firebase API Anahtarı bulunamadı! .env dosyasını kontrol edin.");
}

// Firebase uygulamasını başlat
const app = initializeApp(firebaseConfig);

// Kullanılacak Firebase servislerini başlat ve export et
export const auth = getAuth(app);
export const db = getFirestore(app);
// const analytics = getAnalytics(app); // Analytics isterseniz

export default app; // Ana app nesnesi
