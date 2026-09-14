<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const dialog = ref<HTMLDialogElement>()
const closeButton = ref<HTMLButtonElement>()
const viewport = ref<HTMLElement>()
const photo = ref<{ src: string; alt: string; width: number } | null>(null)
const originalSize = ref(false)
const originals = new Map<HTMLImageElement, Map<string, string | null>>()
const enhancedAttributes = ['tabindex', 'role', 'aria-label', 'aria-haspopup', 'data-image-preview']
let observer: MutationObserver | undefined
let trigger: HTMLImageElement | null = null
let savedOverflow: string | null = null
let restoreFocus = true
let mounted = false
let backgroundPress: EventTarget | null = null

function isPreviewable(image: HTMLImageElement) {
  return image.closest('.vp-doc') &&
    image.alt.trim() &&
    !image.closest('[data-no-zoom]') &&
    !image.parentElement?.closest('a, button, [role="button"], [role="link"], [contenteditable="true"]') &&
    (!image.hasAttribute('role') || originals.has(image)) &&
    (!image.hasAttribute('tabindex') || originals.has(image))
}

function restoreImage(image: HTMLImageElement, attributes: Map<string, string | null>) {
  attributes.forEach((value, name) => {
    if (value === null) image.removeAttribute(name)
    else image.setAttribute(name, value)
  })
}

function enhanceImages() {
  for (const [image, attributes] of originals) {
    if (!image.isConnected || !isPreviewable(image)) {
      restoreImage(image, attributes)
      originals.delete(image)
    }
  }
  document.querySelectorAll<HTMLImageElement>('.vp-doc img').forEach(image => {
    if (!isPreviewable(image) || originals.has(image)) return
    originals.set(image, new Map(enhancedAttributes.map(name => [name, image.getAttribute(name)])))
    image.setAttribute('tabindex', '0')
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', `放大图片：${image.alt}`)
    image.setAttribute('aria-haspopup', 'dialog')
    image.setAttribute('data-image-preview', '')
  })
}

async function openImage(image: HTMLImageElement) {
  trigger = image
  restoreFocus = true
  originalSize.value = false
  const currentPhoto = { src: image.currentSrc || image.src, alt: image.alt, width: image.naturalWidth }
  photo.value = currentPhoto
  await nextTick()
  if (!mounted || photo.value?.src !== currentPhoto.src || !dialog.value || dialog.value.open) return
  savedOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
  closeButton.value?.focus({ preventScroll: true })
}

function finishClose() {
  if (dialog.value?.open) return
  photo.value = null
  originalSize.value = false
  backgroundPress = null
  if (savedOverflow !== null) {
    document.body.style.overflow = savedOverflow
    savedOverflow = null
  }
  if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true })
  trigger = null
}

function closePreview(focus = true) {
  restoreFocus = focus
  if (dialog.value?.open) dialog.value.close()
  else finishClose()
}

function onDocumentClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  if (!(event.target instanceof HTMLImageElement) || !isPreviewable(event.target)) return
  event.preventDefault()
  void openImage(event.target)
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
  if (!(event.target instanceof HTMLImageElement) || !isPreviewable(event.target)) return
  event.preventDefault()
  void openImage(event.target)
}

function onBackgroundClick(event: MouseEvent) {
  if (event.target === event.currentTarget && backgroundPress === event.target) closePreview()
  backgroundPress = null
}

async function toggleSize() {
  originalSize.value = !originalSize.value
  await nextTick()
  viewport.value?.scrollTo({ top: 0, left: 0 })
}

watch(() => route.path, () => {
  if (mounted) closePreview(false)
})

onMounted(() => {
  mounted = true
  enhanceImages()
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
  observer = new MutationObserver(enhanceImages)
  const content = document.querySelector('#VPContent')
  if (content) observer.observe(content, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  mounted = false
  observer?.disconnect()
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
  closePreview(false)
  finishClose()
  originals.forEach((attributes, image) => restoreImage(image, attributes))
  originals.clear()
})
</script>

<template>
  <dialog ref="dialog" class="course-image-preview" aria-label="图片预览" @close="finishClose">
    <div class="course-image-preview__toolbar">
      <span class="course-image-preview__title">图片预览</span>
      <button type="button" :aria-label="originalSize ? '适应窗口' : '查看原始尺寸'" @click="toggleSize">
        {{ originalSize ? '适应窗口' : '查看原始尺寸' }}
      </button>
      <button ref="closeButton" type="button" aria-label="关闭图片预览" autofocus @click="closePreview()">
        <span aria-hidden="true">×</span><span>关闭</span>
      </button>
    </div>
    <div
      ref="viewport"
      class="course-image-preview__viewport"
      :class="{ 'is-original': originalSize }"
      :tabindex="originalSize ? 0 : -1"
      role="region"
      aria-label="图片查看区域"
      @pointerdown="backgroundPress = $event.target"
      @click="onBackgroundClick"
    >
      <div
        class="course-image-preview__canvas"
        @click.self="onBackgroundClick"
      >
        <img
          v-if="photo"
          :src="photo.src"
          :alt="photo.alt"
          :style="originalSize && photo.width ? { width: photo.width + 'px' } : undefined"
        >
      </div>
    </div>
    <p class="course-image-preview__caption">{{ photo?.alt }}</p>
  </dialog>
</template>

<style>
.vp-doc img[data-image-preview] { cursor: zoom-in; }
.vp-doc img[data-image-preview]:focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

dialog.course-image-preview {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  color: #f5f5f5;
  background: transparent;
}
dialog.course-image-preview[open] {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}
dialog.course-image-preview::backdrop { background: rgba(0, 0, 0, .92); }
.course-image-preview__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
}
.course-image-preview__title { margin-right: auto; font-weight: 600; }
.course-image-preview__toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid #777;
  border-radius: 8px;
  color: #fff;
  background: #292929;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.course-image-preview__toolbar button:hover { background: #414141; }
.course-image-preview__toolbar button:focus-visible { outline: 3px solid #b7baff; outline-offset: 3px; }
.course-image-preview__toolbar button span[aria-hidden] { font-size: 26px; line-height: 1; }
.course-image-preview__viewport {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 12px 24px;
}
.course-image-preview__canvas {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.course-image-preview__viewport:focus-visible {
  outline: 2px solid #b7baff;
  outline-offset: -3px;
}
.course-image-preview__canvas img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.course-image-preview__viewport.is-original .course-image-preview__canvas {
  display: grid;
  width: max-content;
  height: max-content;
  min-width: 100%;
  min-height: 100%;
}
.course-image-preview__viewport.is-original img {
  max-width: none;
  max-height: none;
  margin: auto;
}
.course-image-preview__caption {
  max-height: 4.5em;
  overflow: auto;
  margin: 0;
  padding: 8px 20px max(16px, env(safe-area-inset-bottom));
  color: #ddd;
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
  overflow-wrap: anywhere;
}
@media (max-width: 480px) {
  .course-image-preview__title { display: none; }
  .course-image-preview__toolbar { justify-content: flex-end; }
  .course-image-preview__viewport { padding: 8px 12px; }
}
</style>
