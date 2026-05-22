import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  BookOpen, GitBranch, Terminal, Shield, Zap, CheckCircle, HelpCircle,
  RefreshCw, Trash2, ArrowLeft, Sparkles, Lightbulb, Loader2, X, Play, AlertCircle
} from 'lucide-react'

import { listLocalRepos } from '../api/repositories'
import {
  listQuestions,
  generateQuestions,
  submitAnswer,
  resetQuestions,
  GenerateQuestionsPayload
} from '../api/interview'
import { useRepoStore } from '../stores/repoStore'
import { Button } from '../components/common/Button'
import { InterviewPrepQuestion, Repository } from '../types'

// Category customization settings
const CATEGORIES = [
  'Architecture & Design',
  'Codebase Logic & APIs',
  'Security & Vulnerabilities',
  'Performance & Scalability',
  'Testing & Quality'
]

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']

// Styling helper for category cards/badges
function getCategoryStyle(category: string) {
  switch (category) {
    case 'Architecture & Design':
      return {
        icon: GitBranch,
        badgeClass: 'bg-fuchsia-950/40 border-fuchsia-800/40 text-fuchsia-400',
        textClass: 'text-fuchsia-400',
        borderClass: 'border-fuchsia-900/30',
        glowClass: 'shadow-[0_0_15px_rgba(217,70,239,0.08)] hover:border-fuchsia-500/40',
        colorName: 'fuchsia'
      }
    case 'Codebase Logic & APIs':
      return {
        icon: Terminal,
        badgeClass: 'bg-sky-950/40 border-sky-800/40 text-sky-400',
        textClass: 'text-sky-400',
        borderClass: 'border-sky-900/30',
        glowClass: 'shadow-[0_0_15px_rgba(56,189,248,0.08)] hover:border-sky-500/40',
        colorName: 'sky'
      }
    case 'Security & Vulnerabilities':
      return {
        icon: Shield,
        badgeClass: 'bg-rose-950/40 border-rose-800/40 text-rose-400',
        textClass: 'text-rose-400',
        borderClass: 'border-rose-900/30',
        glowClass: 'shadow-[0_0_15px_rgba(251,113,133,0.08)] hover:border-rose-500/40',
        colorName: 'rose'
      }
    case 'Performance & Scalability':
      return {
        icon: Zap,
        badgeClass: 'bg-amber-950/40 border-amber-800/40 text-amber-400',
        textClass: 'text-amber-400',
        borderClass: 'border-amber-900/30',
        glowClass: 'shadow-[0_0_15px_rgba(251,191,36,0.08)] hover:border-amber-500/40',
        colorName: 'amber'
      }
    case 'Testing & Quality':
      return {
        icon: CheckCircle,
        badgeClass: 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-900/30',
        glowClass: 'shadow-[0_0_15px_rgba(52,211,153,0.08)] hover:border-emerald-500/40',
        colorName: 'emerald'
      }
    default:
      return {
        icon: HelpCircle,
        badgeClass: 'bg-gray-950/40 border-gray-800/40 text-gray-400',
        textClass: 'text-gray-400',
        borderClass: 'border-gray-800/30',
        glowClass: 'shadow-none hover:border-gray-600',
        colorName: 'gray'
      }
  }
}

// Styling helper for difficulty levels
function getDifficultyClass(difficulty: string) {
  switch (difficulty) {
    case 'Easy':
      return 'bg-emerald-950/30 border border-emerald-800/30 text-emerald-400'
    case 'Medium':
      return 'bg-amber-950/30 border border-amber-800/30 text-amber-400'
    case 'Hard':
      return 'bg-rose-950/30 border border-rose-800/30 text-rose-400'
    default:
      return 'bg-gray-800 border border-gray-700 text-gray-300'
  }
}

export function InterviewPage() {
  const { selectedRepo, setSelectedRepo } = useRepoStore()
  const qc = useQueryClient()

  // Filter States
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [selectedStatus, setSelectedStatus] = useState<string>('All')

  // Interactive UI Modal State
  const [activeQuestion, setActiveQuestion] = useState<InterviewPrepQuestion | null>(null)
  const [userAnswerInput, setUserAnswerInput] = useState<string>('')
  const [showConfirmReset, setShowConfirmReset] = useState<boolean>(false)

  // Custom Generator Form State
  const [formCategory, setFormCategory] = useState<string>('mixed')
  const [formDifficulty, setFormDifficulty] = useState<string>('Medium')
  const [formCount, setFormCount] = useState<number>(3)

  // Queries
  const { data: repositories = [], isLoading: reposLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: listLocalRepos
  })

  const {
    data: questions = [],
    isLoading: questionsLoading,
    refetch: refetchQuestions
  } = useQuery({
    queryKey: ['interview-questions', selectedRepo?.id],
    queryFn: () => listQuestions(selectedRepo!.id),
    enabled: !!selectedRepo && selectedRepo.status === 'ready'
  })

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (payload: GenerateQuestionsPayload) =>
      generateQuestions(selectedRepo!.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interview-questions', selectedRepo?.id] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || 'Generation failed'
      alert(`Error generating questions: ${msg}`)
    }
  })

  const submitAnswerMutation = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: string }) =>
      submitAnswer(questionId, answer),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['interview-questions', selectedRepo?.id] })
      // Update active question state to reflect completion
      if (activeQuestion && activeQuestion.id === data.question_id) {
        setActiveQuestion(prev =>
          prev
            ? {
                ...prev,
                is_completed: data.is_completed,
                user_answer: data.user_answer,
                feedback: data.feedback
              }
            : null
        )
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || 'Evaluation failed'
      alert(`Error evaluating answer: ${msg}`)
    }
  })

  const resetMutation = useMutation({
    mutationFn: () => resetQuestions(selectedRepo!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interview-questions', selectedRepo?.id] })
      setShowConfirmReset(false)
      setActiveQuestion(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || 'Reset failed'
      alert(`Error resetting questions: ${msg}`)
    }
  })

  // Handle baseline question generation manually if none exist
  const handleGenerateBaseline = () => {
    generateMutation.mutate({
      count: 5,
      category: null,
      difficulty: 'Medium'
    })
  }

  // Handle custom manual generation submit
  const handleCustomGenerate = (e: React.FormEvent) => {
    e.preventDefault()
    generateMutation.mutate({
      count: formCount,
      category: formCategory === 'mixed' ? null : formCategory,
      difficulty: formDifficulty
    })
  }

  // Open question details dialog
  const handleOpenQuestion = (question: InterviewPrepQuestion) => {
    setActiveQuestion(question)
    setUserAnswerInput(question.user_answer || '')
  }

  // Submit written response for review
  const handleSubmitAnswer = () => {
    if (!activeQuestion || !userAnswerInput.trim()) return
    submitAnswerMutation.mutate({
      questionId: activeQuestion.id,
      answer: userAnswerInput
    })
  }

  // Clean-up and go back to repo selector
  const handleClearRepo = () => {
    setSelectedRepo(null)
    setActiveQuestion(null)
  }

  // Category and difficulty progress metrics
  const progressMetrics = useMemo(() => {
    if (questions.length === 0) {
      return {
        total: 0,
        completed: 0,
        pct: 0,
        categories: {} as Record<string, { total: number; completed: number }>
      }
    }

    const completed = questions.filter(q => q.is_completed).length
    const pct = Math.round((completed / questions.length) * 100)

    const catStats: Record<string, { total: number; completed: number }> = {}
    CATEGORIES.forEach(c => {
      catStats[c] = { total: 0, completed: 0 }
    })

    questions.forEach(q => {
      if (!catStats[q.category]) {
        catStats[q.category] = { total: 0, completed: 0 }
      }
      catStats[q.category].total += 1
      if (q.is_completed) {
        catStats[q.category].completed += 1
      }
    })

    return {
      total: questions.length,
      completed,
      pct,
      categories: catStats
    }
  }, [questions])

  // Filtered lists
  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchDiff = selectedDifficulty === 'All' || q.difficulty === selectedDifficulty
      const matchCat = selectedCategory === 'All' || q.category === selectedCategory
      const matchStat =
        selectedStatus === 'All' ||
        (selectedStatus === 'Solved' && q.is_completed) ||
        (selectedStatus === 'Unsolved' && !q.is_completed)
      return matchDiff && matchCat && matchStat
    })
  }, [questions, selectedDifficulty, selectedCategory, selectedStatus])

  // --- RENDERING STATE 1: Repo Selector ---
  if (!selectedRepo) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 bg-gray-950">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/20 p-6 md:p-8">
            <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4">
              <div className="bg-sky-500/10 border border-sky-500/20 p-3 rounded-xl max-w-max">
                <BookOpen className="w-8 h-8 text-sky-400" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                  Technical Interview Prep
                  <span className="text-xs bg-sky-900/40 text-sky-400 font-medium px-2 py-0.5 rounded-full border border-sky-800/40">AI Mock Practice</span>
                </h1>
                <p className="text-xs md:text-sm text-gray-400">
                  Select a synced repository below. Our AI Principal Engineer will review the specific file contents, APIs, architecture decisions, and design templates of the repo to design high-quality interview preparation questions.
                </p>
              </div>
            </div>
          </div>

          {/* Repo List Grid */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Your Synced Repositories
            </h2>

            {reposLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
                <p className="text-xs text-gray-500">Retrieving active repositories...</p>
              </div>
            ) : repositories.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-gray-800 rounded-xl space-y-4">
                <GitBranch className="w-10 h-10 text-gray-700 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">No active repositories found</p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Before starting interview practice, you need to import or clone a repository on the main Repositories tab.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {repositories.map((repo: Repository) => {
                  const isReady = repo.status === 'ready'
                  return (
                    <div
                      key={repo.id}
                      onClick={() => isReady && setSelectedRepo(repo)}
                      className={`relative overflow-hidden group bg-gray-900/40 border ${
                        isReady
                          ? 'border-gray-800 hover:border-sky-500/40 hover:shadow-[0_0_15px_rgba(56,189,248,0.06)] cursor-pointer'
                          : 'border-gray-850 opacity-60'
                      } rounded-xl p-5 transition-all duration-300`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 max-w-[75%]">
                          <p className="text-sm font-bold text-white group-hover:text-sky-400 transition-colors truncate">
                            {repo.name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{repo.full_name}</p>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-2">
                            {repo.description || 'No description available.'}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            isReady
                              ? 'bg-sky-950/40 text-sky-400 border border-sky-900/30'
                              : repo.status === 'cloning'
                              ? 'bg-amber-950/40 text-amber-400 border border-amber-900/30 animate-pulse'
                              : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {repo.status.toUpperCase()}
                        </span>
                      </div>

                      {isReady && (
                        <div className="mt-4 pt-3 border-t border-gray-850 flex items-center justify-end text-xs font-semibold text-sky-400 group-hover:translate-x-1 transition-transform">
                          Open Prep Dashboard &rarr;
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- RENDERING STATE 2: Ready Repo Practice Page ---
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 bg-gray-950">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Navigation Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleClearRepo}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Switch Repository
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-sky-950/40 border border-sky-900/30 text-sky-400 font-mono px-2 py-1 rounded">
              Current: {selectedRepo.name}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-950/20 text-xs gap-1.5"
              onClick={() => setShowConfirmReset(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Questions
            </Button>
          </div>
        </div>

        {/* Loading / Processing Overlays */}
        {(generateMutation.isPending || questionsLoading) && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4 text-center">
            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute w-20 h-20 bg-sky-500/10 rounded-full animate-ping" />
              <Loader2 className="w-12 h-12 animate-spin text-sky-500 relative z-10" />
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 justify-center">
              <Sparkles className="w-5 h-5 text-sky-400" />
              Principal AI Engineer analyzing repo...
            </h3>
            <p className="text-xs text-gray-400 max-w-sm mt-2">
              This process indexes key source code files, configurations, and structures to design custom, repo-specific software engineering interview questions. Please wait up to 60 seconds...
            </p>
          </div>
        )}

        {/* Reset Confirmation Overlay */}
        {showConfirmReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">Reset Prep Questions?</h3>
                  <p className="text-xs text-gray-400">
                    This will permanently delete all interview preparation questions, user written responses, and AI evaluations for <span className="font-mono text-gray-300">{selectedRepo.name}</span>. This action is irreversible.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setShowConfirmReset(false)}>Cancel</Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => resetMutation.mutate()}
                  isLoading={resetMutation.isPending}
                >
                  Confirm Delete All
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Empty / Welcome Screen State (No Questions Generated) */}
        {!questionsLoading && questions.length === 0 && (
          <div className="bg-gradient-to-br from-gray-900 to-sky-950/20 border border-gray-800 rounded-2xl p-6 md:p-10 text-center space-y-6 max-w-2xl mx-auto shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-60 h-60 bg-sky-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="bg-sky-500/10 border border-sky-500/20 p-4 rounded-full max-w-max mx-auto">
              <BookOpen className="w-10 h-10 text-sky-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl md:text-2xl font-bold text-white">AI-Powered Mock Interviews</h2>
              <p className="text-xs md:text-sm text-gray-400 leading-relaxed max-w-lg mx-auto">
                Welcome to practice mode! We extract key context from <span className="font-mono text-gray-300">{selectedRepo.name}</span> to generate challenging, code-grounded interview prep questions across categories like Architecture, Performance, Security, logic and more.
              </p>
            </div>

            <div className="p-4 bg-gray-950/40 border border-gray-850 rounded-xl space-y-3 max-w-md mx-auto">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                Baseline Generation Set
              </h4>
              <p className="text-[11px] text-gray-500">
                Generate a default set of 5 questions (1 from each category at Medium difficulty) to test your code comprehension instantly.
              </p>
              <Button
                variant="primary"
                onClick={handleGenerateBaseline}
                disabled={generateMutation.isPending}
                className="w-full text-xs"
              >
                Generate 5 Baseline Questions
              </Button>
            </div>

            <div className="pt-2 border-t border-gray-850 max-w-md mx-auto">
              <span className="text-xs text-gray-500">Or use the custom generator controls below the page to customize your setup.</span>
            </div>
          </div>
        )}

        {/* --- MAIN PAGE LAYOUT: Metrics + Generator Panel + Grid --- */}
        {questions.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-3 items-start">
            {/* LEFT / TOP STATS COLUMN */}
            <div className="lg:col-span-1 space-y-6">
              {/* Overall Completion Card */}
              <div className="bg-gray-900/40 backdrop-blur-md border border-gray-850 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Preparation Metrics</h3>
                  <span className="text-xs font-mono text-sky-400 bg-sky-950/40 border border-sky-900/30 px-2 py-0.5 rounded">
                    {progressMetrics.completed} / {progressMetrics.total} Solved
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Total Completion</span>
                    <span className="font-bold text-white">{progressMetrics.pct}%</span>
                  </div>
                  <div className="w-full bg-gray-950 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-sky-400 to-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressMetrics.pct}%` }}
                    />
                  </div>
                </div>

                {/* Category Metric Breakdown */}
                <div className="pt-3 border-t border-gray-850 space-y-2.5">
                  <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">By Focus Area</h4>
                  {CATEGORIES.map(cat => {
                    const stat = progressMetrics.categories[cat] || { total: 0, completed: 0 }
                    const catPct = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0
                    const styles = getCategoryStyle(cat)
                    const CatIcon = styles.icon

                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-400 flex items-center gap-1.5">
                            <CatIcon className={`w-3.5 h-3.5 ${styles.textClass}`} />
                            {cat}
                          </span>
                          <span className="font-mono text-gray-500">
                            {stat.completed}/{stat.total}
                          </span>
                        </div>
                        <div className="w-full bg-gray-950 rounded-full h-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${styles.badgeClass.split(' ')[2]}`}
                            style={{ width: `${catPct}%`, backgroundColor: 'currentColor' }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Custom Generator Form Card */}
              <div className="bg-gray-900/40 backdrop-blur-md border border-gray-850 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
                  <h3 className="text-sm font-bold text-white">Custom Question Generator</h3>
                </div>

                <form onSubmit={handleCustomGenerate} className="space-y-4">
                  {/* Select Category */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 font-medium">Focus Category</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg p-2.5 focus:outline-none focus:border-sky-500 transition-colors"
                    >
                      <option value="mixed">General Mixed Set</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Select Difficulty */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 font-medium">Difficulty Level</label>
                    <div className="grid grid-cols-3 gap-2">
                      {DIFFICULTIES.map(diff => {
                        const isSelected = formDifficulty === diff
                        return (
                          <button
                            key={diff}
                            type="button"
                            onClick={() => setFormDifficulty(diff)}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all text-center ${
                              isSelected
                                ? 'bg-sky-500/10 border-sky-500 text-sky-400 font-bold'
                                : 'bg-gray-950 border-gray-800 hover:border-gray-700 text-gray-400'
                            }`}
                          >
                            {diff}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Select Count */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 font-medium">Question Batch Size</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 5].map(cnt => {
                        const isSelected = formCount === cnt
                        return (
                          <button
                            key={cnt}
                            type="button"
                            onClick={() => setFormCount(cnt)}
                            className={`py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all text-center ${
                              isSelected
                                ? 'bg-sky-500/10 border-sky-500 text-sky-400 font-bold'
                                : 'bg-gray-950 border-gray-800 hover:border-gray-700 text-gray-400'
                            }`}
                          >
                            {cnt}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full text-xs mt-2 py-2"
                    disabled={generateMutation.isPending}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Generate Questions
                  </Button>
                </form>
              </div>
            </div>

            {/* RIGHT MAIN LIST COLUMN */}
            <div className="lg:col-span-2 space-y-4">
              {/* Question list controls & filters */}
              <div className="bg-gray-900/40 backdrop-blur-md border border-gray-850 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                {/* Solved Filter */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="bg-gray-950 border border-gray-850 text-gray-300 text-xs rounded-lg p-2 focus:outline-none focus:border-sky-500 transition-colors"
                  >
                    <option value="All">All Focus Areas</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  <select
                    value={selectedDifficulty}
                    onChange={e => setSelectedDifficulty(e.target.value)}
                    className="bg-gray-950 border border-gray-850 text-gray-300 text-xs rounded-lg p-2 focus:outline-none focus:border-sky-500 transition-colors"
                  >
                    <option value="All">All Difficulties</option>
                    {DIFFICULTIES.map(diff => (
                      <option key={diff} value={diff}>{diff}</option>
                    ))}
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={e => setSelectedStatus(e.target.value)}
                    className="bg-gray-950 border border-gray-850 text-gray-300 text-xs rounded-lg p-2 focus:outline-none focus:border-sky-500 transition-colors"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Solved">Completed</option>
                    <option value="Unsolved">Pending Review</option>
                  </select>
                </div>

                <div className="text-[11px] font-medium text-gray-500 font-mono">
                  {filteredQuestions.length} Match{filteredQuestions.length !== 1 ? 'es' : ''}
                </div>
              </div>

              {/* Empty state under filter match */}
              {filteredQuestions.length === 0 ? (
                <div className="bg-gray-900/20 border border-dashed border-gray-850 rounded-xl py-16 text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-gray-700 mx-auto" />
                  <p className="text-sm font-medium text-gray-400">No questions match your current filters</p>
                  <p className="text-xs text-gray-500">Try relaxing your filter parameters or generate more questions.</p>
                </div>
              ) : (
                /* Question Feed */
                <div className="grid gap-4">
                  {filteredQuestions.map((q: InterviewPrepQuestion) => {
                    const catStyles = getCategoryStyle(q.category)
                    const CatIcon = catStyles.icon

                    return (
                      <div
                        key={q.id}
                        onClick={() => handleOpenQuestion(q)}
                        className={`relative overflow-hidden group bg-gray-900/30 border border-gray-850 hover:bg-gray-900/50 rounded-xl p-5 cursor-pointer transition-all duration-300 ${catStyles.glowClass}`}
                      >
                        {/* Glowing category-specific bottom accent */}
                        <div className={`absolute bottom-0 left-0 right-0 h-[2px] transition-all opacity-20 group-hover:opacity-100 ${catStyles.badgeClass.split(' ')[2]}`} style={{ backgroundColor: 'currentColor' }} />

                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-3 text-xs mb-3">
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${catStyles.badgeClass}`}>
                            <CatIcon className="w-3 h-3" />
                            {q.category}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getDifficultyClass(q.difficulty)}`}>
                              {q.difficulty}
                            </span>
                            {q.is_completed ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded-full">
                                <CheckCircle className="w-3 h-3" />
                                Solved
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-gray-400 bg-gray-800/40 border border-gray-800 px-2 py-0.5 rounded-full">
                                Pending Answer
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Question Text */}
                        <p className="text-sm font-semibold text-white group-hover:text-sky-400 transition-colors line-clamp-3 leading-relaxed">
                          {q.question}
                        </p>

                        {/* Date Generated */}
                        <div className="mt-4 pt-3 border-t border-gray-900 flex items-center justify-between text-[10px] text-gray-500 font-mono">
                          <span>Created {new Date(q.created_at).toLocaleDateString()}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity font-semibold text-sky-400">
                            Practice now &rarr;
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- MODAL DIALOG CONTAINER: Interactive Q&A Review Panel --- */}
        {activeQuestion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={() => setActiveQuestion(null)}>
            <div
              className="bg-gray-900 border border-gray-850 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-850 bg-gray-900/50 flex items-center justify-between shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-medium ${getCategoryStyle(activeQuestion.category).badgeClass}`}>
                    {activeQuestion.category}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getDifficultyClass(activeQuestion.difficulty)}`}>
                    {activeQuestion.difficulty}
                  </span>
                  {activeQuestion.is_completed ? (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Solved
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-850 border border-gray-800 px-2 py-0.5 rounded-full">
                      Practice Mock
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setActiveQuestion(null)}
                  className="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content Scrollable Area */}
              <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
                {/* Question Section */}
                <div className="bg-gray-950 border border-gray-850 rounded-xl p-5 md:p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 w-[4px] bg-sky-500" />
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Interview Question
                  </h4>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className="text-sm md:text-base font-semibold text-white prose prose-invert max-w-none prose-sm leading-relaxed"
                  >
                    {activeQuestion.question}
                  </ReactMarkdown>
                </div>

                {/* Split layout: Answer form or comparative review */}
                {!activeQuestion.is_completed ? (
                  /* PRACTICE MODE: Write answer form */
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your Written Answer</label>
                        <span className="text-[10px] text-gray-500">Ground your answer in code files or components when possible.</span>
                      </div>
                      <textarea
                        value={userAnswerInput}
                        onChange={e => setUserAnswerInput(e.target.value)}
                        placeholder="Explain your approach, reference patterns/files from this repository, and structure your explanation cleanly..."
                        rows={10}
                        className="w-full bg-gray-950 border border-gray-850 focus:border-sky-500 rounded-xl p-4 text-sm font-sans text-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all duration-200"
                        disabled={submitAnswerMutation.isPending}
                      />
                    </div>
                    <div className="flex items-center justify-end pt-2">
                      <Button
                        variant="primary"
                        onClick={handleSubmitAnswer}
                        disabled={!userAnswerInput.trim() || submitAnswerMutation.isPending}
                        isLoading={submitAnswerMutation.isPending}
                        className="text-xs"
                      >
                        Submit Response for AI Grading & Review
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* EVALUATED STATE: Display answer, review & model answer rubrics */
                  <div className="space-y-6">
                    {/* User submitted answer block */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Your Response</h4>
                      <div className="bg-gray-950/70 border border-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto">
                        <p className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                          {activeQuestion.user_answer}
                        </p>
                      </div>
                    </div>

                    {/* AI Feedback Section */}
                    <div className="space-y-2.5">
                      <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Constructive Review (Principal Engineer AI)
                      </h4>
                      <div className="bg-gradient-to-br from-emerald-950/10 to-transparent border border-emerald-900/30 rounded-xl p-5 space-y-4">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          className="text-sm prose prose-invert max-w-none prose-emerald text-gray-200 leading-relaxed"
                          components={{
                            code({ node, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '')
                              const isBlock = !props.inline
                              return isBlock ? (
                                <div className="overflow-x-auto my-2">
                                  <SyntaxHighlighter
                                    style={oneDark}
                                    language={match?.[1] || 'text'}
                                    PreTag="div"
                                    className="!my-0 !rounded-lg text-xs"
                                    customStyle={{ fontSize: '0.75rem' }}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className="bg-emerald-950/40 border border-emerald-900/30 text-emerald-400 rounded px-1 py-0.5 text-xs font-mono" {...props}>
                                  {children}
                                </code>
                              )
                            }
                          }}
                        >
                          {activeQuestion.feedback || ''}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Model Answer Rubric section */}
                    <div className="space-y-2.5">
                      <h4 className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                        <Lightbulb className="w-3.5 h-3.5 text-sky-400" />
                        AI Model Answer & Rubric
                      </h4>
                      <div className="bg-gray-950 border border-gray-850 rounded-xl p-5 space-y-4">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          className="text-sm prose prose-invert max-w-none text-gray-300 leading-relaxed"
                          components={{
                            code({ node, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '')
                              const isBlock = !props.inline
                              return isBlock ? (
                                <div className="overflow-x-auto my-2">
                                  <SyntaxHighlighter
                                    style={oneDark}
                                    language={match?.[1] || 'text'}
                                    PreTag="div"
                                    className="!my-0 !rounded-lg text-xs"
                                    customStyle={{ fontSize: '0.75rem' }}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className="bg-sky-950/30 border border-sky-900/30 text-sky-400 rounded px-1.5 py-0.5 text-xs font-mono" {...props}>
                                  {children}
                                </code>
                              )
                            }
                          }}
                        >
                          {activeQuestion.answer}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-850 bg-gray-900/50 flex justify-end shrink-0">
                <Button size="sm" variant="secondary" onClick={() => setActiveQuestion(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
