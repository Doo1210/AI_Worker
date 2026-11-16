import type { AutomationDraft } from '@/stores/personalAutomations'

export const automationChatExample = '每周五下午 5 点提醒我整理周报。'

const hours = /(?:(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)[ \t]*|(?<!\d))([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})(?:[ \t]*[:：][ \t]*([0-9]{2})|[ \t]*[点时](?:[ \t]*(半|[0-9]{1,2}(?:分)?|[零〇一二两三四五六七八九十]{1,3}分|整(?!理)))?)(?!\d)/g
const dates = /(?:(\d{4})[-\/年])?(\d{1,2})[-\/月](\d{1,2})(?:日|号|T(?=\d{1,2}:))?/g
const relativeDays = /今天|明天|后天/g
const weekdays = /(本|这|下)?(?:周|星期|礼拜)([日天一二三四五六])/g
const repetitions = /每天|每日|每周|每星期|每个星期|每礼拜|仅一次|只执行一次/g
const unsupportedSchedule = /每(?:个月|月|年|小时|分钟|隔)|隔天|隔日|(?:每个)?(?:工作日(?!报|志|历|记)|周末)(?=\s*(?:早|上|中|下|晚|\d|提醒))|(?:半|[\d一二两三四五六七八九十]+)\s*(?:分钟|小时|天|周)后/
const instructionLead = /^(?:[\s:：，,、。！？!?；;]|可以|能不能|请(?!求|假|示)|麻烦|帮我|给我|替我|创建(?:一个)?(?:自动化任务|定时任务)?|新建(?:一个)?(?:自动化任务|定时任务)?|设置(?:一个)?(?:提醒|自动化任务|定时任务)?|定时(?:提醒)?|提醒(?:我们|我)|(?:在|于)(?=\s|[,，]|提醒|$))+/u
const instructionVerbs = /^(?:整理|汇总|生成|统计|检查|分析|起草|写|备份|联系|打电话|开会|提交|复核|更新|记录|跟进|发送|查看|输出|提醒)/
const decline = /^(?:请\s*)?(?:不要|不用|先别|取消|别)/
const chineseDigits = '零一二三四五六七八九'
const weekDays = '日一二三四五六'

function toNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value)
  const normalized = value.replace('〇', '零').replace('两', '二')
  if (!normalized.includes('十')) return chineseDigits.indexOf(normalized)
  const [tens = '', units = '', invalid] = normalized.split('十')
  if (invalid !== undefined) return -1
  return (tens ? chineseDigits.indexOf(tens) : 1) * 10 + (units ? chineseDigits.indexOf(units) : 0)
}

function readClock(text: string) {
  const matches = [...text.matchAll(hours)]
  const match = matches.at(-1)
  if (!match) return
  const previous = matches.at(-2)
  if (previous && previous.index > text.lastIndexOf('\n', match.index)) return
  const [, period, hourText = '', clockMinute, spokenMinute = ''] = match
  let hour = toNumber(hourText)
  const minute = clockMinute ? Number(clockMinute)
    : spokenMinute === '半' ? 30
      : spokenMinute && spokenMinute !== '整' ? toNumber(spokenMinute.replace(/分$/, '')) : 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return
  if (period && hour === 0 && period !== '凌晨') return
  if (period === '凌晨' && hour === 12) hour = 0
  if (/^(中午|下午|傍晚|晚上|夜里)$/.test(period ?? '') && hour < 12) hour += 12
  return { hour, minute }
}

function readDate(text: string, now: Date, isWeekly: boolean) {
  const date = new Date(now)
  const explicitDate = [...text.matchAll(dates)].at(-1)
  const relativeDay = [...text.matchAll(relativeDays)].at(-1)
  const weekday = [...text.matchAll(weekdays)].at(-1)
  if (isWeekly && !weekday) return

  if (explicitDate && (explicitDate.index ?? 0) > (relativeDay?.index ?? -1)) {
    const [, year, month, day] = explicitDate
    date.setFullYear(year ? Number(year) : now.getFullYear(), Number(month) - 1, Number(day))
    if (date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return
    return { date, weekday, hasDate: true }
  }

  if (relativeDay) date.setDate(date.getDate() + ['今天', '明天', '后天'].indexOf(relativeDay[0]))
  return { date, weekday, hasDate: Boolean(relativeDay) }
}

function instructionText(value: string) {
  const text = value.replace(instructionLead, '').replace(/[\s。！？!?；;，,、]+$/u, '').trim()
  if (!/[\p{L}\p{N}]/u.test(text)
    || /^(?:每|从|自|开始|执行|时间|任务|自动化任务|定时任务|提醒|运行|就行|改成|改到|设为|定在|定为|吧|就好|可以|\s)+$/u.test(text)) return ''
  return text
}

function splitRequestLine(line: string) {
  const reminder = /提醒(?:我们|我)/.exec(line)
  if (reminder) {
    const timing = line.slice(0, reminder.index)
    if ([hours, repetitions, dates, relativeDays, weekdays, unsupportedSchedule].some(pattern => timing.search(pattern) !== -1)) {
      return { timing, instruction: instructionText(line.slice(reminder.index + reminder[0].length)) }
    }
  }
  const clock = line.matchAll(hours).next().value
  if (clock) {
    const end = (clock.index ?? 0) + clock[0].length
    const instruction = instructionText(line.slice(end))
    if (instructionVerbs.test(instruction)) return { timing: line.slice(0, end), instruction }
  }
  const onlyInstruction = instructionText(line)
  if (instructionVerbs.test(onlyInstruction)) return { timing: '', instruction: onlyInstruction }

  const instruction = instructionText(line
    .replace(dates, '')
    .replace(relativeDays, '')
    .replace(/每(?:个)?(?:周|星期|礼拜)[日天一二三四五六]/g, '')
    .replace(weekdays, '')
    .replace(repetitions, '')
    .replace(hours, ''))
  return { timing: line, instruction }
}

export function isAutomationRequest(text: string) {
  const normalized = text.normalize('NFKC').trim()
  if (decline.test(normalized) || /如何|怎么|为什么|是什么|什么意思|有哪些|是几点|介绍一下/.test(normalized)) return false
  return /(?:创建|新建|设置|安排)(?:一个|一条|个)?(?:自动化任务|定时任务|提醒)/.test(normalized)
    || /提醒我/.test(normalized) && (/(?:今天|明天|后天|定时|每天|每日|每周|每星期|周[日天一二三四五六])/.test(normalized)
      || unsupportedSchedule.test(normalized) || [...normalized.matchAll(dates)].length > 0)
    || /^(?:请|帮我|麻烦)?[ \t]*(?:每天|每日|每周|每星期|今天|明天|后天|周[日天一二三四五六])/.test(normalized)
      && normalized.search(hours) !== -1
}

export function parseAutomationRequest(text: string, now = new Date()): AutomationDraft | undefined {
  const normalized = text.normalize('NFKC').trim()
  const lines = normalized.split('\n')
  if (decline.test(normalized) || decline.test(lines.at(-1)?.trim() ?? '')) return
  const parts = lines.map(splitRequestLine)
  const schedule = parts.map(part => part.timing).join('\n')
  if (unsupportedSchedule.test(schedule)) return
  const repetition = [...schedule.matchAll(repetitions)].at(-1)?.[0]
  const frequency = repetition === '每天' || repetition === '每日' ? 'daily'
    : repetition?.startsWith('每') ? 'weekly' : 'once'
  const clock = readClock(schedule)
  const timing = readDate(schedule, now, frequency === 'weekly')
  const instruction = parts.map(part => part.instruction).filter(Boolean).join('\n')
  if (!clock || !timing || !instruction) return

  const { date, weekday, hasDate } = timing
  if (frequency === 'once' && !hasDate && !weekday) return
  date.setHours(clock.hour, clock.minute, 0, 0)
  if (date.getHours() !== clock.hour || date.getMinutes() !== clock.minute) return
  if (weekday && (!hasDate || frequency === 'weekly')) {
    const target = weekday[2] === '天' ? 0 : weekDays.indexOf(weekday[2] ?? '')
    const weekDay = (date.getDay() + 6) % 7
    const targetWeekDay = (target + 6) % 7
    let shift = (target - date.getDay() + 7) % 7
    if (weekday[1]) shift = targetWeekDay - weekDay + (weekday[1] === '下' ? 7 : 0)
    date.setDate(date.getDate() + shift)
    if (frequency === 'once' && !weekday[1] && date <= now) date.setDate(date.getDate() + 7)
  }
  if (date <= now && frequency === 'once') return
  const interval = frequency === 'weekly' ? 7 : 1
  if (date <= now) {
    const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
    date.setDate(date.getDate() + Math.floor(days / interval) * interval)
    if (date <= now) date.setDate(date.getDate() + interval)
  }
  if (date.getHours() !== clock.hour || date.getMinutes() !== clock.minute) return
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  const name = (instruction.split('\n')[0] ?? instruction).slice(0, 80)
  return { name, instruction: instruction.slice(0, 2000), frequency, startAt: local.toISOString().slice(0, 16) }
}
