import type {Metadata} from "next";
import OfflineStatus from "@/components/offline-status";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {title:"Beans&Beats · Christmas Together",description:"Coffee booth development foundation"};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body><header><Link href="/">Beans&Beats</Link><span>Christmas Together 2026</span></header><main><OfflineStatus/>{children}</main></body></html>; }
