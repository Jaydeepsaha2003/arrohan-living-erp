import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './ui/kit.jsx';

// Self-hosted variable fonts — bundled into the build, no external request at
// runtime. Matters on an office LAN install where internet may not be reliable.
import '@fontsource-variable/inter';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import './styles.css';

// Apply the saved theme before first paint so there is no flash.
document.documentElement.dataset.theme = localStorage.getItem('arrohan-theme') || 'light';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
