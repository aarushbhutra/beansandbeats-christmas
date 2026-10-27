import {test,expect} from '@playwright/test';
import {sampleMenu,sampleOrder} from '../../lib/fixtures';
test('cached tablet reloads offline and completes an order with four durable operations',async({page,context})=>{
 await page.goto('/orders');
 await expect(page.getByText('Offline pages ready on this device')).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
 await page.evaluate(async({menu,order})=>{
  const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('beansandbeats-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise<void>((resolve,reject)=>{const tx=database.transaction(['menu','devices'],'readwrite');tx.objectStore('menu').put(menu);tx.objectStore('devices').put({id:order.deviceId,stationId:order.stationId,prefix:'A',nextSequence:1,registeredAt:new Date().toISOString()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});database.close();
 },{menu:sampleMenu[0],order:sampleOrder});
 await context.setOffline(true);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Take an order'})).toBeVisible();
 await page.getByLabel('First name',{exact:true}).fill('Offline Guest');
 await page.getByLabel('Drink',{exact:true}).selectOption(sampleMenu[0].id);
 await page.getByRole('button',{name:'Save order',exact:true}).click();
 await expect(page.getByText('Saved on this tablet.',{exact:false})).toBeVisible();
 await page.getByRole('link',{name:'Preparation queue',exact:true}).click();
 await expect(page.getByText('Offline Guest',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Start making',exact:true}).click();
 await page.getByRole('button',{name:'Mark ready',exact:true}).click();
 await page.getByRole('button',{name:'Collected',exact:true}).click();
 // Reload after the UI confirms the durable transaction completed.
 await expect(page.getByRole('button',{name:'Collected',exact:true})).toHaveCount(0);
 await page.reload();
 const saved=await page.evaluate(async()=>{
  const database=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('beansandbeats-v1');r.onsuccess=()=>resolve(r.result);});
  const all=(store:string)=>new Promise<any[]>(resolve=>{const r=database.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);});
  const orders=await all('orders'),operations=await all('outbox');database.close();return{status:orders[0].status,operations:operations.map(r=>r.operation.expectedRevision).sort(),count:operations.length};
 });
 expect(saved).toEqual({status:'collected',operations:[0,1,2,3],count:4});
 // The worker must not cache authenticated or public API data, nor Supabase traffic.
 const cached=await page.evaluate(async()=>{const keys=await caches.keys();const urls:string[]=[];for(const key of keys)for(const request of await (await caches.open(key)).keys())urls.push(request.url);return urls;});
 expect(cached.some(url=>url.includes('/api/')||url.includes('supabase.co'))).toBe(false);
 const api=await page.evaluate(async()=>{try{await fetch('/api/guest/status',{headers:{Authorization:'Bearer '+ 'a'.repeat(64)}});return 'unexpected response';}catch{return 'network unavailable';}});
 expect(api).toBe('network unavailable');
});
test('guest, ready and lead shells reopen with the network disabled',async({page,context})=>{
 await page.goto('/');await expect(page.getByText('Offline pages ready on this device')).toBeVisible();
 await page.evaluate(async()=>{if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
 await context.setOffline(true);
 for(const path of ['/guest','/ready','/lead/menu','/lead/reports']){
  await page.goto(path);await expect(page.locator('main')).toBeVisible();expect(await page.title()).not.toContain('unavailable');
 }
});
