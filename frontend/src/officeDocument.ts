import type { DirectoryFile } from '@/workspaceDirectory'

const meetingRequest = /会议|纪要|周会|例会|行动项/
const summaryRequest = /汇总|整理|梳理|总结|周报|汇报|报告|提炼/
const actionLine = /待办|后续事项|行动项|下一步|后续安排|下周安排|截止/
const actionHeading = /^(?:待办|后续事项|行动项|下一步|后续安排|下周安排)[:：]?$/
const sectionHeading = /^(?:#{1,6}\s+|[一二三四五六七八九十]+[、.．])/

export function draftOfficeDocument(prompt: string, files: Pick<DirectoryFile, 'name' | 'dataUrl' | 'content'>[]) {
  const isMeeting = meetingRequest.test(prompt)
  if (!files.length || (!isMeeting && !summaryRequest.test(prompt))) return

  const title = isMeeting ? '会议纪要' : '材料汇总'
  const keyPoints: string[] = []
  const nextSteps: string[] = []
  const unavailable: string[] = []

  for (const [index, file] of files.entries()) {
    const supported = !file.dataUrl && /\.(?:md|txt|csv|tsv|json)$/i.test(file.name) && file.content.trim()
    if (!supported) {
      unavailable.push(file.name)
      continue
    }
    let readingActions = false
    let included = 0
    for (const line of file.content.slice(0, 24000).split(/\r?\n/)) {
      const item = line.trim()
      if (!item) continue
      if (sectionHeading.test(item) || actionHeading.test(item)) {
        readingActions = actionLine.test(item)
        continue
      }
      const quote = item.replace(/^(?:[-*•]\s*|\d+[.、]\s*)/, '')
      if (!quote) continue
      const destination = readingActions ? nextSteps : keyPoints
      const excerpt = quote.length > 180 ? quote.slice(0, 180) + '…' : quote
      destination.push(`- ${excerpt} [${index + 1}]`)
      included += 1
      if (included >= 8) break
    }
  }

  const lines = [
    `# ${title}`,
    '',
    isMeeting ? '## 纪要要点' : '## 材料要点',
    ...(keyPoints.length ? keyPoints : ['- 引用资料中暂无可提取的文字要点。']),
    '',
    isMeeting ? '## 后续事项' : '## 待跟进事项',
    ...(nextSteps.length ? nextSteps : ['- 请复核原文并补充约定的行动项、负责人和时间。']),
    '',
    '## 资料来源',
    ...files.map((file, index) => `- [${index + 1}] ${file.name}`),
    ...(unavailable.length ? ['', `需人工查阅：${unavailable.join('、')}。这些文件当前无法在本地提取文字。`] : []),
  ]
  return {
    text: `已按引用资料整理${title}草稿。打开产物可以核对来源、修改内容，并保存到指定目录。`,
    artifactName: `${title}草稿.md`,
    artifactContent: lines.join('\n'),
  }
}
