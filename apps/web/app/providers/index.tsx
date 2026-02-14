'use client'

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { RepositoryListSkeleton } from "@/modules/repository/components/repository-skelaton"
import { useConnectRepository } from "@/modules/repository/hooks/use-connect-repositories"
import { useRepositories } from "@/modules/repository/hooks/use-repositories"
import { ExternalLink, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"


interface Repository {
    id: number
    name: string
    full_name: string
    description: string | null
    html_url: string | null
    stargazers_count: number
    language: string | null
    topics: string[]
    is_synced?: boolean
    isConnected?: boolean
  }

const RepositoryPage = () => {
    const {
      data,
      isLoading,
      isError,
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage
    } = useRepositories()

    const {mutate: connectRepo} = useConnectRepository()

    const [searchQuery, setSearchQuery] = useState("")
    const [localConnectingId, setLocalConnectingId] = useState<number | null>(null)

    const allRepositories = data?.pages.flatMap(page=>page) || []

    const filteredRepositories = allRepositories.filter((repo:Repository)=>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleConnect = (repo:Repository)=>{
      setLocalConnectingId(repo.id)
      connectRepo(
        { owner:repo.full_name.split("/")[0],
          repo:repo.name,
          githubId:repo.id},
        {
          onSettled:()=>setLocalConnectingId(null)
        }
      )
    }

    const observerTarget = useRef<HTMLDivElement>(null)


    useEffect(()=>{
      const observer = new IntersectionObserver(
        (entries)=>{
          if(entries[0].isIntersecting && hasNextPage && !isFetchingNextPage){
            fetchNextPage()
          }
        },
        {
          threshold:0.1
        }
      )
    
      const currentTarget = observerTarget.current
      if(currentTarget){
        observer.observe(currentTarget)
      }
    
      return ()=>{
        if(currentTarget){
          observer.unobserve(currentTarget)
        }
      }
    },[hasNextPage, isFetchingNextPage, fetchNextPage])
  
    return (
        <div className='space-y-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Repositories</h1>
          <p className='text-muted-foreground'>Manage and view all your GitHub repositories</p>
        </div>
        
        <div className='relative'>
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className='grid gap-4'>
          {
            filteredRepositories.map((repo: Repository) => (
              <Card key={repo.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{repo.name}</CardTitle>
                        <Badge variant="outline">{repo.language || "Unknown"}</Badge>
                        {repo.isConnected && <Badge variant="secondary">Connected</Badge>}
                      </div>
                      <CardDescription>{repo.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={repo.html_url ?? undefined} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        onClick={() => handleConnect(repo)}
                        disabled={localConnectingId === repo.id || repo.isConnected}
                        variant={repo.isConnected ? "outline" : "default"}
                      >
                        {localConnectingId === repo.id ? "Connecting..." : repo.isConnected ? "Connected" : "Connect"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>...</CardContent>
                </Card>
              ))
          }
        </div>
        <div ref={observerTarget} className='py-4'>
          {isFetchingNextPage && <RepositoryListSkeleton/>}
          {
            !hasNextPage && allRepositories.length > 0 && (
              <p className='text-center text-muted-foreground'>No More Rrepositories</p>
            )
          }
        </div>
      </div>
    )
  }
  
  export default RepositoryPage

