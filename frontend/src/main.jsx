import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from "react-router-dom"; // BrowserRouter import edildi
import App from './App.jsx'
import './index.css'

// Firebase bağlantısını bir kere burada import etmek genellikle yeterlidir.
import './firebaseConfig';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> {/* App componenti BrowserRouter ile sarmalandı */}
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
