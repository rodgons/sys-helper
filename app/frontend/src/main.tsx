import { QueryClientProvider } from '@tanstack/preact-query';
import { render } from 'preact';
import { App } from './app';
import { createQueryClient } from './lib/query-client';
import './global.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

render(
  <QueryClientProvider client={createQueryClient()}>
    <App />
  </QueryClientProvider>,
  root,
);
