import "server-only";
export function failure(code:string,message:string,status:number){return Response.json({error:{code,message}},{status,headers:{"Cache-Control":"no-store"}});}
export function configured(){return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY);}
export function json(data:unknown){return Response.json(data,{headers:{"Cache-Control":"no-store"}});}
