import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [file, yy, x0, x1] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const b64 = fs.readFileSync(file).toString('base64');
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
const page = await browser.newPage();
const out = await page.evaluate(async ([b64,yy,x0,x1]) => {
  const img = new Image(); img.src = 'data:image/png;base64,'+b64; await img.decode();
  const c = document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0);
  const d = x.getImageData(x0,yy,x1-x0,1).data; const o=[];
  for(let i=0;i<x1-x0;i+=3){ o.push(Math.round(0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2])); }
  return o.join(' ');
},[b64,yy,x0,x1]);
console.log(out); await browser.close();
