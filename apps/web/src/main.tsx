import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { linkManifest, UpdatePrompt } from './lib/pwa.tsx';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

const queryClient = new QueryClient();
linkManifest(window.location.pathname);

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <UpdatePrompt />
    </QueryClientProvider>
  </StrictMode>,
);
