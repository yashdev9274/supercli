import { Sidebar } from '@/components/dashboard/sidebar'
import React from 'react'

const DashboardLayout = (
    {children}: {children: React.ReactNode}
) => {
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <main className="flex-1 overflow-y-auto overflow-x-hidden">
                {children}
              </main>
            </div>
        </div>
    )
}

export default DashboardLayout
