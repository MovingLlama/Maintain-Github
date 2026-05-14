import { useState } from 'react'
import { FileTreeItem } from '../../types'
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react'

interface FileTreeProps {
  files: FileTreeItem[]
  onFileSelect: (path: string) => void
  selectedFile: string | null
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children: TreeNode[]
}

function buildTree(items: FileTreeItem[]): TreeNode[] {
  const root: TreeNode[] = []
  const map: Record<string, TreeNode> = {}

  // Sort: directories first, then files, both alphabetically
  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  for (const item of sorted) {
    const parts = item.path.split('/')
    let currentLevel = root

    for (let i = 0; i < parts.length; i++) {
      const partPath = parts.slice(0, i + 1).join('/')
      if (!map[partPath]) {
        const isLast = i === parts.length - 1
        const node: TreeNode = {
          name: parts[i],
          path: partPath,
          type: isLast ? item.type : 'directory',
          children: [],
        }
        map[partPath] = node
        currentLevel.push(node)
      }
      currentLevel = map[partPath].children
    }
  }

  return root
}

interface TreeNodeViewProps {
  node: TreeNode
  depth: number
  onFileSelect: (path: string) => void
  selectedFile: string | null
}

function TreeNodeView({ node, depth, onFileSelect, selectedFile }: TreeNodeViewProps) {
  const [open, setOpen] = useState(depth < 2)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen((o: boolean) => !o)}
          className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded hover:bg-gray-800 text-gray-300 text-xs group"
          style={{ paddingLeft: `${4 + depth * 12}px` }}
        >
          {open
            ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
            : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
          {open
            ? <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            : <Folder className="w-3.5 h-3.5 text-sky-400/70 shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children.map(child => (
          <TreeNodeView
            key={child.path}
            node={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
          />
        ))}
      </div>
    )
  }

  const isSelected = selectedFile === node.path

  return (
    <button
      onClick={() => onFileSelect(node.path)}
      className={[
        'flex items-center gap-1 w-full text-left px-1 py-0.5 rounded text-xs',
        isSelected
          ? 'bg-sky-600/20 text-sky-300'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
      ].join(' ')}
      style={{ paddingLeft: `${4 + depth * 12}px` }}
    >
      <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function FileTree({ files, onFileSelect, selectedFile }: FileTreeProps) {
  const tree = buildTree(Array.isArray(files) ? files : [])

  if (tree.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-4">No files found</p>
  }

  return (
    <div className="space-y-0.5">
      {tree.map(node => (
        <TreeNodeView
          key={node.path}
          node={node}
          depth={0}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
        />
      ))}
    </div>
  )
}
