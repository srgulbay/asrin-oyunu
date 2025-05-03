import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa' // PWA eklentisini import et

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Service worker'ı otomatik güncelle
      // injectRegister: 'auto', // Gerekirse script ekleme şekli
      manifest: { // Temel manifest bilgileri
        name: 'Asrın Oyunu',
        short_name: 'AsrınOyunu',
        description: 'Gerçek zamanlı bilgi yarışması',
        theme_color: '#1a7f71', // Tema rengi (teal gibi)
        background_color: "#ffffff", // Arka plan rengi
        display: "standalone", // Tarayıcı arayüzü olmadan açılma
        scope: "/",
        start_url: "/",
        icons: [ // Farklı boyutlarda ikonlar EKLEMELİSİNİZ!
          {
            src: '/icons/icon-192x192.png', // Bu ikonları public/icons/ altına koyun
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
           { // Maskable icon (opsiyonel ama önerilir)
             src: '/icons/maskable_icon.png',
             sizes: '196x196',
             type: 'image/png',
             purpose: 'maskable'
           }
        ]
      },
      // Service Worker ayarları (varsayılanlar genellikle iyidir)
      workbox: {
         globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2}'] // Önbelleğe alınacak dosyalar
         // runtimeCaching ayarları ile ağdan gelen verileri de cacheleyebilirsiniz.
      }
    })
  ],
})