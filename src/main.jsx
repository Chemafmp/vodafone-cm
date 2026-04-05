import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ChangesProvider } from './context/ChangesContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ChangesProvider>
      <App />
    </ChangesProvider>
  </StrictMode>,
)
