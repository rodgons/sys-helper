import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { setCompact } from './render';

beforeEach(() => setCompact(false));
afterEach(cleanup);
