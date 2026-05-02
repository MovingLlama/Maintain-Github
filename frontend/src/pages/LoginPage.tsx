import { Github } from 'lucide-react'
import { Button } from '../components/common/Button'

export function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center">
              <Github className="w-9 h-9 text-sky-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Maintain@Github</h1>
          <p className="mt-3 text-gray-400 text-sm">
            AI-powered GitHub repository management.<br />
            Edit, improve, and push with the power of AI agents.
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <a href="/auth/github/login" className="block">
            <Button className="w-full gap-3" size="lg">
              <Github className="w-5 h-5" />
              Continue with GitHub
            </Button>
          </a>
          <p className="text-center text-xs text-gray-500">
            By signing in, you agree to allow access to your GitHub repositories.
          </p>
        </div>

        <div className="text-center space-y-2">
          <p className="text-xs text-gray-600">Features</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-500">
            {['Browse Repos', 'AI Code Review', 'Agent Mode', 'Ollama + OpenRouter', 'Git Push'].map(f => (
              <span key={f} className="bg-gray-800 px-2 py-1 rounded-md">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
