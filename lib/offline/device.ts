"use client";
import {z} from "zod";
import {db} from "./db";
const deviceSchema = z.object({id:z.uuid(),prefix:z.string().regex(/^[A-Z]{1,4}$/),stationId:z.uuid(),nextSequence:z.number().int().positive(),registeredAt:z.iso.datetime()});
// Only activate a device following successful online, lead-authorized registration.
export async function registerDevice(prefix: string, stationId: string, accessToken: string) {
 const response = await fetch("/api/staff/devices",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},body:JSON.stringify({prefix,stationId})});
 if (!response.ok) throw new Error(`Device registration failed (${response.status})`);
 const device = deviceSchema.parse(await response.json());
 await db.devices.add(device);
 return device;
}
