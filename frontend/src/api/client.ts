import axios, { AxiosError } from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError) => {
    if (!error.response) {
      // Network error — backend not reachable
      const networkError = new Error(
        'ไม่สามารถเชื่อมต่อกับ Backend Server ได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์ทำงานอยู่ที่ port 8000'
      )
      return Promise.reject(networkError)
    }

    const status = error.response.status
    const data = error.response.data as { detail?: string; message?: string } | null

    let message = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'

    if (data?.detail) {
      message = data.detail
    } else if (data?.message) {
      message = data.message
    } else if (status === 404) {
      message = 'ไม่พบข้อมูลที่ร้องขอ'
    } else if (status === 422) {
      message = 'ข้อมูลที่ส่งไม่ถูกต้อง'
    } else if (status === 500) {
      message = 'เกิดข้อผิดพลาดภายใน Server'
    }

    return Promise.reject(new Error(message))
  }
)

export default apiClient
