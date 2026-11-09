"use client";
import { useFormStatus } from "react-dom";
export function Submit({ children, style="primary" }:{children:React.ReactNode;style?:string}) {
  const { pending } = useFormStatus();
  return <button className={"btn "+style} type="submit" disabled={pending}>{pending?"Aguarde…":children}</button>;
}
