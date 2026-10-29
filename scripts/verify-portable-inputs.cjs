#!/usr/bin/env node
// A clean source checkout must not silently mount machine-specific private libraries.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const inputs=['assets/bgm','assets/fonts','assets/sfx','assets/transitions','src/ui/public/assets/luts'];
for(const name of inputs){const full=path.join(root,name),stat=fs.lstatSync(full);if(stat.isSymbolicLink() || !stat.isDirectory() || !fs.existsSync(path.join(full,'README.md')))throw new Error(`Nonportable optional asset mount: ${name}`);}
console.log(`Verified ${inputs.length} portable optional asset directories; no inherited absolute links required.`);
