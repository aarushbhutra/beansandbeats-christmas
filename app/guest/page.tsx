import type { Metadata } from "next";
import { GuestView } from "./guest-view";

export const metadata: Metadata = { title: "your order", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function GuestPage() {
  return <GuestView />;
}
