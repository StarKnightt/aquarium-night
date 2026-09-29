import { chromium } from 'playwright-core';
import fs from 'node:fs';
const file = process.argv[2]; const gx = +(process.argv[3]||12), gy = +(process.argv[4]||6);
const b64 = fs.readFileSync(file).toString('base64');
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
const page = await browser.newPage();
const out = await page.evaluate(async ([b64,gx,gy]) => {
  const img = new Image(); img.src = 'data:image/png;base64,'+b64; await img.decode();
  const c = document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0);
  const d = x.getImageData(0,0,c.width,c.height).data; const W=c.width,H=c.height;
  const rows=[];
  for(let j=0;j<gy;j++){ const row=[]; for(let i=0;i<gx;i++){
    let r=0,g=0,bl=0,n=0, s=0,s2=0, lap=0;
    const x0=Math.floor(i*W/gx),x1=Math.floor((i+1)*W/gx),y0=Math.floor(j*H/gy),y1=Math.floor((j+1)*H/gy);
    for(let yy=y0;yy<y1;yy+=2)for(let xx=x0;xx<x1;xx+=2){ const k=(yy*W+xx)*4; r+=d[k];g+=d[k+1];bl+=d[k+2];n++; const l=0.299*d[k]+0.587*d[k+1]+0.114*d[k+2]; s+=l;s2+=l*l;
      const k2=(yy*W+Math.min(xx+2,W-1))*4; const l2=0.299*d[k2]+0.587*d[k2+1]+0.114*d[k2+2]; lap+=Math.abs(l-l2); }
    row.push(`${Math.round(r/n)},${Math.round(g/n)},${Math.round(bl/n)}|sd${Math.round(Math.sqrt(Math.max(0,s2/n-(s/n)**2)))}|e${(lap/n).toFixed(1)}`);
  } rows.push(row.join('  ')); }
  return rows.join('\n');
},[b64,gx,gy]);
console.log(out); await browser.close();
