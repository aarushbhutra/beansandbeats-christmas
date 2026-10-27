"use client";
import {useEffect,useState,type ReactNode} from "react";
import {useLiveQuery} from "dexie-react-hooks";
import {authClient} from "@/lib/staff-auth";
import {db} from "@/lib/offline/db";
import {Person2StaffProvider} from "@/lib/client/staff-bridge";
import type {MenuResponse,StaffRole} from "@/lib/client/contracts";
import {enqueueMenuIntent,refreshCachedMenu} from "@/lib/offline/menu";
import StaffSession from "./staff-session";
export default function LeadConnection({children}:{children:ReactNode}){
 const [token,setToken]=useState(""),[role,setRole]=useState<StaffRole|null>(null),[loading,setLoading]=useState(true),[online,setOnline]=useState(true),[menu,setMenu]=useState<MenuResponse|null>(null),[error,setError]=useState("");
 const cached=useLiveQuery(()=>db.menu.toArray(),[],[]),outbox=useLiveQuery(()=>db.outbox.toArray(),[],[]);
 useEffect(()=>{try{const c=authClient();const {data}=c.auth.onAuthStateChange((_e,s)=>{setToken(s?.access_token??"");setRole(null);setMenu(null);setLoading(Boolean(s));});return()=>data.subscription.unsubscribe();}catch{setLoading(false);}},[]);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);
 useEffect(()=>{let current=true;if(!token||!online){setLoading(false);return;}setLoading(true);setError("");fetch("/api/staff/session",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Unable to verify staff role; reconnect or sign in again");return r.json();}).then(async data=>{if(!current)return;setRole(data.role);if(data.role==="booth_lead"){const m=await refreshCachedMenu(token);if(current)setMenu(m);}}).catch(e=>{if(current){setRole(null);setError(e.message);}}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[token,online]);
 return <><StaffSession/>{error&&<p role="alert">{error}</p>}<Person2StaffProvider value={{role,loading,menu:role==="booth_lead"&&menu?{...menu,items:cached}:null,sync:{online,pendingCount:outbox.length,pendingEntityIds:outbox.map(r=>r.operation.entityId),conflicts:outbox.filter(r=>r.state==="blocked").map(r=>({entityId:r.operation.entityId,message:r.message??"Sync conflict"})),lastSyncedAt:menu?.syncedAt??null},submitOperation:enqueueMenuIntent,refreshMenu:async()=>{if(token)setMenu(await refreshCachedMenu(token));},getAccessToken:async()=>{const {data}=await authClient().auth.getSession();return data.session?.access_token??null;}}}>{children}</Person2StaffProvider></>;
}
