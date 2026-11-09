"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function Refresh({ active }:{active:boolean}) {
  const router=useRouter();
  useEffect(()=>{
    if(!active)return;
    const handle=setInterval(()=>{if(document.visibilityState==="visible")router.refresh();},3500);
    return ()=>clearInterval(handle);
  },[active,router]);
  return null;
}
