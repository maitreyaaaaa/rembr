import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './components/arc/foundation.css';
import './styles.css';
import './marketing-site.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
