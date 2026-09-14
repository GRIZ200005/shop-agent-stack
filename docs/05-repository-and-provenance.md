# 仓库建立、来源与公开发布

日期：2026-09-14。当前状态：本地目录尚未初始化 Git，未绑定远程仓库。本文记录操作步骤，不表示已完成仓库创建。

## 1. 推荐流程

在个人 GitHub 账号新建独立私有仓库 `aster-commerce`，不使用公开项目的 Fork 按钮作为私有开发入口。GitHub 公开仓库的 fork 保持公开，独立新仓库适合先私有后公开的开发流程。

GitHub 页面选择 Private；不要初始化 README、.gitignore 或 License，因为本地已有文件。创建完成后复制 HTTPS 仓库地址。

VS Code 使用“打开文件夹”，只打开 `D:\Workspace\Projects\Aster-Commerce`，不要把 Projects 父目录初始化或整体上传。Git 跟踪的是此目录中的文件，VS Code 只是操作入口。

在 VS Code 的 PowerShell 终端执行以下步骤，先把用户名和邮箱占位符改成自己的信息：

```powershell
Set-Location 'D:\Workspace\Projects\Aster-Commerce'
git init -b main
git config user.name "YOUR_PERSONAL_NAME"
git config user.email "YOUR_GITHUB_NOREPLY_EMAIL"
git config --get user.name
git config --get user.email
git add README.md .gitignore AGENTS.md docs
git diff --cached --stat
git diff --cached
git commit -m "docs: initialize Aster Commerce project plan"
git remote add origin https://github.com/YOUR_USERNAME/aster-commerce.git
git remote -v
git push -u origin main
```

GitHub 的 noreply 邮箱从个人 Settings -> Emails 复制，不自行猜测格式。上面配置仅作用于本仓库。首次推送按 Git/VS Code 提示在浏览器登录个人账号；不要将密码或 token 写进 remote URL 或提交文件。

以后通过 VS Code Source Control 查看差异、暂存、Commit、Push。初始化和绑定只做一次；日常不必反复 clone 或添加 remote。

另一种方式是直接在 VS Code Source Control 使用 Publish to GitHub 并选择私有仓库，前提是没有先在网页创建同名远程。两种创建方式选一种即可。

## 2. 从第一天隔离材料

私有仓库也不存放与本项目无关的组织内部材料。禁止迁入私有参考工程的 .git 历史、内部域名/IP、账号、密钥、绝对路径、截图、专有提示词、业务文档、日志或客户数据。代码注释、配置、测试 fixture、文档属性和提交作者信息也在检查范围内。

学习通用设计后独立实现。仅改名称不构成重新实现，也不能证明有权发布。公开许可代码的归属标注应保留，不能以“去除元数据”为由删除合法版权信息。

.gitignore 已排除本地凭据、依赖、日志、数据库文件、生成数据和编辑器配置，但它既不是内容扫描器，也不能清除已经提交过的历史。

每次提交前检查暂存文件和差异；公开前检查所有将发布的分支与标签历史、截图/附件、构建产物、发布包和配置。若凭据误入历史，先撤销/轮换，再处理历史；删除工作区文件不等于历史消失。

## 3. mall 来源与许可证

核对的上游：[macrozheng/mall](https://github.com/macrozheng/mall)。当前 LICENSE 为 [Apache License 2.0](https://github.com/macrozheng/mall/blob/master/LICENSE)。接入时再次核对固定提交以及实际引入的其他组件/素材许可证。

接入时记录：upstream URL、commit/tag、引入目录、原始功能、改动范围和验证情况。目前尚未引入上游代码，README 应使用“计划基于”，不能描述为已经完成改造。

分发 mall 衍生代码时应：

- 附带 Apache-2.0 许可证全文。
- 保留适用的原版权、署名及其他相关声明。
- 对修改文件添加显著修改说明；Git commit 记录作为补充。
- 如果实际引入版本包含 NOTICE，按协议保留相关声明。
- 对新增代码与上游代码区分来源，不宣称全部从零自研。

README 致谢不能代替这些要求。建议新增代码也采用 Apache-2.0 以简化管理，但本轮未替用户添加最终 LICENSE 或选择版权署名；后续接入上游前统一落实。其他前端、数据、图片和依赖按各自许可证处理。

可用的未来 README 说明（实际接入后调整为真实状态）：

> 本项目基于 macrozheng/mall 的公开版本进行二次开发。上游提供商品、会员、订单及后台管理等基础能力。本项目新增智能售后工作流、受控 Agent 工具接入、政策检索、三侧交互及评测机制。上游代码遵循 Apache-2.0，具体来源、版本和改动见项目来源清单。

## 4. 参考

- [GitHub 创建仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [GitHub fork 可见性](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-permissions-and-visibility-of-forks)
- [VS Code Git 入门](https://code.visualstudio.com/docs/sourcecontrol/quickstart)
- [Git 提交邮箱设置](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)
