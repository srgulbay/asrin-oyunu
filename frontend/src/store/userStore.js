// src/store/userStore.js dosyasının GÜNCEL HALİ

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
        console.log('>>> USERSTORE: setUser CALLED with firebaseUser:', firebaseUser ? firebaseUser.uid : 'null');

        if (firebaseUser) {
          const authData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          };

          if (!authData.uid) {
              console.log(">>> USERSTORE: ERROR - UID missing in firebaseUser!");
              console.log(">>> USERSTORE: Setting isLoading to false (no UID)");
              set({ user: null, isLoggedIn: false, isLoading: false });
              return;
          }

          let userData = { ...authData, roles: ['player'] }; // Varsayılan rol 'player'

          try {
            const userDocRef = doc(db, "users", firebaseUser.uid);
            console.log(`>>> USERSTORE: Reading Firestore doc for ${firebaseUser.uid}`);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
              const firestoreData = docSnap.data();
              console.log('>>> USERSTORE: Firestore data FOUND:', firestoreData);
              userData = {
                ...authData,
                // --- ROLES GÜNCELLEMESİ ---
                roles: firestoreData.roles || ['player'], // Firestore'dan rolleri al, yoksa varsayılan
                // --------------------------
                grade: firestoreData.grade || null,
                xp: firestoreData.xp || 0,
                level: firestoreData.level || 1,
                resources: firestoreData.resources || { bilgelik: 0, zekaKristali: 0, enerji: 0, kultur: 0 },
              };
            } else {
              console.log(`>>> USERSTORE: Firestore doc NOT FOUND for ${firebaseUser.uid}. Using Auth data only + default role.`);
              // userData zaten authData ve varsayılan rolü içeriyor
            }
          } catch (error) {
            console.log(">>> USERSTORE: ERROR reading Firestore:", error);
            // Hata olsa bile Auth verisiyle ve varsayılan rolle devam et
          } finally {
             console.log('>>> USERSTORE: Setting state. User:', JSON.stringify(userData, null, 2));
             console.log(">>> USERSTORE: Setting isLoading to false (setUser end)");
             set({ user: userData, isLoggedIn: true, isLoading: false });
          }
        } else {
          console.log(">>> USERSTORE: firebaseUser is null (logout). Clearing state.");
          console.log(">>> USERSTORE: Setting isLoading to false (logout)");
          set({ user: null, isLoggedIn: false, isLoading: false });
        }
      },

      clearUser: () => {
        console.log(">>> USERSTORE: clearUser called.");
        console.log(">>> USERSTORE: Setting isLoading to false (clearUser)");
        set({ user: null, isLoggedIn: false, isLoading: false });
      },

      setLoading: (loading) => {
         console.log(`>>> USERSTORE: setLoading called: ${loading}`);
        set({ isLoading: loading });
      },
    }),
    {
      name: 'user-auth-storage',
      storage: createJSONStorage(() => localStorage),
      // Rolleri de localStorage'a kaydetmek için user'ı tam olarak kaydetmeye devam edelim
      partialize: (state) => ({ user: state.user, isLoggedIn: state.isLoggedIn }),
    }
  )
);

export default useUserStore;