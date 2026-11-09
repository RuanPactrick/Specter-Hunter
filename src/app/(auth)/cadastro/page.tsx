import { AccessForm } from "@/components/access-form";
import type { Search } from "@/components/ui";
export default async function Signup({searchParams}:{searchParams:Promise<Search>}) {
  return <AccessForm mode="signup" params={await searchParams}/>;
}
