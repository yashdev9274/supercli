"use client";

import { ProfileForm } from '@/modules/setings/components/profile-form';
import React from 'react'

const SettingPage = () => {
  return (
    <div className='space-y-6'>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and connected repositories</p>
      </div>
      <ProfileForm/>
    </div>
  )
}

export default SettingPage