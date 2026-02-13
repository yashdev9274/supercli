'use server'

import { auth } from "@super/auth/server"
import prisma from "@super/db"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

export async function getUserProfile() {
    try {
      const session = await auth.api.getSession({
        headers: await headers()
      })
  
      if (!session?.user) {
        throw new Error("Unauthorized")
      }
  
      const user = await prisma.user.findUnique({
        where:{
          id:session.user.id
        },
        select:{
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        }
      })
  
      return user
    } catch (error) {
      console.error("Error fetching user profile:", error)
      return null
    }
  }


  export async function updateUserProfile(data: { name?: string; email?: string }) {
    try {
      const session = await auth.api.getSession({
        headers: await headers()
      })
  
      if (!session?.user) {
        throw new Error("Unauthorized")
      }
  
      const updateUser = await prisma.user.update({
        where:{
          id:session.user.id
        },
        data:{
          name:data.name,
          email:data.email
        },
        select:{
          id:true,
          name:true,
          email:true
        }
      });
  
      revalidatePath("/dashboard/settings", "page")
  
      return {
        success: true,
        user: updateUser
      }
    } catch (error) {
      console.error("Error updating user profile:", error)
      return { success: false, error: "Failed to update profile" }
    }
  }