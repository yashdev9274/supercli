import React from 'react'
import LoginUI from '@/modules/components/login-ui'
import { requireUnAuth } from '@/modules/components/utils/auth-utils'

const LoginPage = async() => {


    await requireUnAuth()
  return (
    <LoginUI />
  )
}

export default LoginPage
