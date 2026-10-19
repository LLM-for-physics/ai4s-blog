# 计算图与反向传播

从一个可以手算的模型出发，逐步查看正向计算、梯度的反向传播和参数更新。点击演示中的“下一步”，跟着计算图走一遍。

<a href="/classroom/2026-fall/autograd/index.html" target="_blank" rel="noopener">独立打开演示</a>。手机上也可以独立打开，获得更大的查看空间。

<iframe class="backprop-demo-frame" src="/classroom/2026-fall/autograd/index.html" title="计算图与反向传播课堂演示" loading="lazy" allow="fullscreen" allowfullscreen></iframe>

## 配套文件

- <a href="/classroom/2026-fall/autograd/autograd_demo.py" download="autograd_demo.py">下载 PyTorch 示例代码（autograd_demo.py）</a>
- <a href="/classroom/2026-fall/autograd/README.md" download="README.md">下载使用说明（README.md）</a>

<style scoped>
.backprop-demo-frame {
  display: block;
  width: 100%;
  min-width: 0;
  height: 840px;
  margin: 20px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
@media (max-width: 640px) {
  .backprop-demo-frame {
    height: 720px;
  }
}
</style>
