"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ThumbsUp, ThumbsDown } from "lucide-react"

interface CommentRatingsCardProps {
  upvotes: number
  downvotes: number
}

export function CommentRatingsCard({ upvotes, downvotes }: CommentRatingsCardProps) {
  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base font-medium">
          Comment Ratings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <ThumbsUp className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{upvotes}</p>
              <p className="text-xs text-neutral-400">Upvotes</p>
            </div>
          </div>
          <div className="w-px h-12 bg-neutral-800" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <ThumbsDown className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{downvotes}</p>
              <p className="text-xs text-neutral-400">Downvotes</p>
            </div>
          </div>
          {upvotes + downvotes > 0 && (
            <>
              <div className="w-px h-12 bg-neutral-800" />
              <div>
                <p className="text-2xl font-semibold text-white">
                  {Math.round((upvotes / (upvotes + downvotes)) * 100)}%
                </p>
                <p className="text-xs text-neutral-400">Positive</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
