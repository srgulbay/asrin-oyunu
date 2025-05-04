import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { doc, getDoc } from "firebase/firestore";
import { db } from '../firebaseConfig';

const useUserStore = create(
  persist(
    (set, get) => ({
      user: null,
      isLoggedIn: false,
      isLoading: true,

      setUser: async (firebaseUser) => {
        console.error('🚨 [userStore] setUser çağrıldı. Gelen firebaseUser:', firebaseUser); // GELEN VERİYİ GÖR

        if (firebaseUser) {
          const authData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          };
          console.error('🚨 [userStore] Temel Auth Verisi:', authData);

          // UID kontrolü - Eğer firebaseUser'da UID yoksa burada hata verelim
          if (!authData.uid) {
              console.error("🚨 [userStore] HATA: Gelen firebaseUser nesnesinde UID bulunamadı!");
              set({ user: null, isLoggedIn: false, isLoading: false }); // Durumu temizle veya hata durumuna al
              return; // Fonksiyondan çık
          }

          try {
            const userDocRef = doc(db, "users", firebaseUser.uid);
            console.error(`🚨 [userStore] Firestore'dan ${firebaseUser.uid} dokümanı okunuyor...`);
            const docSnap = await getDoc(userDocRef);

            let userData = authData; // Varsayılan olarak sadece auth verisi

            if (docSnap.exists()) {
              const firestoreData = docSnap.data();
              console.error('🚨 [userStore] Firestore Verisi Bulundu:', firestoreData);
              userData = {
                ...authData,
                grade: firestoreData.grade || null,
                xp: firestoreData.xp || 0,
                level: firestoreData.level || 1,
                resources: firestoreData.resources || { bilgelik: 0, zekaKristali: 0, enerji: 0, kultur: 0 },
              };
            } else {
              console.warn(`🚨 [userStore] Firestore'da ${firebaseUser.uid} için doküman bulunamadı. Sadece Auth verisi kullanılacak.`);
              // Yeni kayıt durumu olabilir, sadece Auth verisi yeterli.
              // userData zaten authData olarak ayarlı.
            }
             console.error('🚨 [userStore] State güncelleniyor. Yeni User Data:', JSON.stringify(userData, null, 2));
            set({ user: userData, isLoggedIn: true, isLoading: false });

          } catch (error) {
            console.error("🚨 [userStore] Firestore'dan kullanıcı verisi alınırken HATA:", error);
            console.error('🚨 [userStore] Hata nedeniyle state sadece Auth verisiyle güncelleniyor:', JSON.stringify(authData, null, 2));
            set({ user: authData, isLoggedIn: true, isLoading: false }); // Hata durumunda Auth verisiyle devam et
          }
        } else {
          console.error("🚨 [userStore] firebaseUser null geldi (çıkış yapıldı), state temizleniyor.");
          set({ user: null, isLoggedIn: false, isLoading: false });
        }
      },

      clearUser: () => {
        console.error("🚨 [userStore] clearUser çağrıldı.");
        set({ user: null, isLoggedIn: false, isLoading: false });
      },

      setLoading: (loading) => {
         console.error(`🚨 [userStore] setLoading çağrıldı: ${loading}`);
        set({ isLoading: loading });
      },
    }),
    {
      name: 'user-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isLoggedIn: state.isLoggedIn }),
    }
  )
);

export default useUserStore;