import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode's dev-only double-invoked effects are a poor fit for this app:
// camera acquisition (getUserMedia) and the Web Audio graph (AudioContext)
// are both stateful, non-idempotent browser resources, not simple render
// side effects, so we skip it here.
createRoot(document.getElementById('root')!).render(<App />)
