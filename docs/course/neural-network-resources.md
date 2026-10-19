# 神经网络学习资料

建议先读入门文章，再通过交互演示观察模型行为；补充与进阶材料按兴趣选读。

## CNN：卷积神经网络

- **[An Intuitive Explanation of Convolutional Neural Networks — Ujjwal Karn](https://ujjwalkarn.me/2016/08/11/intuitive-explanation-convnets/)** · 入门阅读 · 英文

  从像素矩阵开始，用动画解释卷积、特征图、激活、池化和分类。

- **[Conv Nets: A Modular Perspective — Colah](https://colah.github.io/posts/2014-07-Conv-Nets-Modular/)** · 补充阅读 · 英文

  解释局部连接、参数共享及多层网络提取特征的设计动机。

- **[CNN Explainer](https://poloclub.github.io/cnn-explainer/)** · 交互演示 · 英文

  观察图像在网络中逐层变化，将局部卷积计算与完整分类流程联系起来。

## RNN／LSTM：循环神经网络

- **[The Unreasonable Effectiveness of Recurrent Neural Networks — Andrej Karpathy](https://karpathy.github.io/2015/05/21/rnn-effectiveness/)** · 入门阅读 · 英文

  用简短代码和字符预测例子解释隐藏状态、序列处理与文本生成；重点阅读前面的原理部分。

- **[Understanding LSTM Networks — Colah](https://colah.github.io/posts/2015-08-Understanding-LSTMs/)** · 补充阅读 · 英文

  在普通 RNN 的基础上，解释长期依赖、细胞状态及各个门的作用。

## Transformer

- **[The Illustrated Transformer — Jay Alammar](https://jalammar.github.io/illustrated-transformer/)** · 入门阅读 · 英文

  逐步解释 Q、K、V、自注意力、多头注意力、位置编码及整体结构。

- **[Transformer Explainer](https://poloclub.github.io/transformer-explainer/)** · 交互演示 · 英文

  输入文本，观察注意力和下一个 token 的预测，并调整采样参数。

文章讲经典编码器—解码器 Transformer，交互网站以 GPT-2 为例，两者结构有所不同。

## 扩散模型

- **[The Illustrated Stable Diffusion — Jay Alammar](https://jalammar.github.io/illustrated-stable-diffusion/)** · 入门阅读 · 英文

  以早期 Stable Diffusion 为例，解释加噪、预测噪声、逐步去噪、潜空间与文本条件。

- **[Diffusion Explainer](https://poloclub.github.io/diffusion-explainer/)** · 交互演示 · 英文

  观察文本编码、去噪和图像解码流程，比较提示词与生成参数的影响。

- **[The Annotated Diffusion Model — Hugging Face](https://huggingface.co/blog/annotated-diffusion)** · 进阶选读 · 英文

  将 DDPM 的数学推导与 PyTorch 实现对应起来，适合希望进一步理解公式和实现的同学。

## GAN：生成对抗网络

- **[Understanding Generative Adversarial Networks — Joseph、Baptiste Rocca](https://towardsdatascience.com/understanding-generative-adversarial-networks-gans-cd6e4651a29)** · 入门阅读 · 英文

  从简单随机分布到复杂数据分布，解释引入判别器和对抗训练的动机；建议先读图解部分。

- **[Google：生成对抗网络课程](https://developers.google.com/machine-learning/gan?hl=zh-cn)** · 补充阅读 · 中文

  分节介绍生成器、判别器、损失函数和训练问题，重点阅读原理部分。

- **[GAN Lab](https://poloclub.github.io/ganlab/)** · 交互演示 · 英文

  用二维点分布展示交替训练，观察生成分布、判别边界与梯度的变化。
