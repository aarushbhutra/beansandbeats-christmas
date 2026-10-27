"use client";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
export default function OfflineStatus(){
 const path=usePathname();
 const [status,setStatus]=useState("Preparing offline pages…");
 useEffect(()=>{
  if(!('serviceWorker' in navigator)){setStatus("Offline page caching is unavailable in this browser");return;}
  if(process.env.NODE_ENV!=="production"){
   void navigator.serviceWorker.getRegistrations().then(async registrations=>{for(const registration of registrations){if(registration.active?.scriptURL===`${location.origin}/sw.js`)await registration.unregister();}});
   setStatus("Offline pages are available in production builds");return;
  }
  let active=true;
  navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(async registration=>{
   registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',()=>{
    if(active&&registration.waiting)setStatus("An update is ready; finish syncing, then close all booth tabs and reopen");
   });});
   await navigator.serviceWorker.ready;
   if(active)setStatus(registration.waiting?"Update ready; sync and close booth tabs to update":"Offline pages ready on this device");
  }).catch(()=>{if(active)setStatus("Offline pages are not ready; reconnect and reload before service");});
  return()=>{active=false;};
 },[]);
 return <section className="offline-status"><p role="status">{status}</p>{["/orders","/barista"].includes(path)&&<p><a href="/orders">Take orders</a> · <a href="/barista">Preparation queue</a></p>}</section>;
}
