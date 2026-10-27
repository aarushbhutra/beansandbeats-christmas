"use client";
import {QRCodeSVG} from "qrcode.react";
import {useState} from "react";
import {useLiveQuery} from "dexie-react-hooks";
import StaffSession from "@/components/staff-session";
import {db} from "@/lib/offline/db";
import {useOrders} from "@/lib/offline/client";
import {advanceLocalOrder} from "@/lib/offline/queue";
import {eventDay} from "@/lib/domain";
import type {OrderStatus} from "@/lib/contracts";
export default function Barista(){const orders=useOrders(),pending=useLiveQuery(()=>db.outbox.toArray(),[],[]);const tickets=useLiveQuery(()=>db.tickets.toArray(),[],[]);const [qr,setQr]=useState("");const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function advance(id:string,status:OrderStatus){const reason=status==="cancelled"?prompt("Reason for cancelling this order")??"":undefined;if(status==="cancelled"&&!reason)return;setBusy(true);try{await advanceLocalOrder(id,status,reason);setMessage("Saved locally; waiting for sync");}catch(e){setMessage(e instanceof Error?e.message:"Could not save");}finally{setBusy(false);}}
 return <><h1>Barista queue</h1><StaffSession/><p role="status">{message}</p>{qr&&<section className="panel"><QRCodeSVG value={qr} size={180} title="Track this order"/><button onClick={()=>setQr("")}>Close QR</button></section>}<div className="queue">{(["queued","making","ready"] as const).map(status=><section key={status}><h2>{status}</h2>{orders.filter(o=>o.eventDay===eventDay()&&o.status===status).map(o=>{const waiting=pending.some(r=>r.operation.entityId===o.id);return <article className="panel" key={o.id}><h3>{o.publicNumber} · {o.firstName}</h3>{o.items.map((i,n)=><p key={n}>{i.quantity} × {i.nameSnapshot} · {i.milk} · {i.temperature}</p>)}{waiting&&<p className="badge">Pending sync</p>}<button disabled={busy||pending.some(r=>r.state==="blocked")} onClick={()=>void advance(o.id,status==="queued"?"making":status==="making"?"ready":"collected")}>{status==="queued"?"Start making":status==="making"?"Mark ready":"Collected"}</button> <button disabled={busy||pending.some(r=>r.state==="blocked")} onClick={()=>void advance(o.id,"cancelled")}>Cancel</button>{tickets.some(t=>t.id===o.id)&&<button onClick={()=>setQr(`${window.location.origin}/guest#${tickets.find(t=>t.id===o.id)!.token}`)}>Show guest QR</button>}</article>;})}</section>)}</div></>;}
