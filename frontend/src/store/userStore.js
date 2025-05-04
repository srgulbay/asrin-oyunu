import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { doc, getDoc } from "firebase/firestore";
import { db } from '../firebaseConfig';

const useUserStore = create(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      isLoading: true,

      setUser: async (firebaseUser) => {
        if (firebaseUser) {
          const authData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          };

          try {
            const userDocRef = doc(db, "users", firebaseUser.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
              const firestoreData = docSnap.data();
              const userData = {
                ...authData,
                grade: firestoreData.grade || null,
                xp: firestoreData.xp || 0,
                level: firestoreData.level || 1,
                resources: firestoreData.resources || { bilgelik: 0, zekaKristali: 0, enerji: 0, kultur: 0 },
              };
              set({ user: userData, isLoggedIn: true, isLoading: false });
            } else {
              console.warn(`Firestore'da ${firebaseUser.uid} için doküman bulunamadı.`);
              set({ user: authData, isLoggedIn: true, isLoading: false });
            }
          } catch (error) {
            console.error("Firestore'dan kullanıcı verisi alınırken hata:", error);
            set({ user: authData, isLoggedIn: true, isLoading: false });
          }
        } else {
          set({ user: null, isLoggedIn: false, isLoading: false });
        }
      },

      clearUser: () => {
        set({ user: null, isLoggedIn: false, isLoading: false });
      },

      setLoading: (loading) => {
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