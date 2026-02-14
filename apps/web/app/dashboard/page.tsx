import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { requireAuth } from '@/modules/components/utils/auth-utils';
import React from 'react'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
    await requireAuth();
    
    return (
      <>
        <DashboardHeader />
        <DashboardContent />
      </>
    );
  }
  