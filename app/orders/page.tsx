"use client";
import {useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import StaffSession from "@/components/staff-session";
import {useMenu} from "@/lib/offline/client";
import {createLocalOrder} from "@/lib/offline/queue";
export default function Orders(){
 const menu=useMenu();const [name,setName]=useState(""),[selected,setSelected]=useState(""),[milk,setMilk]=useState(""),[temperature,setTemperature]=useState<"hot"|"iced">("hot"),[quantity,setQuantity]=useState(1),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ticket,setTicket]=useState<{number:string;url:string}|null>(null);
 const item=menu.find(m=>m.id===selected);const money=(cents:number)=>new Intl.NumberFormat("en-SG",{style:"currency",currency:"SGD"}).format(cents/100);
 return <><h1>Take an order</h1><StaffSession/><section className="panel"><p>First names appear on the collection board. Payments are handled separately on the organiser’s POS.</p>
 {!menu.length&&<p>Register the tablet and refresh the menu before taking orders.</p>}
 <form onSubmit={async e=>{e.preventDefault();if(busy||!item)return;setBusy(true);setMessage("");try{if(!item.active||item.soldOut||!item.allowedMilk.includes(milk)||!item.allowedTemperatures.includes(temperature))throw new Error("Choose available drink options");const result=await createLocalOrder(name,[{menuItemId:item.id,nameSnapshot:item.name,unitPriceCentsSnapshot:item.priceCents,quantity,milk,temperature}]);setTicket({number:result.order.publicNumber,url:`${window.location.origin}/guest#${result.token}`});setName("");setMessage("Saved on this tablet. Guest tracking becomes available after sync.");}catch(e){setMessage(e instanceof Error?e.message:"Order could not be saved");}finally{setBusy(false);}}}>
 <label>First name<input maxLength={60} required value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>Drink<select aria-label="Drink" required value={selected} onChange={e=>{const m=menu.find(m=>m.id===e.target.value);setSelected(e.target.value);setMilk(m?.allowedMilk[0]??"");setTemperature(m?.allowedTemperatures[0]??"hot");}}><option value="">Choose a drink</option>{menu.filter(m=>m.active).map(m=><option key={m.id} value={m.id} disabled={m.soldOut}>{m.name} · {money(m.priceCents)}{m.soldOut?" · Sold out":""}</option>)}</select></label>
 <label>Milk<select aria-label="Milk" required value={milk} onChange={e=>setMilk(e.target.value)}><option value="">Choose milk</option>{item?.allowedMilk.map(m=><option key={m}>{m}</option>)}</select></label>
 <label>Temperature<select aria-label="Temperature" value={temperature} onChange={e=>setTemperature(e.target.value as "hot"|"iced")}>{(item?.allowedTemperatures??["hot","iced"]).map(t=><option key={t}>{t}</option>)}</select></label>
 <label>Cups<input type="number" min={1} max={100} required value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><p>Total: {money((item?.priceCents??0)*quantity)}</p><button disabled={busy||!item}>{busy?"Saving…":"Save order"}</button>
 </form><p role="status">{message}</p></section>
 {ticket&&<section className="panel"><h2>{ticket.number}</h2><QRCodeSVG value={ticket.url} size={200} title={`Track order ${ticket.number}`}/><p>Scan to track once synced. The guest screen is being built by the second contributor.</p><button onClick={()=>setTicket(null)}>Dismiss ticket</button></section>}</>;
}
