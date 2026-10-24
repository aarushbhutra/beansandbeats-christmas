import {test} from "node:test";
import assert from "node:assert/strict";
import {canTransition,eventDay,publicNumber,totalCents} from "./domain";
import {sampleOrder} from "./fixtures";
test("SGT rollover uses event date rather than UTC date",()=>{assert.equal(eventDay(new Date("2026-11-25T16:00:00Z")),"2026-11-26");});
test("totals preserve quantities and reject fractional prices",()=>{assert.equal(totalCents(sampleOrder.items),1100);assert.throws(()=>totalCents([{...sampleOrder.items[0],unitPriceCentsSnapshot:5.5}]));});
test("terminal orders cannot regress",()=>{assert.equal(canTransition("queued","making"),true);assert.equal(canTransition("collected","ready"),false);assert.equal(canTransition("queued","ready"),false);});
test("public number includes device identity",()=>{assert.equal(publicNumber("2026-11-26","A",1),"1126-A-001");assert.notEqual(publicNumber("2026-11-26","A",1),publicNumber("2026-11-26","B",1));});
