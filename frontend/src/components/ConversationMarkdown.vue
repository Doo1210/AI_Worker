<script lang="ts">
import { Marked } from 'marked'

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

const markdown = new Marked({
  breaks: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens)
      if (!/^https?:\/\//i.test(href)) return label
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    },
  },
})
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()
const rendered = computed(() => markdown.parse(props.text, { async: false }))
</script>

<template>
  <div class="conversation-markdown" v-html="rendered"></div>
</template>

<style scoped>
.conversation-markdown { min-width: 0; overflow-wrap: anywhere; line-height: 1.75; }
.conversation-markdown > :deep(:first-child) { margin-top: 0; }
.conversation-markdown > :deep(:last-child) { margin-bottom: 0; }
.conversation-markdown :deep(p) { margin: 0 0 10px; }
.conversation-markdown :deep(:is(h1, h2, h3, h4, h5, h6)) { margin: 16px 0 6px; font-size: 1.12em; line-height: 1.45; }
.conversation-markdown :deep(:is(ol, ul)) { margin: 6px 0 12px; padding-inline-start: 1.45em; }
.conversation-markdown :deep(blockquote) { margin: 8px 0; padding: 2px 10px; border-inline-start: 2px solid var(--line); color: var(--muted); }
.conversation-markdown :deep(a) { color: var(--accent); text-decoration: underline; }
.conversation-markdown :deep(pre) { overflow: auto; margin: 10px 0; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-surface); background: var(--surface-muted); }
.conversation-markdown :deep(code) { padding: 2px 4px; border-radius: 3px; background: var(--surface-muted); font-size: .92em; }
.conversation-markdown :deep(pre code) { padding: 0; background: transparent; }
.conversation-markdown :deep(table) { display: block; overflow: auto; margin: 10px 0; border-collapse: collapse; }
.conversation-markdown :deep(:is(th, td)) { padding: 6px 10px; border: 1px solid var(--line); text-align: start; }
.conversation-markdown :deep(th) { background: var(--surface-muted); }
</style>
