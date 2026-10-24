"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { StaffBridge } from "./contracts";

const Bridge = createContext<StaffBridge | null>(null);
/** Mount inside Person 1's authenticated lead layout; pass their reactive auth/menu/outbox hooks. */
export function Person2StaffProvider({ value, children }: { value: StaffBridge; children: ReactNode }) {
  return <Bridge.Provider value={value}>{children}</Bridge.Provider>;
}
export function useStaffBridge() { return useContext(Bridge); }
