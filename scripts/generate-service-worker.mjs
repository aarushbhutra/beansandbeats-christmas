import {readFile,readdir,writeFile} from 'node:fs/promises';
async function files(dir){const entries=await readdir(dir,{withFileTypes:true});const paths=await Promise.all(entries.map(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]));return paths.flat();}
const assets=(await files('.next/static')).filter(path=>/\.(js|css|woff2?|png|svg)$/.test(path)).map(path=>path.replace('.next/','/_next/')).sort();
const version=(await readFile('.next/BUILD_ID','utf8')).trim();
const source=(await readFile('scripts/service-worker.js','utf8')).replace('__BUILD_VERSION__',JSON.stringify(version)).replace('__BUILD_ASSETS__',JSON.stringify(assets));
await writeFile('public/sw.js',source);
console.log(`Generated offline worker for ${assets.length} build assets and seven page shells.`);
