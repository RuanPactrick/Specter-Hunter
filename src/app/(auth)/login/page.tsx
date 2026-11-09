import { AccessForm } from "@/components/access-form";
import type { Search } from "@/components/ui";
export default async function Login({searchParams}:{searchParams:Promise<Search>}) {
  return <AccessForm mode="login" params={await searchParams}/>;
}
