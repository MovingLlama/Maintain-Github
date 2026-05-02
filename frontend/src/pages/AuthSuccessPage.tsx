import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'

export function AuthSuccessPage() {
  const navigate = useNavigate()
  useEffect(() => {
    const t = setTimeout(() => navigate('/repos'), 1500)
    return () => clearTimeout(t)
  }, [navigate])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
        <h2 className="text-xl font-semibold text-white">Successfully logged in!</h2>
        <p className="text-gray-400 text-sm">Redirecting to your repositories...</p>
      </div>
    </div>
  )
}
