import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { requireAuth } from '@/modules/components/utils/auth-utils';
import React from 'react'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
    await requireAuth();
    
    return <DashboardContent />
  }
  