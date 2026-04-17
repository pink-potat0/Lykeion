/**
 * Bundled for static HTML: `npm run build:analytics`
 * Equivalent to importing { inject } from "@vercel/analytics" (this repo is not Next.js).
 */
import { inject } from '@vercel/analytics';
if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') {
        inject();
    }
}
