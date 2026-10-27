import {z} from "zod";
const uuid=z.uuid(); const integer=z.number().int().nonnegative().max(2147483647);
const item=z.object({menuItemId:uuid,nameSnapshot:z.string().min(1).max(100),unitPriceCentsSnapshot:integer,quantity:z.number().int().min(1).max(100),milk:z.string().max(60),temperature:z.enum(["hot","iced"])});
const order=z.object({id:uuid,publicNumber:z.string().max(40),stationId:uuid,deviceId:uuid,deviceSequence:integer.positive(),eventDay:z.iso.date(),firstName:z.string().trim().min(1).max(60),items:z.array(item).min(1).max(50),totalCents:integer,status:z.literal("queued"),revision:z.literal(0),createdAtDevice:z.iso.datetime(),receivedAtServer:z.null(),updatedAtServer:z.null()});
const menu=z.object({id:uuid,revision:integer,name:z.string().trim().min(1).max(80),priceCents:integer.max(100000),allowedMilk:z.array(z.string().min(1).max(80)).min(1).max(12),allowedTemperatures:z.array(z.enum(["hot","iced"])).min(1).max(2),soldOut:z.boolean(),active:z.boolean()});
const base=z.object({operationId:uuid,deviceId:uuid,deviceSequence:integer.positive(),entityId:uuid,expectedRevision:integer});
export const operationSchema=z.discriminatedUnion("kind",[
 base.extend({kind:z.literal("updateMenu"),payload:menu}),
 base.extend({kind:z.literal("createOrder"),payload:z.object({order,trackingToken:z.string().regex(/^[a-f0-9]{64}$/)})}),
 base.extend({kind:z.literal("advanceOrder"),payload:z.object({status:z.enum(["making","ready","collected"])})}),
 base.extend({kind:z.literal("cancelOrder"),payload:z.object({reason:z.string().trim().min(1).max(200)})})]);
