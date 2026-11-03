import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './components/arc/foundation.css';
import './styles/app-base.css';
import './styles/app-mobile.css';
import './components/public-guides.css';
import './styles.css';
import './marketing-site.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
