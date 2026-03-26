import axios from 'axios'


//const api = axios.create({ baseURL: '/api' }) // lo cambio para que funcione en PRODUCCIÓN
//const api = axios.create({ 
//  baseURL: import.meta.env.VITE_API_URL + '/api'
//})

//Esta funciona en desarrollo y producción 
// const baseURL = import.meta.env.VITE_API_URL 
//  ? `${import.meta.env.VITE_API_URL}/api`
//  : '/api'

//const api = axios.create({ baseURL })

const api = axios.create({ 
  baseURL: `${import.meta.env.VITE_API_URL}/api`
})


api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
