import { AccessForm } from "@/components/access-form";
import type { Search } from "@/components/ui";
import { identity } from "@/lib/auth";
export default async function Reset({searchParams}:{searchParams:Promise<Search>}) {
  await identity();
  return <AccessForm mode="reset" params={await searchParams}/>;
}
