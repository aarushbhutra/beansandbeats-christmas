"use client";
/** Bound foreground requests so a half-open Wi-Fi connection cannot freeze replay. */
export async function tabletFetch(input:RequestInfo|URL,init:RequestInit={}){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(input,{...init,signal:controller.signal});
  // Keep the deadline active until the entire JSON payload is received.
  const body=response.body?await response.arrayBuffer():null;
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 }finally{clearTimeout(timeout);}
}
