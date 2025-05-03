import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Kullanıcı state'ini yönetecek Zustand store'unu oluştur
const useUserStore = create(
  // persist middleware'i state'i localStorage'a kaydeder/yükler
  persist(
    (set, get) => ({
      // Başlangıç State'i
      user: null,          // Giriş yapmış kullanıcının bilgileri (Firebase Auth'dan gelecek)
      isLoggedIn: false,   // Kullanıcı giriş yapmış mı?
      isLoading: true,     // Başlangıçta Auth durumu kontrol edilirken true olacak

      // State'i güncelleyen Actions (Fonksiyonlar)
      setUser: (firebaseUser) => {
        // Firebase'den gelen kullanıcı bilgisini veya null'ı ayarla
        const userData = firebaseUser ? {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            // İleride Firestore'dan ek bilgiler de eklenebilir (sınıf, xp vb.)
        } : null;
        console.log("Zustand setUser:", userData); // Debug
        set({ user: userData, isLoggedIn: !!userData, isLoading: false });
      },

      // Kullanıcı çıkış yaptığında state'i temizle
      clearUser: () => {
        console.log("Zustand clearUser çağrıldı.");
        set({ user: null, isLoggedIn: false, isLoading: false });
      },

      // Yükleniyor durumunu ayarla (opsiyonel)
      setLoading: (loading) => {
        set({ isLoading: loading });
      },

    }),
    {
      name: 'user-auth-storage', // localStorage'daki anahtar adı
      storage: createJSONStorage(() => localStorage), // Depolama alanı (localStorage)
      // Sadece user ve isLoggedIn bilgilerini kalıcı yap, isLoading'i yapma
      partialize: (state) => ({ user: state.user, isLoggedIn: state.isLoggedIn }),
    }
  )
);

export default useUserStore;
