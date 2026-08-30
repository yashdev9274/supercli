"use client"

import { ProfileForm } from "@/modules/setings/components/profile-form"
import { RepositoryList } from "@/modules/setings/components/repository-list"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Blocks } from "lucide-react"

const SettingPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and connected repositories
        </p>
      </div>
      <ProfileForm />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Blocks className="h-5 w-5" />
            App integrations
          </CardTitle>
          <CardDescription>
            Connect Slack and Linear for PR review notifications (via Composio).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/integrations">Manage integrations</Link>
          </Button>
        </CardContent>
      </Card>
      <RepositoryList />
    </div>
  )
}

export default SettingPage
