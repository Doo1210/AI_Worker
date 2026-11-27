import type { WorkspaceFile, WorkspaceFolder } from '@/stores/platform'

export interface WorkspaceDirectory {
  readonly spaceId?: string
  readonly folderId?: string
}

export type DirectoryFolder = Pick<WorkspaceFolder, 'id' | 'parentId' | 'name'>
export type DirectoryFile = Pick<WorkspaceFile, 'id' | 'folderId' | 'name' | 'type' | 'content' | 'dataUrl'>

export interface WorkspaceDirectoryDisplay {
  label: string
  path: string
}

export interface ResolvedWorkspaceDirectory extends WorkspaceDirectory, WorkspaceDirectoryDisplay {
  folders: DirectoryFolder[]
  files: DirectoryFile[]
  canWrite: boolean
}

export const fileCenterName = '文件中心'
export const personalFilesName = '我的文件'
export const sharedSpacesName = '共享空间'
const defaultDirectoryLabel = '默认工作目录'

export function workspaceFolderPath(folders: ReadonlyMap<string, DirectoryFolder>, folderId?: string) {
  const path: string[] = []
  const visited = new Set<string>()
  for (let folder = folders.get(folderId ?? ''); folder && !visited.has(folder.id); folder = folders.get(folder.parentId ?? '')) {
    path.unshift(folder.name)
    visited.add(folder.id)
  }
  return path
}

export function conversationDirectoryDisplay(
  spaceName: string | undefined, folders: ReadonlyMap<string, DirectoryFolder>, folderId?: string,
): WorkspaceDirectoryDisplay {
  const foldersInPath = workspaceFolderPath(folders, folderId)
  const root = spaceName === undefined ? [personalFilesName] : [sharedSpacesName, spaceName]
  return {
    label: foldersInPath.at(-1) ?? spaceName ?? defaultDirectoryLabel,
    path: [...root, ...foldersInPath].join(' / '),
  }
}

export function workspaceFolderTree(folders: readonly DirectoryFolder[], rootId: string) {
  const children = new Map<string, string[]>()
  for (const folder of folders) {
    if (folder.parentId === undefined) continue
    const siblings = children.get(folder.parentId) ?? []
    siblings.push(folder.id)
    children.set(folder.parentId, siblings)
  }
  const ids = new Set([rootId])
  for (const id of ids) {
    for (const child of children.get(id) ?? []) ids.add(child)
  }
  return ids
}
