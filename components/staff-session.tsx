"use client";
import {createClient,SupabaseClient} from "@supabase/supabase-js";
import {useEffect,useState} from "react";
import {useLiveQuery} from "dexie-react-hooks";
import {db} from "@/lib/offline/db";
import {registerDevice} from "@/lib/offline/device";
import {syncTablet} from "@/lib/offline/sync";
let client:SupabaseClient|undefined;
function authClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error("Supabase is not configured. Set the environment variables and create staff accounts first.");return client??=createClient(url,key);}
export default function StaffSession(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[station,setStation]=useState(""),[prefix,setPrefix]=useState("A"),[token,setToken]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[online,setOnline]=useState(true);
 const devices=useLiveQuery(()=>db.devices.toArray(),[],[]);const outbox=useLiveQuery(()=>db.outbox.toArray(),[],[]);
 useEffect(()=>{let unsubscribe=()=>{};try{const c=authClient();const subscription=c.auth.onAuthStateChange((_event,session)=>setToken(session?.access_token??""));unsubscribe=()=>subscription.data.subscription.unsubscribe();}catch{}return unsubscribe;},[]);
 useEffect(()=>{setOnline(navigator.onLine);const update=()=>setOnline(navigator.onLine);window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);
 useEffect(()=>{if(!token)return;const run=()=>syncTablet(token).catch(e=>setMessage(e.message));void run();const timer=setInterval(run,5000);window.addEventListener("online",run);return()=>{clearInterval(timer);window.removeEventListener("online",run);};},[token]);
 async function task(fn:()=>Promise<unknown>){setBusy(true);setMessage("");try{await fn();}catch(e){setMessage(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
 return <section className="panel"><h2>Tablet connection</h2><p role="status">{online?"Online":"Offline — changes stay on this tablet"} · {devices[0]?`Device ${devices[0].prefix}`:"Device not registered"} · {outbox.length} changes awaiting sync</p>
 {!token?<form onSubmit={e=>{e.preventDefault();void task(async()=>{const {error}=await authClient().auth.signInWithPassword({email,password});setPassword("");if(error)throw error;});}}><label>Staff email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Sign in</button></form>:<><button disabled={busy} onClick={()=>void task(()=>syncTablet(token))}>Sync now</button> <button disabled={busy} onClick={()=>void task(async()=>{await authClient().auth.signOut();})}>Sign out</button>
 {!devices.length&&<form onSubmit={e=>{e.preventDefault();void task(async()=>{await registerDevice(prefix,station,token);const r=await fetch("/api/menu");if(!r.ok)throw new Error("Device registered, but menu download failed; use Refresh menu");const data=await r.json();await db.menu.bulkPut(data.items);});}}><p>A booth lead must register this tablet online. Use an unused prefix.</p><label>Station UUID<input required value={station} onChange={e=>setStation(e.target.value)}/></label><label>Tablet prefix<input required pattern="[A-Z]{1,4}" value={prefix} onChange={e=>setPrefix(e.target.value)}/></label><button disabled={busy}>Register tablet</button></form>}
 <button disabled={busy} onClick={()=>void task(async()=>{const r=await fetch("/api/menu");if(!r.ok)throw new Error("Menu unavailable");const data=await r.json();await db.transaction("rw",db.menu,async()=>{await db.menu.clear();await db.menu.bulkPut(data.items);});})}>Refresh menu</button></>}
 {message&&<p role="alert">{message}</p>}{outbox.filter(r=>r.state==="blocked").map(r=><p role="alert" key={r.operationId}>Sync paused: {r.message} Keep this tablet's data; ask the booth lead to reconcile before continuing.</p>)}
 </section>;
}
