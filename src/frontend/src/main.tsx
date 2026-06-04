import './index.css';
import 'rpg-awesome/css/rpg-awesome.min.css';
// Self-hosted game-icons.net icon font (~4100 glyphs) — used via <GameIcon>
// alongside rpg-awesome. Vendored under src/vendor/game-icons (CC BY 3.0).
import './vendor/game-icons/game-icons.css';
import App from './App.js';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import React from 'react';
import ReactDOM from 'react-dom/client';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
