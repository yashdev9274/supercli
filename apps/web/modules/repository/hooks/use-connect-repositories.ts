import { toast } from "sonner"
import { connectRepository } from "../action"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export const useConnectRepository = ()=>{
    const queryClient = useQueryClient()
  
    return useMutation({
        mutationFn:async({owner , repo , githubId}:{owner:string , repo:string , githubId:number})=>{
            return await connectRepository(owner , repo , githubId)
        },
        onSuccess:()=>{
            toast.success("Repository connected successfully"),
            queryClient.invalidateQueries({queryKey:["repositories"]})
        },
        onError: (error) => {
            toast.error("Failed to connect repository")
            console.error(error)
        },
    })
}
