# 我的博客

一个轻量的静态博客：文章用 Markdown 写，Cloudflare Pages 负责构建和加速，
在浏览器里用 [Pages CMS](https://app.pagescms.org) 写文章，**不用碰命令行**。

## 目录结构

```
content/posts/     文章（一篇一个 .md 文件）
content/about.md   「关于」页面
site.config.json   站点标题、描述、作者、域名、导航
src/style.css      样式
build.mjs          构建脚本（把 Markdown 生成静态网页到 dist/）
public/            静态资源（图片等，原样复制；上传的图片存在 public/media/）
.pages.yml         Pages CMS 的后台配置
```

## 一次性搭建（只需做一次）

### 第 1 步：把代码放到 GitHub

1. 登录 [github.com](https://github.com)，右上角 **+ → New repository**；
2. 名称随便起（例如 `my-blog`），选 **Private** 或 Public 都行，**不要**勾选 "Add a README"，点 **Create repository**；
3. 在新仓库页面点 **uploading an existing file**；
4. 把本项目文件夹里的**所有文件**（含 `content`、`src`、`public` 等文件夹）拖进去，点 **Commit changes**。

> 提示：`node_modules` 和 `dist` 不要上传（`.gitignore` 已经排除了，拖拽时跳过即可）。

### 第 2 步：连到 Cloudflare Pages

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**；
2. 授权 GitHub，选中刚才的仓库，点 **Begin setup**；
3. 构建设置填：
   - **Framework preset**：`None`
   - **Build command**：`npm install && npm run build`
   - **Build output directory**：`dist`
4. 点 **Save and Deploy**。等 1～2 分钟，会出现一个 `*.pages.dev` 网址，能打开就成功了。

### 第 3 步：绑定你自己的域名（可选）

在 Pages 项目的 **Custom domains** 里添加域名即可（域名需已在你 Cloudflare 账号里）。

### 第 4 步：开通发布后台（Pages CMS）

1. 打开 [app.pagescms.org](https://app.pagescms.org)，**Sign in with GitHub**；
2. 按提示 **Install GitHub App**（允许它访问你刚建的仓库）；
3. 选择该仓库，它会自动读取 `.pages.yml`，左侧就会出现「文章」「关于页面」「站点设置」。

## 以后怎么发文章

1. 打开 [app.pagescms.org](https://app.pagescms.org)，进入你的仓库；
2. 左侧 **文章 → 新建**；
3. 填标题、日期、正文（可以直接插图）；
4. 点**保存** → 自动提交到 GitHub → Cloudflare Pages 自动重建 → **约 1 分钟后线上更新**。

草稿：把「草稿」开关打开即可，草稿不会出现在网站上。

## 改站点名称 / 作者 / 域名

在 Pages CMS 的「站点设置」里改，或者直接编辑 `site.config.json`。
> 绑定域名后，记得把 `site.config.json` 里的 `url` 改成你的正式网址（用于 RSS 和站点地图）。

## 本地预览（可选，给维护者用）

```bash
npm install
npm run build
npm run serve        # 打开 http://localhost:4321
```
```
