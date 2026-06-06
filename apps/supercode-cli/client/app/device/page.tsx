import { Suspense } from "react"
import { Spinner } from "@/components/ui/spinner"
import DeviceCodeForm from "./device-code-form"

export const dynamic = "force-dynamic"

const DevicePage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Spinner />
        </div>
      }
    >
      <DeviceCodeForm />
    </Suspense>
  )
}

export default DevicePage
