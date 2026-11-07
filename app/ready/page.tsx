import type { Metadata } from "next";
import { Board } from "./board";

export const metadata: Metadata = { title: "ready to collect", robots: { index: false } };

export default function ReadyPage() {
  return <Board />;
}
