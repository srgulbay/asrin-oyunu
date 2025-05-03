import { createTheme } from '@mui/material/styles';
import { teal, deepOrange, grey } from '@mui/material/colors';

const getDesignTokens = (mode) => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          primary: {
              main: teal[700], // Biraz daha belirgin birincil renk
          },
          secondary: {
              main: deepOrange[600], // Kontrast ikincil renk
          },
          background: {
              default: grey[100],
              paper: '#ffffff',
          },
          text: {
              primary: grey[900],
              secondary: grey[700],
          },
        }
      : {
          primary: {
              main: teal[300],
          },
          secondary: {
              main: deepOrange[400],
          },
          background: {
              default: '#1c1c1c', // Çok siyah olmayan koyu gri
              paper: '#2c2c2c',   // Kağıt/Kart için biraz daha açık
          },
          text: {
              primary: '#ffffff',
              secondary: grey[400],
          },
        }),
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, fontSize: '2.8rem', letterSpacing: '-0.05rem' },
    h2: { fontWeight: 600, fontSize: '2rem' },
    h3: { fontWeight: 600, fontSize: '1.6rem' },
    h4: { fontWeight: 600, fontSize: '1.3rem' },
    h5: { fontWeight: 500, fontSize: '1.1rem' },
    h6: { fontWeight: 500, fontSize: '1rem' },
    button: {
        textTransform: 'none', // Buton yazılarını normal yap
        fontWeight: 600,
    }
  },
  shape: {
    borderRadius: 8, // Genel köşe yuvarlaklığı
  },
  components: {
       MuiPaper: { // Paper component'leri için varsayılan stil
            styleOverrides: {
               root: {
                   backgroundImage: 'none', // Koyu modda garip gradyanları engelle
               },
            },
        },
        MuiButton: { // Butonlar için varsayılan stil
            styleOverrides: {
                root: {
                    borderRadius: 6, // Buton köşe yuvarlaklığı
                },
                 containedPrimary: { // Birincil dolgulu buton rengi
                     color: '#fff',
                 },
                  containedSecondary: { // İkincil dolgulu buton rengi
                     color: '#fff',
                 }
            },
        },
   },
});

// Temayı dinamik olarak oluşturacak fonksiyon
const createAppTheme = (mode) => {
    return createTheme(getDesignTokens(mode));
}

export default createAppTheme;
