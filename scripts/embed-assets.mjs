import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),assets={};
async function scan(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())await scan(f);else{const key='/'+path.relative(path.join(root,'public'),f).split(path.sep).join('/');const bytes=await fs.readFile(f),ext=path.extname(f),binary=['.webp','.png','.jpg','.jpeg'].includes(ext);assets[key]={type:({'.html':'text/html;charset=UTF-8','.js':'text/javascript;charset=UTF-8','.css':'text/css;charset=UTF-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'})[ext]||'text/plain',body:bytes.toString(binary?'base64':'utf8'),...(binary?{binary:true}:{})};}}}
await scan(path.join(root,'public'));
await fs.writeFile(path.join(root,'worker/index.js'),'const ASSETS='+JSON.stringify(assets)+';\n'+await fs.readFile(path.join(root,'worker/runtime.js'),'utf8'));
console.log('Embedded '+Object.keys(assets).length+' public assets.');
