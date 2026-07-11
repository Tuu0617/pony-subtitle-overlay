# Pony-Subtitle-Overlay

<p align="center">
  <img src="assets/pony01.jpeg" alt="Pony Subtitle Overlay" width="1000">
</p>

为 B 站番剧页面加载本地字幕的 Tampermonkey 用户脚本。

最初为《小马宝莉：友谊的魔法》制作，目标是在保留 B 站官方画质、音质、中文原字幕和弹幕的同时，额外叠加英文字幕。

字幕资源从公开字幕站 [YayPonies](https://yayponies.no/) 获取。

> 当前版本主要适配 B 站番剧播放页，后续可扩展到更多站点和字幕格式。

## 功能

- 在 B 站番剧页面叠加本地 `.srt` 字幕
- 保留 B 站原播放器、弹幕、宽屏、网页全屏和浏览器全屏
- 支持单集字幕临时加载
- 支持整季字幕批量导入
- 自动识别当前季数和集数并匹配字幕
- 整季字幕持久化保存在浏览器 IndexedDB 中
- 支持字号、位置、显示状态和时间偏移调节
- 时间偏移步长为 `0.2` 秒
- 自动合并 SRT 文件中的强制换行
- 已在 Chrome 和 Edge 上测试

## 工作原理

脚本不会替换 B 站播放器，也不会重新加载视频。

它会：

1. 获取页面中的 `<video>` 元素；
2. 在原播放器上方创建一个独立字幕层；
3. 读取本地 SRT 文件；
4. 根据 `video.currentTime` 显示对应字幕；
5. 将整季字幕正文保存到 IndexedDB；
6. 根据当前页面的季数和集数自动加载对应字幕。

因此，弹幕和 B 站原有播放器功能可以继续正常使用。

## 安装

### 1. 安装脚本管理器

推荐使用 Tampermonkey。

支持的桌面浏览器包括：

- Google Chrome
- Microsoft Edge
- Brave
- 其他 Chromium 浏览器

安装后，请在扩展详情页开启：

- 允许用户脚本
- 对 `bilibili.com` 的网站访问权限

### 2. 安装本脚本

下载仓库中的：

```text
bilibili-pony-subtitle-overlay.user.js
```

然后：

- 直接拖入浏览器安装；或
- 打开 Tampermonkey 管理面板，新建脚本并粘贴代码。

安装完成后，刷新 B 站番剧页面。

## 使用方法

### 临时加载单集字幕

1. 打开 B 站番剧播放页；
2. 点击浏览器右上角的 Tampermonkey 图标；
3. 选择“临时加载单集 SRT”；
4. 在页面右上角出现的临时按钮中选择字幕文件。

这种方式只对当前页面临时生效。

### 导入整季字幕

1. 准备整季 SRT 字幕文件；
2. 打开任意一集 B 站番剧页面；
3. 点击 Tampermonkey 图标；
4. 选择“导入整季 SRT（多选）”；
5. 在文件选择器中一次选中整季字幕；
6. 导入完成后，脚本会自动匹配当前集；
7. 切换下一集时，脚本会自动加载对应字幕。

整季字幕会保存在当前浏览器的 IndexedDB 中。刷新网页或关闭浏览器后仍然保留。

## 字幕文件命名

为了自动匹配，字幕文件名需要包含季数和集数。

推荐格式：

```text
01x01.srt
01x02.srt
01x03.srt
```

或：

```text
S01E01.srt
S01E02.srt
S01E03.srt
```

也支持：

```text
Season 1 Episode 1.srt
第1季第1集.srt
```

脚本会将这些格式统一转换为类似：

```text
s01e01
```

的内部索引。

如果字幕文件名中无法识别季数和集数，该文件会被跳过。

## 油猴菜单

```text
📚 导入整季 SRT（多选）
📂 临时加载单集 SRT
🔄 自动匹配当前集
🔍 字号增大
🔎 字号减小
⬆️ 字幕上移
⬇️ 字幕下移
⏪ 字幕提前 0.2 秒
⏩ 字幕延后 0.2 秒
👁 显示／隐藏字幕
ℹ️ 字幕库与当前状态
🗑 清空整季字幕库
♻️ 恢复默认显示设置
```

字号、位置、时间偏移和显示状态会保存在浏览器本地。

## 字幕存储说明

脚本使用两种浏览器存储。

### localStorage

用于保存：

- 字号
- 字幕位置
- 时间偏移
- 显示状态

### IndexedDB

用于保存：

- 字幕文件名
- 季数和集数
- 完整 SRT 字幕正文
- 更新时间

字幕数据只保存在本地浏览器中，不会上传到服务器。

以下情况可能导致字幕库丢失：

- 清除 `bilibili.com` 的网站数据
- 点击“清空整季字幕库”
- 卸载浏览器并删除用户数据
- 更换浏览器或电脑
- 使用无痕模式后关闭窗口

## 当前适配范围

当前主要适配：

```text
https://www.bilibili.com/bangumi/play/ep*
https://www.bilibili.com/bangumi/play/ss*
```

普通视频页和其他视频网站暂未作为主要适配目标。

## 字幕来源

本项目不内置字幕，也不提供视频资源。

用户需要自行准备合法来源的 `.srt` 字幕文件。

《小马宝莉：友谊的魔法》的英文字幕可以从公开字幕站获取，例如 YayPonies。

请遵守字幕来源网站的使用条款和版权要求。

## 兼容性

已测试：

- Chrome
- Edge

理论上也可运行于：

- Brave
- Vivaldi
- Opera
- Firefox

不同浏览器中的 Tampermonkey 菜单入口和扩展权限设置可能略有差异。

## 已知限制

- 当前主要支持 `.srt` 格式
- 字幕自动匹配依赖文件名中的季数和集数
- 不同片源可能存在时间轴偏移，需要手动微调
- B 站网页结构更新后，播放器选择器可能需要调整
- 浏览器之间不会自动同步字幕库

## 隐私

本脚本：

- 不读取账号密码
- 不上传字幕文件
- 不收集浏览记录
- 不向外部服务器发送字幕内容
- 不修改 B 站视频流

所有字幕内容均保存在用户本地浏览器中。

## 后续计划

- 支持 WebVTT
- 支持 ASS/SSA
- 支持拖拽导入
- 支持字幕库导入导出
- 支持更多 B 站页面
- 支持更多视频网站
- 支持中英双字幕样式配置
- 支持按番剧单独保存时间偏移
- 支持英文标题与集数映射

## 贡献

欢迎提交 Issue 或 Pull Request。

提交问题时，请尽量提供：

- 浏览器名称和版本
- Tampermonkey 版本
- B 站页面地址
- 字幕文件命名方式
- Console 报错信息
- 问题截图

## 致谢

特别感谢 [YayPonies](https://yayponies.no/) 长期整理和维护《小马宝莉》相关英文字幕资源。

本项目本身不内置字幕，用户仍需自行获取并遵守字幕来源网站的使用条款与版权要求。

## License

MIT License

---

# English

A Tampermonkey userscript that overlays local subtitles on Bilibili bangumi pages while preserving the original player, danmaku, video quality, audio quality, and built-in subtitles.

Originally created for *My Little Pony: Friendship Is Magic*.

## Main features

- Load local SRT subtitles
- Preserve Bilibili danmaku
- Import a full season of subtitle files
- Automatically match season and episode
- Persist subtitle contents in IndexedDB
- Adjust font size, position, visibility, and timing offset
- Support normal mode, wide mode, web fullscreen, and browser fullscreen
- Tested on Chrome and Edge

## Acknowledgements

Special thanks to [YayPonies](https://yayponies.no/) for maintaining and organizing English subtitle resources for *My Little Pony*.

This project does not bundle subtitle files. Users must obtain subtitles separately and follow the source site's terms and copyright requirements.
