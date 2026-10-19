# 梯度下降演示器

通过参数地形实验台和训练动画，看看模型参数如何沿着损失地形移动。

## 参数地形实验台

换一个起点，调整训练设置，观察参数的移动轨迹。可以点击“单步前进”逐步查看，也可以点击“开始”连续播放。

<a href="/classroom/2026-fall/training-landscape/神经网络训练-参数地形实验台.html" target="_blank" rel="noopener">独立打开实验台</a>。演示右上角支持全屏；手机上也可以独立打开查看。

<iframe class="training-landscape-frame" src="/classroom/2026-fall/training-landscape/神经网络训练-参数地形实验台.html" title="神经网络训练：参数地形实验台" loading="lazy" allow="fullscreen" allowfullscreen></iframe>

<a href="/classroom/2026-fall/training-landscape/THREE-LICENSE.txt" target="_blank" rel="noopener">Three.js 许可说明</a>

## 训练动画：寻谷之旅

<video class="training-animation-video" controls playsinline preload="metadata" poster="/classroom/2026-fall/training-animation/视频预览.png" aria-label="神经网络训练的寻谷之旅（有声版）">
  <source src="/classroom/2026-fall/training-animation/神经网络训练的寻谷之旅.mp4" type="video/mp4" />
  你的浏览器暂不支持内嵌视频，请使用下方链接下载观看。
</video>

- <a href="/classroom/2026-fall/training-animation/神经网络训练的寻谷之旅.mp4" download="神经网络训练的寻谷之旅.mp4">下载视频（有声版）</a>

<style scoped>
.training-landscape-frame {
  display: block;
  width: 100%;
  min-width: 0;
  height: 840px;
  margin: 20px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
.training-animation-video {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  margin: 20px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: #111;
}
@media (max-width: 640px) {
  .training-landscape-frame {
    height: 760px;
  }
}
</style>
