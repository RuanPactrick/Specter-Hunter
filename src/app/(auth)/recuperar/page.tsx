import { AccessForm } from "@/components/access-form";
import type { Search } from "@/components/ui";
export default async function Recover({searchParams}:{searchParams:Promise<Search>}) {
  return <AccessForm mode="recover" params={await searchParams}/>;
}
