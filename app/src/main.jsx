import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Schriften lokal ausliefern statt ueber Google Fonts: keine Besucher-IP an Dritte.
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
