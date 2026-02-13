'use client'

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getUserProfile, updateUserProfile } from "../action";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProfileForm(){
    const queryClient = useQueryClient();
    const [name , setName] = useState("")
    const [email , setEmail] = useState("")
  
    const {data:profile , isLoading} = useQuery({
      queryKey:["user-profile"],
      queryFn:async()=>await getUserProfile(),
      staleTime:1000 * 60 * 5,
      refetchOnWindowFocus:false
    });
  
    useEffect(()=>{
      if(profile){
        setName(profile.name || "");
        setEmail(profile.email || "")
      }
    },[profile])
  
    const updateMutation = useMutation({
      mutationFn: async (data: { name: string; email: string }) => {
        return await updateUserProfile(data);
      },
      onSuccess:(result)=>{
        if(result?.success){
          queryClient.invalidateQueries({queryKey:["user-profile"]})
          toast.success("Profile updated successfully")
        }
      },
      onError:()=>toast.error("Failed to update profile")
    })
  
    const handleSubmit = (e:React.FormEvent)=>{
      e.preventDefault();
      updateMutation.mutate({name , email})
    }
  
    if (isLoading) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
            <CardDescription>Update your profile information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-muted rounded"></div>
              <div className="h-10 bg-muted rounded"></div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }