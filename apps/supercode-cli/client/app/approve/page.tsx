import { Suspense } from "react"
import { Spinner } from "@/components/ui/spinner"
import DeviceApproval from "./device-approval"

export const dynamic = "force-dynamic"

const ApprovePage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Spinner />
        </div>
      }
    >
      <DeviceApproval />
    </Suspense>
  )
}

export default ApprovePage
