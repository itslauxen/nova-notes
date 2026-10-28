import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import Toaster from './components/Toaster'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './context/LanguageContext'
import { AuthProvider } from './context/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
            <Toaster />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>,
)
