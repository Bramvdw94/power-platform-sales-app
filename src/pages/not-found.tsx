import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export default function NotFoundPage() {
  return (
    <div className="grid min-h-full place-items-center p-8">
      <div className="flex flex-col items-center space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">This page doesn't exist, or the link is out of date.</p>
        <Button variant="outline" asChild>
          <Link to="/">Go to Home</Link>
        </Button>
      </div>
    </div>
  )
}
