import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.argv[2];
fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox']});
const ctx = await b.newContext({ viewport:{width:1280,height:720}, recordVideo:{dir:OUT, size:{width:1280,height:720}}, colorScheme:'light'});
const p = await ctx.newPage();
await p.addInitScript(() => {
  const mk = () => {
    if (document.getElementById('__cap')) return;
    const st = document.createElement('style');
    st.textContent = `
    #__cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1000px;background:rgba(17,24,39,.94);color:#fff;font:600 22px/1.35 Inter,system-ui,sans-serif;padding:14px 26px;border-radius:14px;z-index:2147483646;box-shadow:0 8px 30px rgba(0,0,0,.35);text-align:center;transition:opacity .3s;opacity:0}
    #__hl{position:fixed;border:4px solid #f59e0b;border-radius:10px;z-index:2147483645;pointer-events:none;box-shadow:0 0 0 6px rgba(245,158,11,.25);transition:all .35s;opacity:0}
    #__cur{position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(239,68,68,.75);border:3px solid #fff;z-index:2147483647;pointer-events:none;left:-50px;top:-50px;transform:translate(-50%,-50%);transition:transform .1s}
    #__cur.down{transform:translate(-50%,-50%) scale(.6)}`;
    document.documentElement.appendChild(st);
    for (const id of ['__cap','__hl','__cur']) { const d=document.createElement('div'); d.id=id; document.documentElement.appendChild(d); }
    addEventListener('mousemove',e=>{const c=document.getElementById('__cur'); c.style.left=e.clientX+'px'; c.style.top=e.clientY+'px';},true);
    addEventListener('mousedown',()=>document.getElementById('__cur').classList.add('down'),true);
    addEventListener('mouseup',()=>document.getElementById('__cur').classList.remove('down'),true);
  };
  if (document.readyState==='loading') addEventListener('DOMContentLoaded',mk); else mk();
});
const cap = async (t) => { await p.evaluate(t=>{const c=document.getElementById('__cap'); if(!t){c.style.opacity=0;return;} c.textContent=t; c.style.opacity=1;}, t); };
const hl = async (loc, pad=8) => { const bb = await loc.boundingBox({timeout:4000}).catch(()=>null); if(!bb) return; await p.evaluate(({bb,pad})=>{const h=document.getElementById('__hl'); Object.assign(h.style,{left:bb.x-pad+'px',top:bb.y-pad+'px',width:bb.width+2*pad+'px',height:bb.height+2*pad+'px',opacity:1});},{bb,pad}); };
const nohl = () => p.evaluate(()=>{document.getElementById('__hl').style.opacity=0;});
const click = async (loc) => { const bb = await loc.boundingBox({timeout:8000}); await p.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2, {steps:25}); await p.waitForTimeout(250); await loc.click(); };
const wait = (ms)=>p.waitForTimeout(ms);

await p.goto('http://localhost:5199/'); await wait(1200);
await p.mouse.move(640,360);
await cap('Een sales-app als alternatief voor Dynamics 365 Sales: gebouwd met Power Apps code apps op Dataverse'); await wait(4500);
await cap('Home: "Mijn werk" met taken, leads en deals van de ingelogde verkoper'); await hl(p.locator('main')); await wait(4000); await nohl();

await cap('Pipeline-bord: deals per fase, met gewogen waarde'); await click(p.locator('a[href="/pipeline"]')); await wait(1500);
await hl(p.locator('main').getByText('Open pipeline').locator('..').locator('..'),10); await wait(2500);
await cap('Sleep een deal naar een andere fase, of kies Funnel'); await nohl(); await hl(p.locator('main').getByText('Northwind BV - Cloud migration').first().locator('xpath=ancestor::*[self::div][3]'),6); await wait(3000); await nohl();
await click(p.getByText('Funnel',{exact:true})); await wait(2500); await click(p.getByText('Board',{exact:true})); await wait(1200);

await cap('Een deal openen: het proces begeleidt de verkoper stap voor stap'); await click(p.locator('a[href="/opportunities/opp-northwind-cloud"]')); await wait(1800);
await hl(p.getByText('Starter Opportunity process').locator('xpath=ancestor::div[2]'),6); await wait(4000); await nohl();
const warn = p.getByText('Next step is empty').first();
await p.mouse.wheel(0,400); await wait(900);
await cap('Business rules: de manager bouwt ze zelf in de app, zonder code'); await hl(warn.locator('xpath=ancestor::div[1]'),4); await wait(4500); await nohl();
await p.mouse.wheel(0,-600); await wait(900);
await cap('Verplicht veld invullen: de waarschuwing verdwijnt'); await click(p.locator('#key-opp-northwind-cloud-nextStep')); await p.keyboard.type('Contract naar juridische afdeling', {delay:60}); await p.keyboard.press('Tab'); await wait(1500);
await p.mouse.wheel(0,400); await wait(2500); await p.mouse.wheel(0,-600); await wait(800);
await cap('Activiteiten: notitie, taak of gesprek loggen op de deal'); await hl(p.getByRole('button',{name:'Note'}).locator('xpath=ancestor::div[2]'),6); await wait(3500); await nohl();

await cap('Forecast: per maand en kwartaal, met team en quota'); await click(p.locator('a[href="/forecast"]')); await wait(2000);
await hl(p.locator('main'),0); await wait(3500); await nohl();
await click(p.getByRole('tab',{name:'Team'}).or(p.getByText('Team',{exact:true}).first())); await wait(2500);

await cap('Producten en offertes, met eigen PDF-sjablonen'); await click(p.locator('a[href="/products"]')); await wait(2200); await hl(p.locator('main'),0); await wait(3000); await nohl();
await click(p.locator('a[href="/products/quote-templates"]')); await wait(2800);

await cap('Automation: processen en business rules, beheerd door de manager'); await click(p.locator('a[href="/automation"]')); await wait(2000); await hl(p.locator('main'),0); await wait(3000); await nohl();
await click(p.getByRole('tab',{name:'Business rules'}).or(p.getByText('Business rules',{exact:true}).first())); await wait(3500);

await cap('Een nieuwe lead aanmaken'); await click(p.locator('a[href="/leads"]')); await wait(1200);
await click(p.getByRole('button',{name:'New Lead'})); await wait(800);
await click(p.locator('#new-lead-firstName')); await p.keyboard.type('Sanne',{delay:70});
await click(p.locator('#new-lead-lastName')); await p.keyboard.type('de Vries',{delay:70});
await click(p.locator('#new-lead-company')); await p.keyboard.type('Contoso Logistics',{delay:70}); await wait(800);
await click(p.getByRole('button',{name:'Save'})); await wait(2500);
await cap('Elke lead volgt een eigen proces: Not Contacted, Working, Qualified of Disqualified'); await hl(p.getByText('Starter Lead process').locator('xpath=ancestor::div[2]'),6); await wait(4500); await nohl();
await cap('Qualify maakt in een klik een opportunity, gekoppeld aan account en contact'); await wait(4500);
await cap('Volgende stap, v3: Outlook en Teams, Jev voor beslisregels, Mistral voor samenvattingen'); await wait(5000);
await cap(null); await wait(500);
await ctx.close(); await b.close();
console.log('done');
