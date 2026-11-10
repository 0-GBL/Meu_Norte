import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { LedgerProvider } from './LedgerContext.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter><LedgerProvider><App /></LedgerProvider></BrowserRouter></StrictMode>,
)
