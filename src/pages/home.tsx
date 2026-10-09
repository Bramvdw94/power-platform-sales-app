import { useCurrentUser } from "@/hooks/use-current-user"
import { PlaceholderPage } from "./placeholder"

export default function HomePage() {
  const { data } = useCurrentUser()
  const firstName = data?.user.fullName.split(" ")[0]
  return (
    <PlaceholderPage title="My work" ticket="#33">
      {firstName && <p>Welcome, {firstName}.</p>}
    </PlaceholderPage>
  )
}
