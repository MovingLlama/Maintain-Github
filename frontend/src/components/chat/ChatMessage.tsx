import { Message } from '../../types'
import { Bot, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isMobile = useIsMobile()

  return (
    <div className={`flex gap-2 md:gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-sky-700' : 'bg-gray-700'
      }`}>
        {isUser ? <User className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-sky-400" />}
      </div>
      <div className={`${isMobile ? 'max-w-[85%]' : 'max-w-[80%]'} rounded-2xl px-3 py-2 md:px-4 md:py-3 ${
        isUser
          ? 'bg-sky-700 text-white rounded-tr-sm'
          : 'bg-gray-800 text-gray-100 rounded-tl-sm'
      }`}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            className="text-sm prose prose-invert prose-sm max-w-none"
            components={{
              code({ node, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '')
                const isBlock = !props.inline
                return isBlock ? (
                  <div className="overflow-x-auto">
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match?.[1] || 'text'}
                      PreTag="div"
                      className="!my-2 !rounded-lg text-xs"
                      customStyle={{ fontSize: '0.75rem' }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className="bg-gray-700 rounded px-1 py-0.5 text-xs font-mono" {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}
