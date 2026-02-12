import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function RepositoryCardSkeleton() {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-5 w-20" />
                        </div>
                        <Skeleton className="h-4 w-full max-w-md" />
                    </div>
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-9" />
                        <Skeleton className="h-9 w-24" />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-16" />
                </div>
            </CardContent>
        </Card>
    )
}

export function RepositoryListSkeleton() {
    return (
        <div className="grid gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
                <RepositoryCardSkeleton key={i} />
            ))}
        </div>
    )
}