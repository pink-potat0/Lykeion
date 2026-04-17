const path = require('path');
const esbuild = require('esbuild');

esbuild
    .build({
        entryPoints: [path.join(__dirname, 'analytics-inject.mjs')],
        bundle: true,
        format: 'iife',
        outfile: path.join(__dirname, 'vercel-analytics.js'),
        define: { 'process.env.NODE_ENV': '"production"' }
    })
    .catch(() => process.exit(1));
