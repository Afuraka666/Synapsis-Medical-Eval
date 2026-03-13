
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AnalyticsProvider } from './contexts/analytics';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AnalyticsProvider>
      <App />
    </AnalyticsProvider>
  </React.StrictMode>
);
