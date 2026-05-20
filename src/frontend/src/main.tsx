import './index.css';
import 'rpg-awesome/css/rpg-awesome.min.css';
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
